# From Experimental Batches to Anthropic-Style Eval Suites

## Context

The experimental batch system (see `batch-refactor-analysis-batches.md`, now implemented and
extended with datasets) can already:

- store persistent **datasets** (`question-only`, `qa-pair`, `batch-output`), including
  promoting a batch's output into a dataset (`models/experimentalDataset.js`)
- run **generation batches** server-side through the real pipeline (chatId per row)
- run **analysis batches** with one or more analyzers over a dataset
- grade a generated answer against the expert's "perfect" answer via
  `ExpertScorerAnalyzer` (verdict pass/fail, keyIdeasFound/Missing, answer-type
  regression checks) and detect drift via `SimilarAnswerAnalyzer` (changedFacts,
  baselineOnlyFacts, currentOnlyFacts)

This is the machinery of an eval system. What it lacks, compared to the approach in
Anthropic's *Demystifying evals for AI agents* and the Prompting Playbook demo, is the
**workflow layer**:

| Anthropic concept | Status here |
|---|---|
| Small named test suite, each test a distinct failure mode | Datasets exist but rows are anonymous; no per-test names/tags |
| n trials per test (pass@k) | 1 generation per row |
| Grid: prompt/app versions (rows) × tests (columns), pass counts per cell | No cross-run view; `appVersion` is stored but unused |
| Click a failing cell → read the transcript | Excel export only |
| Held-out set to catch prompt overfitting | Not modelled |
| Judge calibrated against human grading | Expert answer is the human standard, but no judge-agreement tracking |

Key design note: our expert-scored golden answer **is** Anthropic's "human grader" — the
gold standard used to calibrate the LLM judge. Nothing needs rebuilding; the phases below
add structure and visibility around what exists.

Anthropic's demo is **not** a single question: it is a training set of 5 named tests
(control, proration, prepaid, billing_error, hotspot), each run n=6 times per prompt
version. Small suites are deliberate — each test earns its place by covering a distinct
failure mode, which keeps n-trial runs affordable and failures interpretable.

---

## Phase 1 — See the deviating answers (highest value, smallest change)

**Goal:** click into any analysis batch and read, side by side, the golden answer vs the
generated answer for every failing/flagged row — without exporting to Excel.

### [NEW] Batch results drill-down page

`src/pages/experimental/ExperimentalBatchResultsPage.js` (+ hook in
`src/hooks/experimental/`, components in `src/components/experimental/`), route
`/:lang/experimental/analysis/:batchId`, admin-only, linked from the batch list.

- **Summary strip:** pass / fail / needs-review / flagged counts per analyzer
  (from `analyzerSummary`), overall pass rate.
- **Filterable item list:** default filter = failures + flagged + needs-review only.
  Columns: rowIndex, question (truncated), verdict, confidence, one-line explanation.
- **Item detail (the core):** two panes —
  - left: golden/expert answer (`baselineAnswer`)
  - right: generated answer (`answer`), with inline word-level diff highlighting
    (adds/removes) so "how different" is visible at a glance
  - below: the judge's structured output — `explanation`, `keyIdeasMissing`,
    `keyIdeasFound`, `changedFacts` table (type / baseline said / current said / impact),
    `baselineOnlyFacts`, `currentOnlyFacts`
  - link `chatId` → ChatViewer for the full pipeline transcript ("read the transcripts")
- Keyboard next/previous through failing items — reviewing 20 failures should take
  minutes, not an Excel session.

### [NEW] API

`api/experimental/experimental-batch-items.js` — GET, paginated items for a batch with
verdict filters. (Items already hold everything needed; this is read-only exposure.)

No model changes in this phase. EN/FR locale keys for all new labels; register the route
slug pair in `src/utils/routes.js`.

---

## Phase 2 — Suites and the version grid

**Goal:** the Prompting Playbook screen — pick a suite, see every run of it as a row,
every test as a column, pass counts in the cells.

### Model additions

- `experimentalDataset.js`: add
  - `category: String` — partner abbrKey (`cra`, `ircc`, …) or cross-cutting
    (`bias`, `pii`, `red-team`, `safety`)
  - `role: { enum: ['training', 'held-out'], default: 'training' }` (used in Phase 4)
- `experimentalDatasetRow.js` (per-row): add
  - `testName: String` — short slug shown as the grid column header (`prepaid`,
    `billing_error`); defaults to `row-{n}` when absent
  - `caseType: { enum: ['control', 'edge', 'boundary'] }` — Anthropic's taxonomy:
    control = must always pass, edge = previously-failed regressions, boundary =
    should escalate/clarify/refuse
  - CSV upload accepts optional `testName` / `caseType` columns; existing files keep
    working.

### [NEW] Suite runs grid page

`src/pages/experimental/ExperimentalSuitePage.js`, route
`/:lang/experimental/suites/:datasetId`.

- Rows: each generation+analysis run of this dataset, labelled with `appVersion`,
  provider/workflow, and date (newest at bottom, like v0→v5).
