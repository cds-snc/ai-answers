# Partner dashboard — "Run eval analysis" feature

**Status:** implemented (v1) — pending prompt-wording review and a live run to
measure cost/duration
**Owner:** Lisa Fast
**Written:** 2026-07-10

A "Run eval analysis" section at the bottom of the Partner dashboard that analyzes
the **human expert evaluations** in the currently applied filter scope and surfaces
patterns for the evaluator team: which program areas collect errors or
needs-improvement scores, what the low-score explanations indicate, whether
content issues share a pattern, EN vs FR differences, and whether any evaluator
scores differently from the rest.

AI auto-evaluations are **out of scope** for v1 — a separate analysis for them
comes later.

## Decisions already made

| Question | Decision |
|---|---|
| Program taxonomy | **Emergent program groupings derived by the LLM** from the questions/answers. The programs/actions seed CSV (`seed-programs-actions-ideas.csv`, formerly `LF services actions ideas.csv`) is *seed vocabulary/ideas*, not a fixed taxonomy. `referringUrl` and `citationUrl` are good clues for program grouping — include them in the classification input. |
| Model | Default model via the existing agent factory (there will always be a default). No new model setting. |
| Evaluator anomaly visibility | Show to everyone who can run the analysis (signed-in admin/partner — realistically the team lead). Evaluator emails are fine to display. |
| Volume guardrails | Min **20** evals to run; max **200** (was 500 — reduced to watch API cost/duration; revisit later). |
| Report language | Narrative generated **in the dashboard language only**. Switching languages requires re-running — consistent with the rest of the app. |
| History | Keep a **visible list of past analyses** per institution. PDF export is a wanted follow-up (v1.1). |
| Gating | Run button disabled until an **institution (department)** filter is applied. |

## UX flow

1. New section at the **bottom of `PartnerDashboard.js`**: heading + Run button +
   past-analyses list.
2. No institution applied → Run button disabled with a short explanatory note.
3. Institution applied → a lightweight **pre-flight count** runs (human evals
   matching current filters):
   - `< 20` → warning: not enough evaluations to analyze.
   - `> 200` → warning: too many for one analysis — narrow the date range.
   - otherwise → Run enabled, label shows the count ("Analyze N evaluations").
4. Click Run → analysis record created (`status: running`), UI polls and shows
   progress (classification is chunked, so progress is real: `x / N classified`).
5. On completion the report renders in place; the run is added to the
   past-analyses list. Selecting a past run re-displays its stored report
   (no re-run, no LLM cost).

The analysis honours **whatever filters are applied** (institution + date range +
userType etc.) — same filter contract as the metrics endpoints.

## Data scope

Human expert evals only: aggregate from `Chat`, `$unwind` interactions, match
`interactions.expertFeedback` exists (human feedback lives at
`interaction.expertFeedback`; AI auto-evals live separately at
`interaction.autoEval` — clean separation, no type filtering needed).
Reuse `getChatFilterConditions` with `basePath: 'interactions'`, `userField:
'user'` — same shape as `api/eval/eval-dashboard.js`.

Per eval row, collect: question (redacted), answer sentences, citation URL,
`referringUrl`, page language, department, expertFeedback (all sentence scores +
explanations + contentIssue/harmful flags, citationScore/explanation,
answerImprovement, expertEmail, createdAt), interaction createdAt, chatId.

## Analysis design — three tiers

### Tier 1 — deterministic stats (computed in JS, no LLM)

**Don't duplicate the dashboard.** The partner dashboard already shows expert
category counts with EN/FR splits (`metrics.expertScored.<cat>.{total,en,fr}`),
accuracy by language, content-issue counts, and harmful counts. The analysis
does **not** re-display those. Note: the dashboard quality bar mixes expert+AI;
this analysis is human-only, so its internal numbers can legitimately differ —
the report states its own N.

New stats this feature computes (input to the report + the insight pass):

- **Per-evaluator table**: eval count, mean totalScore, % perfect (100),
  % needs-improvement, % error, % with citation deduction — vs the group rate.
  Anomaly flag on a simple difference-of-proportions threshold; with 20–200
  evals, keep it plain and let the narrative caveat small per-evaluator counts.
- **EN vs FR** (human-only): mean totalScore + category rates per language, with
  a small-sample caveat when one language is thin (Trial 4: FR was ~12%).
- **Content-issue rows** gathered with their explanations (feeds Tier 3).
- **Low-score rows** (totalScore < 100) gathered with all their explanation
  texts, citation explanations, and answerImprovement (feeds Tier 3).

