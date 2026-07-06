# Eval suites implementation summary (branch: eval-suite-grid)

What this branch adds to the experimental batch system: an Anthropic-style eval
workflow (golden test suites, run-over-run grid, repeat trials), built on the
existing datasets / batches / analyzers machinery without rebuilding it.

Plan doc: [eval-suites-from-experimental-batches.md](eval-suites-from-experimental-batches.md)
— phases 1–3 are built; phase 4 (held-out sets, judge calibration) is not started.

---

## 1. Results drill-down page — see the deviating answers

`/en/experimental/analysis/:batchId` (admin-only, EN + FR routes)

- "View results" button on every run in the Previous runs table
- Summary strip (total / deviations / errors / pass rate), filterable item list
  defaulting to **deviations only**
- Per item: **golden answer and generated answer side by side with word-level
  diff highlighting**, the judge's full structured output (changed facts,
  missing key ideas — generic renderer handles any analyzer's output shape),
  and chat-log buttons that open ChatViewer pre-filled (via localStorage — no
  changes to ChatViewer itself)
- Previous/Next buttons + arrow-key review flow; Esc returns to the list
- Trial column and "Trial n of N" chip when the run used trials

New API: `experimental-batch-items` — paginated, verdict filters
(all / attention / errors), `row` filter for deep links (all trials of one
question), excludes `originalData` to keep payloads small.

## 2. Suite grid page — runs × tests matrix

`/en/experimental/suites/:datasetId`

- Rows = analysis runs of that dataset (oldest first, capped at 30), labelled
  by run label + app version + date
- Columns = questions: `testName` column in the CSV, or Q1…Qn by default;
  optional `caseType` column (control / edge / boundary) shown under the name
- Cells: green (pass) / amber (mixed) / red (flagged) / gray (no result);
  with trials they show **k/n plus a per-trial ✓✗ strip**
- Click any cell → opens that exact item in the drill-down (`?open=<position>`)
- Score column reports **pass^n** ("all trials") and **pass@n** ("any trial")
  when trials > 1
- **Capture runs** (nothing to compare: similar-answer or no-analyzer with no
  golden column and no baseline run) render gray with a "Baseline capture —
  not scored" badge instead of masquerading as a 100% green row
- Navigation loop: Datasets → Suite grid → cell → drill-down → back to Suite
  grid; Analysis page and results page both link to the grid

New API: `experimental-suite-grid` — tests, runs, and verdict cells in one
call. Verdict logic is shared with the UI via `src/utils/experimental/batchItems.js`
so grid and drill-down can never disagree.

## 3. Trials (pass@k)

- `config.trials` (1–8, clamped server-side): each dataset row expands into n
  independent items (`trialIndex`), each with its own pipeline conversation
- **Multi-turn datasets stay correctly threaded within each trial** — rows
  sharing a source chatId share a run chatId per trial
- Analysis page: trials selector with a cost guardrail before running
  ("14 questions × 3 trials = 42 pipeline runs")

## 4. Reference semantics made explicit (golden vs. baseline)

One reference slot (`baselineAnswer`), two sources with different meanings:

| Reference source | Represents | "Flagged" means |
|---|---|---|
| `GoldenAnswer` column in the dataset | Truth (expert-approved) | answer is wrong |
| Baseline run (previous run's answers) | Past behaviour | answer changed |

- Golden column accepted under exact names: `GoldenAnswer`, `goldenAnswer`,
  `baselineAnswer`, `BaselineAnswer`, `baseline` — single shared constant in
  `services/experimental/datasetColumns.js` (mirrored in the analysis page,
  which can't import from services/)
- **Expert scorer now requires a reference** (golden column or baseline run).
  Standalone mode is rejected server-side — it judged answers from the LLM's
  own stale training data with no AI Answers requirements
- **No-analyzer capture runs can baseline any analyzer** — the strict
  analyzer-match rule blocked the natural "capture once, then score against
  it" workflow
- If a dataset has golden answers AND a baseline run is selected, the baseline
  run wins — an amber warning on the analysis page says so before running
- Analyzer descriptions, dataset-type descriptions, and column lists rewritten
  around the concrete setups (golden / baseline run / neither), EN + FR

Recommended workflows:

- **Golden suite**: dataset with `GoldenAnswer`, no baseline, Expert scorer,
  trials ≥ 1
- **Drift watch**: No-analyzer capture run (trials = 1) → "Use as baseline" →
  Similar-answer runs with trials > 1

## 5. Smaller ergonomics

- Datasets page: **Runs count column**; Suite grid button (primary when the
  dataset has runs); optional Category field at upload (partner abbr or
  bias / pii / red-team)
- Dataset upload accepts the batch systems' column names (`redactedQuestion`,
  `QUESTION`, `URL`, …; matching ignores case/spaces/underscores) — batch
  input and export files upload with zero renaming, stated in the upload form
- Run label field ("v2 – tightened citation instructions") — stored on the
  batch, shown as the grid row label
- Server validation errors now surface verbatim in the analysis page UI

## 6. Bug fixes worth flagging (all trials-related, all covered by tests)

1. **Baseline-run matching was positional** — with a trials baseline, Q2's
   reference silently became Q1's trial-2 answer. Now grouped per question,
   first trial wins.
2. **Trials 2+ broke multi-turn threading** — fresh chatId per item instead of
   per conversation-per-trial, so follow-up turns lost their history.
3. **Exports/status sorted by rowIndex only** — trial order was
   nondeterministic; all item sorts now include `trialIndex`.

## Data model changes (all additive, no migrations)

| Model | New fields |
|---|---|
| `experimentalDataset` | `category`, `role` ('training' \| 'held-out' — phase 4 groundwork) |
| `experimentalBatch` | `runLabel`, `config.trials` |
| `experimentalBatchItem` | `trialIndex` |

## Tests

~45 new tests: items API (7), suite grid API (7), batch service (golden alias
mapping, trials expansion + clamping, multi-turn threading, baseline-trials
matching, expert-scorer reference requirement, no-analyzer baselines), word
diff util (11), client service.

## Deliberately not done

- **"Golden Q&A" dataset type** (auto-map `answer` → golden at upload) —
  deferred; the rename-to-`GoldenAnswer` convention stands, documented in the
  upload form
- **`englishAnswer` as a golden alias** — considered and rejected; DB exports
  of scored answers rename their column to `GoldenAnswer` before upload
- **Phase 4**: held-out set enforcement and the judge calibration loop —
  reviewer actions on the drill-down (**accept a "failed" answer as correct**,
  **promote a generated answer to become the new golden answer**, disagree
  with the judge), judge–human agreement tracking, and feeding
  human-overridden verdicts back into the scorer prompt as few-shot examples