- Columns: tests (`testName`), grouped by `caseType`.
- Cells: pass count (`k/n` once Phase 3 lands; ✓/✗ until then), green/yellow/red.
- Click a cell → Phase 1 item detail for that test in that run.
- This reuses existing batch/item data — the grid is a query + view, not new execution
  machinery. Populate run rows by querying batches with `config.datasetId = :datasetId`.

### Run identity

- Make `appVersion` required-ish for suite runs (auto-fill from the deployed version)
  and add a free-text `runLabel` ("v2 – tightened citation instructions") so the grid
  rows tell the story of *which change fixed which failure*.

---

## Phase 3 — Repeat trials and pass@k

**Goal:** stop treating a single generation as truth; measure consistency.

- `experimentalBatch.config.trials: Number (default 1, max ~8)`.
- Generation enqueues `trials` items per dataset row; `experimentalBatchItem` gains
  `trialIndex: Number`.
- Analysis grades each trial independently; grid cells become `k/n` with the per-trial
  ✓/✗ strip.
- Report both:
  - **pass@n** — at least one trial passed (capability exists)
  - **pass^n** — all trials passed (behaviour is reliable; this is the one that matters
    for a public-facing service)
- **Cost guardrail:** trials multiply generation + judging cost. This is exactly why
  suites stay small: 15 tests × n=4 = 60 pipeline runs per suite version. Surface the
  projected run count in the UI before starting.

---

## Phase 4 — Held-out sets and judge calibration

**Goal:** trust the numbers.

### Held-out

- Datasets with `role: 'held-out'` appear under a separate tab, excluded from the
  routine suite grid. Run them only when a prompt change is "done" on the training set.
- If training passes climb while held-out stays flat or drops → the prompt is being
  overfitted to the tests (Anthropic's core warning).
- Practical split per partner: when curating, hold back ~⅓ of expert-scored Q/A pairs.

### Verdict revision — accept a "failed" answer

Reviewing real runs shows the judge failing answers that are actually great —
sometimes better than the golden answer (more complete, more precise limits and
dates). The drill-down needs reviewer actions on each item:

- **Accept as correct** — override the judge's verdict for this item. The item
  is recorded as human-passed (`humanReview: { verdict: 'accepted', note,
  reviewedBy, reviewedAt }`), the batch summary and suite grid cell recompute
  to reflect the revised verdict (distinguishable styling so revised cells are
  not mistaken for clean judge passes).
- **Promote to golden** — replace the dataset row's GoldenAnswer with this
  generated answer, so future runs are judged against it. Keep an audit trail
  on the row (previous golden, who promoted, when, source chatId). This is how
  golden suites improve over time instead of fossilizing: when the system
  produces a better answer than the expert baseline, the expert blesses it and
  it becomes the new standard.
- **Judge was wrong (still a fail)** — disagree with a *pass* or record that a
  fail was mis-explained, without accepting the answer (+ optional note).

### Judge calibration ("failures should seem fair")

- Track judge–human agreement rate per analyzer per batch from the review
  actions above. If agreement drops, fix the judge prompt
  (`agents/prompts/judges/ExpertScorerPrompt.js`) before trusting new runs —
  judge-prompt changes go through the prompt maintainers like any other prompt work.
- **Feed overridden verdicts back into the judge.** Human-accepted "fails" are
  exactly the few-shot examples the scorer prompt needs (e.g. a generated
  answer that adds correct limits/dates the golden lacked should pass, not
  fail). Curate a handful of these accepted-despite-fail examples into the
  ExpertScorerPrompt so the judge learns that *more precise and complete than
  golden* is a pass — maintainers select which examples ship.
- Overridden items double as a regression set for testing future judge
  versions: a judge change is only an improvement if it agrees with the human
  verdicts on this set.

---

## Suite design (content, not code)

One **training suite per institutional partner**, curated from expert-scored batches:

- small and deliberate — ~10–25 questions, each covering a distinct failure mode
  observed in production (not "a range of questions" for coverage's sake; Anthropic's
  suite is 5)
- tagged: a few `control` cases (bread-and-butter questions that must never break),
  `edge` cases (each real regression found becomes a permanent test), `boundary` cases
  (should produce `<clarifying-question>`, `<not-gc>`, `<pt-muni>`)
- plus a held-out slice per partner

**Cross-cutting suites** (bias, PII, red-team, safety) differ in grader, not machinery:

- graded by the evaluator analyzers (BiasEvaluator, SafetyEvaluator, RefusalAnalyzer)
  rather than golden-answer comparison — "expected behaviour" (e.g. *must refuse*,
  *must not echo PII*) instead of a perfect answer
- PII is a good candidate for an additional **code-based grader** (deterministic
  pattern check that the answer contains no PII tokens) — Anthropic's guidance is to
  prefer code graders wherever the check is mechanical: cheaper, reproducible, and they
  keep the LLM judge honest

## Implementation order

1. Phase 1 (drill-down) — standalone, immediately useful on every batch already run
2. Phase 2 (suite tags + grid)
3. Phase 3 (trials) — small schema/queue change, big statistical payoff
4. Phase 4 (held-out + calibration)

Each phase is independently shippable and stays inside the experimental isolation rules
(new files under `experimental/`, additive schema fields only).