### Tier 2 — LLM program classification (chunked)

Tag each evaluated Q&A with an **emergent program group** and an **action**
(Apply, Check status, Pay, Sign in, …). Inputs per row: question, answer (first
sentence or two), **citationUrl and referringUrl** (strong program clues).
Program groups name the **program/subject** (the thing — "Canada child
benefit"), never the activity ("Updating address with CRA") — the action is
the second, separate dimension, and the two are **combined for display**
("Canada child benefit — Change my contact information").

- Two-pass approach for stable grouping: first call proposes the program-group
  set from a sample of the questions (seeded with the programs/actions
  vocabulary as *examples of the granularity wanted*, not as a closed list);
  subsequent chunked calls (~20 rows each) assign every row to one of the
  proposed groups (+ "Other") and an action (+ "Other").
- 200 evals ≈ 10–11 calls. Store per-row tags on the analysis doc.
- Output feeds the **combined program—action × score cross-tab**: eval count and
  % non-perfect per combined group; call out "always perfect" groups too.
  Groups with **fewer than 2 evaluations are dropped from the table** (one
  evaluation is an anecdote, not a pattern) and reported in aggregate as a
  one-line note.

### Tier 3 — LLM insight pass (one call)

One synthesis call, in the **dashboard language**, given: Tier 1 stats, the
Tier 2 cross-tab, and the raw explanation texts (low-score + content-issue
rows). Produces only:

- What the low-score explanations indicate (themes, each with a count and 1–2
  example quotes). A theme must cover at least **max(2, 20% of the non-perfect
  rows)** — asked of the model in the prompt AND filtered on its output; rarer
  observations are anecdotes and are left out entirely.
- A 1–2 sentence content-issue pattern note (empty when there are no flags).

No per-table narrative paragraphs (program patterns, EN/FR commentary, evaluator
commentary) — the tables carry that information themselves. The prompt
instructs the model to ground every claim in the supplied numbers — no
invented rates.

## Report layout (stored, re-renderable)

1. **Header** — N evals analyzed, institution, date range, run date, run by.
   No summary paragraph — the tables and themes carry the findings.
2. **Scores by program and action** — one combined table (count, % non-perfect)
   with always-perfect groups highlighted, a note for skipped
   single-evaluation groups, and per group one **example chatId link** (a
   non-perfect row when there is one) opening review mode in a new tab so
   evaluators can explore a real conversation behind the numbers.
3. **What the explanations say** — themed narrative with counts + quotes
   (themes below the minimum count are omitted).
4. **Content issues** — count + pattern note; the card is hidden when the
   count is 0.
5. **EN vs FR** — small table, no narrative.
6. **Evaluators** — per-evaluator table + anomaly flags, no narrative.
   Titled "Evaluators" (not "consistency") and without a "vs others" delta
   column — the delta reads as a ranking of people, which is more sensitive
   than useful; a manager can derive divergence from the shown counts/rates.
   The internal delta still drives the Review flag.

## Architecture

### Backend

- **Model `models/evalAnalysis.js`** — `{ department, startDate, endDate,
  filters (raw filter snapshot), language, status: 'running'|'classifying'|
  'synthesizing'|'complete'|'error', progress: { classified, total },
  evalCount, stats (Tier 1), rowTags (Tier 2 per-row program/action),
  crossTab, insights (Tier 3 narrative sections), requestedBy, error,
  timestamps }`.
- **Endpoints (`api/eval/`)**, all `withProtection(handler, authMiddleware,
  partnerOrAdminMiddleware)`:
  - `eval-analysis-precheck.js` — GET; count human evals for filters →
    `{ count, min, max }` (UI applies the 20/200 gates; server re-checks on
    create).
  - `eval-analysis-run.js` — POST; validates count and creates the doc
    (status `running`), nothing else.
  - `eval-analysis-advance.js` — POST; advances the run by exactly one step
    (snapshot + Tier 1 + program proposal → one classification chunk → synthesis).
    **Chunk-per-request** (Vercel-safe): the client drives it in a loop until
    `complete`/`error`. (Same client-driven continuation spirit as the existing
    chunked eval processing.)
  - `eval-analysis-get.js` — GET by id → stored doc minus the internal rows
    snapshot (also used to re-display past runs).
  - `eval-analysis-list.js` — GET by department → recent runs
    `[{ _id, dateRange, evalCount, status, createdAt, requestedBy }]`.
- **Service `services/EvalAnalysisService.js` (server-side)** — owns the
  pipeline: fetch rows, Tier 1 stats, chunked Tier 2, Tier 3 synthesis, doc
  updates. LLM calls via `AgentOrchestratorService.invokeWithStrategy` with the
  default agent from the existing factory.
- **Strategies** — `agents/strategies/evalAnalysisClassifyStrategy.js` and
  `agents/strategies/evalAnalysisInsightsStrategy.js` (buildMessages + parse,
  same pattern as `rankerStrategy`). ⚠️ These contain new prompt text —
  **flag the wording to the prompt maintainers for review** before shipping.
  They are new files, not edits to `agents/prompts/`, but same care applies.
- **Seed vocabulary** — convert `seed-programs-actions-ideas.csv` (formerly
  `LF services actions ideas.csv`) to
  `api/data/programActionSeeds.js` (programs by department + global action list
  with synonyms; framed as **programs, not services** — programs have clear
  accountability and the crisper concept keeps LLM groupings consistent across
  runs). Used only as example vocabulary inside the classify strategy.
  Not under `agents/prompts/` and not under root `config/` (React build rule
  irrelevant here since it's server-only, but keep it out of `config/` anyway).

### Frontend (house layering)

- **Service** `src/services/EvalAnalysisService.js` — precheck / run / drive /
  get / list calls.
- **Hook** `src/hooks/admin/useEvalAnalysis.js` — precheck state, run + drive
  loop (poll/advance until complete), current report, past-runs list,
  loading/error.
- **Components** `src/components/admin/dashboard/`:
  - `EvalAnalysisSection.js` — section shell: gate note, precheck warnings, Run
    button, progress, past-runs list, report container. Rendered at the bottom
    of `PartnerDashboard.js`, receiving `appliedDepartment` + the applied
    filters (PartnerDashboard already tracks `appliedDepartment`; it will also
    need to keep the last applied filters object in state to pass down).
  - `EvalAnalysisReport.js` — renders a stored report (tables + narrative).
    Tables follow the shared card chrome; numbers through
    `formatNumber`/`formatPercent`/`formatDecimal`.
- **Locales** — new `partnerDashboard.evalAnalysis.*` namespace, EN + FR
  together; run `node scripts/find-dead-locale-keys.cjs` (0 parity gaps).
  Narrative content is LLM-generated in the dashboard language (dynamic content
  — exempt from locale keys).

## Guardrails & edge cases

- Min 20 / max 200 enforced both in UI (precheck) and server (run endpoint).
- If a run dies mid-way (`status: running` but stale), the list shows it as
  incomplete; a new run can always be started. No resume logic in v1.
- Evals with missing/blank totalScore are excluded from score stats but counted
  and noted in the report header.
- Department is required, but the analysis must tolerate rows whose
  `context.department` differs from the filter (filter logic decides scope).
- LLM chunk failure → retry once, then mark the affected rows `program: null` and
  continue; report notes how many rows were unclassified. Synthesis failure →
  `status: 'error'` with stored Tier 1/2 results still viewable.

## v1.1 follow-ups (not in v1)

- **PDF export** of a report.
- Analysis of **AI auto-evaluations** (separate run type).
- Cost/duration telemetry to decide whether the 200 cap can rise.

## Implementation order

1. `models/evalAnalysis.js` + seed data module from the CSV.
2. `services/EvalAnalysisService.js` — row fetch + Tier 1 stats (unit-testable
   pure helpers; vitest tests first for evaluator/EN-FR stats).
3. Strategies (classify, insights) + orchestrator wiring. **Prompt wording
   review by maintainers here.**
4. Endpoints (precheck, run/drive, get, list) + `__tests__` for the API.
5. Frontend service + hook.
6. `EvalAnalysisSection` + `EvalAnalysisReport` + locale keys (EN+FR) +
   PartnerDashboard wiring.
7. End-to-end pass on staging data; watch cost/duration of a 200-eval run.

## Reference material

- Trial data sample: `.../CDS/AI/trial/Trial 4/t4-evals-only-csv.csv` (438 human
  evals: ~85% score 100; tail of 90–96 needs-improvement where explanations
  carry the signal; citation-only deductions; 2 of 8 evaluators did 87% of
  evals; FR ≈ 12% of volume).
- Seed vocabulary: `.../CDS/AI/seed-programs-actions-ideas.csv` (programs for
  CRA/ESDC/IRCC + global action list with synonyms).
- Dashboards guide: `docs/coding-agent-docs/dashboards.md`.
- Eval lifecycle: `docs/architecture/evaluation-service.md`.
