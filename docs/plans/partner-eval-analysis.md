# Partner dashboard — eval analysis (v2 redesign)

**Status:** v2 redesign in progress. PR 1 (coverage table, `analysis-update`)
and PR 2 (most-used evaluations, `eval-reuse-lists`) are merged. PR 3 (Part B
simplification) is on `eval-analysis-v2`. For the v1 design it replaces, see
[What v1 did](#what-v1-did).
**Owner:** Lisa Fast
**Written:** 2026-07-10 (v1) · **Rewritten:** 2026-11-15 (v2)

## Why redesign

v1 was designed before two things shipped:

1. **Program/action classification of every question** (background step after
   each answer, stored on `context.program` / `context.action` — see
   [program-action-classification.md](./program-action-classification.md)).
   v1's Tier 2 was built to classify evals itself with chunked LLM calls. That
   cost is the only reason for the 20/200 volume gates, the client-driven
   advance loop and the progress bar. It now only runs for rows from before the
   classifier existed.
2. **Eval-informed answering in production.** The production graph
   (`GenericWithQAGraph`, named by the `workflow.default` setting) injects up to
   three human-rated past Q&As (same department, similarity ≥ 0.75, score ≤ 100,
   evaluated within 365 days unless `neverStale`) into each new answer.
   Non-perfect examples carry the expert's sentence comments as mistakes to
   avoid. Each answer records what it was given in `context.qaMatches`
   (**in production since late August 2026**).

So human evaluations are no longer only a quality measure. They are inputs to
future answers. The evaluator team's most useful questions are now about that:
*where are we missing evaluations, which of our evaluations get used, and are
the ones that get used good examples?* v1 answers none of these, because it
only looks at evaluated rows and knows nothing about reuse.

## Decisions

| Question | Decision |
|---|---|
| Scope | Human expert evaluations only. **AI auto-evaluations stay out of scope.** |
| LLM classification in the analysis (v1 Tier 2) | **Remove.** Use stored `context.program`/`action` only. Rows without a program show as "Not yet classified". |
| Historical program backfill | **Skipped** (decided 2026-11-15). Older questions stay unclassified; the coverage table mostly matters for recent ranges. (This was only ever about program classification — reuse data can't be backfilled, since `qaMatches` wasn't recorded before late August 2026.) |
| Actions in the coverage table | **One "Actions asked about" column per service**, most frequent first — not a program × action breakdown. `''`, `unknown` and `Other` are left out. Shows at most 3, skips actions asked only once (unless that's all there is), then "and N more". |
| Volume gates (min 20 / max 200) | **Remove both.** The statistics are database aggregation and need no cap. A small-sample note replaces the minimum. Only the LLM insights call is limited, by the number of rows it is sent. |
| Institution gate | The deterministic section follows the dashboard filters like every other card (no gate). The insights button still requires an institution, because themes across departments aren't actionable for one team. |
| Insights prompt (Tier 3) | Kept. **Wording was reviewed by the prompt maintainers**, and the stale "not reviewed" note was removed. PR 3 changed one sentence, approved by a maintainer (2026-11-18): the model no longer gets the per-program cross-tab, and is told it may receive a subset (errors first, then the most recent). |
| Scores by service table in the report | **Dropped for new runs** (decided 2026-11-18). The plan had Part A replace it, but the coverage table no longer shows scores; quality is left to the themes. Old v1 reports still display their stored table. |
| EN vs FR and evaluator tables | **Stay in the Part B report** (decided 2026-11-18), computed over every evaluation in scope. Moving them into Part A was dropped to keep PR 3 a simplification only. |
| Reuse window | Reuse metrics only count answers from **late August 2026** onward (when `qaMatches` started being saved). The UI states that start date. Earlier ranges show "no reuse data" rather than zero. |
| Report language | Unchanged: insights are generated in the dashboard language only. |
| Evaluator table | Kept as is (titled "Evaluators", no "vs others" column). |

## What v2 looks like

Two parts at the bottom of `src/components/admin/PartnerDashboard.js`, below
the existing eval-informed card.

### Part A — "Evaluation coverage and use" (live, no LLM)

It renders with the dashboard's applied filters, like every other card. There
is no Run button and nothing is stored. It shows one table **by program**
(program — action drill-in is a later option), with the columns below.

| Column | Source | Tells evaluators |
|---|---|---|
| Questions | all normal-answer interactions in scope, `context.program` | demand |
| Usable evals (shown as "Expert evaluations") | **all** human evals for the service and department evaluated within 365 days (or `neverStale`), with a total score — **not limited by the date range or other filters**, because retrieval isn't | what retrieval can actually see today |
| Answers that used an eval | interactions with a `qaMatches` entry | reuse volume |
| Expiring soon | usable evals that pass 365 days within the next 60 days (same all-dates scope) | where to re-evaluate |
| Actions asked about | `context.action` per program, most frequent first | what people want to do |

Column order on the card: service, actions, questions, usable evals, answers
that used an eval, expiring soon (last). The card is collapsed by
default (`CollapsibleCard`) because the table is long.

**Dropped after review (2026-11-18):** "Eval coverage %" (evals ÷ questions —
both numbers are already in the row, and it read as overlapping with "in use")
and "% non-perfect" (quality is covered by the eval analysis below; the
`scoredEvals`/`nonPerfectEvals` fields were removed from the endpoint too).
"Human evals" in the date range was dropped as well: with the 7-day default it
was near zero and said nothing about what retrieval can use, so it pointed
partners at the wrong services. Usable evals is the only evaluation count, and
it is labelled "Expert evaluations".

Sort by questions, descending, top 10 (the volume chart shows 25; cut to 10 on 2026-11-18 because the table is wide). Busy services
with few evaluations are where to evaluate next — the sort and the questions and
evaluations columns show that; there is no separate highlight in PR 1 (thresholds would be
arbitrary). The per-service example chat link was dropped from PR 1: the reuse
lists in PR 2 link to real evaluations instead.

**Known limit:** usable evals don't check whether the evaluation's embedding has
synced to the vector index. An evaluation whose sync failed is counted but can't
be retrieved. Checking would mean joining the embeddings collection; not worth
it unless sync failures turn out to be common.

**Accessibility (required):** a real `<table>` with caption, `scope="col"`
headers and the service name as `scope="row"` header; a focusable scroll region
named by the caption; em dashes are `aria-hidden` with a spoken equivalent;
English fallback names on the French dashboard carry `lang="en"`; column
definitions are visible text under the table, not tooltips; no inline styles.

One list goes below the table (PR 2, built).

- **Most-used evaluations.** The human evals injected into the most answers in
  the period (top 20, `MOST_USED_EVALS_LIMIT`), showing a review-mode link to
  the evaluated question, service, expert score, times used and evaluation date.
  This is reuse counted from the *eval's* side: unwind `context.qaMatches` and
  group by `interactionId`. Same answers and filters as the eval-informed chats
  list.
- ~~Weak examples in use~~ — **dropped** (decided 2026-11-16). Explanations have
  been required for every deduction since 2026-08-12 (`2495d615`), so missing
  explanations are legacy-only and age out of the 365-day window by about
  August 2027. A wrong citation with no corrected URL is still possible today
  (`expertCitationUrl` is optional) — revisit only if that turns out to matter.

The existing human-only stats from v1 (the EN vs FR table and the evaluators
table) were planned to move into Part A. They stay in the Part B report
instead (see Decisions).

**Out of Part A on purpose:** before/after effect of evals on scores. Evaluated
samples are small and the choice of which chats get evaluated skews them, so
the result would be misleading. Revisit only if volume grows.

### Part B — "What the explanations say" (on demand, one LLM call)

- An institution filter is required. The button has a plain label: the
  planned count would have needed the precheck request, which was removed.
  The report says how many evaluations the model saw instead.
- **One** call to the existing `evalAnalysisInsightsStrategy`. The inputs are
  the computed stats (score categories, EN vs FR, evaluators) and the
  non-perfect and content-issue rows. The per-program cross-tab is no longer
  sent.
- **Input limit, not population limit:** send at most `MAX_INSIGHT_ROWS` (150)
  non-perfect rows and at most 150 content-issue rows. When there are more,
  errors (harmful, answer and citation errors) go first, then the most recent.
  Question and citation text are fetched only for the rows sent. The report
  header says "the findings use N of M" for each list that was cut.
- Theme minimum is unchanged: max(2, 20% of non-perfect rows), asked in the
  prompt and filtered on the output.
- Results are stored as before (an `EvalAnalysis` doc with the insights and the
  filter snapshot) so past runs can be re-displayed without cost. The
  past-runs list stays.
- It is a single request, with no advance loop. The UI shows a running
  message next to the button. If one call proves too slow for the request
  timeout, the fallback is a two-step create/advance, not chunking. **Not yet
  checked on a large department.** The past-runs list refreshes even when the
  request fails, so a run the server finished after a timeout can be found.
  A stored run still `running` shows "In progress" for 10 minutes, then "Did
  not finish".

## Backend changes

**New**

- `api/metrics/metrics-eval-coverage.js` holds the Part A by-program table
  (**PR 1, built**). It reuses `buildProgramScopeStages`, extracted from
  `metrics-programs.js`, so it counts exactly the volume chart's questions, and
  adds the expert-feedback, freshness and `qaMatches` columns. The 365-day
  limit is the shared `EVAL_INFORMED_RECENCY_DAYS` in `src/config/workflows.js`,
  now also used by `GenericWithQAGraph`.
- `api/metrics/metrics-eval-reuse.js` holds the most-used list (**PR 2,
  built**). The aggregation unwinds `context.qaMatches` in scope and ranks by
  `interactionId`, so only the top N ids leave the database; their details come
  from two indexed finds in JS (`qaMatches` stores ids as strings — avoids
  relying on `$toObjectId` on DocumentDB). Evaluations deleted since use are
  dropped.

**Changed**

- `services/EvalAnalysisService.js` collapses to `createAndSynthesize({
  filters, language, requestedBy })` (**PR 3, built**). It aggregates every
  human evaluation in scope (no volume limit) for the stats, picks the rows for
  the model with `selectInsightRows`, then makes one insights call and stores
  the result with an `insightInput` record of how many rows were sent.
- `evalAnalysisInsightsStrategy.js`: the stale note is removed, the cross-tab
  input is gone, and one prompt sentence changed with maintainer approval (see
  Decisions). A test pins the payload fields.
- `api/eval/eval-analysis-run.js` does the whole run in one request and
  returns the finished doc.

**Removed** (PR 3, confirmed with the owner)

- `agents/strategies/evalAnalysisClassifyStrategy.js`
- `api/eval/eval-analysis-advance.js`, `api/eval/eval-analysis-precheck.js`
- The `classifying`/`synthesizing` statuses, `progress`, the stored `programs`
  vocabulary and the full `rows` snapshot on `models/evalAnalysis.js`. Old docs
  stay readable: the report still renders a v1 doc's `crossTab`, and old
  non-terminal statuses show as "Did not finish".
- `rowNeedsClassification`, `buildCrossTab` and the `MIN_EVALS`/`MAX_EVALS`
  constants. `getSeedPrograms`/`ACTION_SEEDS` have other callers and stay;
  eval analysis no longer imports them.

**Database notes (DocumentDB 8)**

- Always `$match` on `Chat.createdAt` before the interactions lookup (done in
  PR 3). The chat match starts one day before the range so a chat that began
  just before it still counts; the exact range applies to
  `interactions.createdAt`.
- Validate the new `buildPipeline` with `explain("executionStats")` on a
  large department and range.
- Validate the `qaMatches` unwind with `explain("executionStats")` on a
  production-sized range.

## Frontend changes

- Service + hook: coverage is an opt-in fetch in `useDashboardMetrics`
  (`includeEvalCoverage`, via `MetricsService.getEvalCoverageMetrics`), like the
  other partner-only cards — same filters, loading and abort handling, no new
  hook. `useEvalAnalysis.js` drops the precheck and drive loop (PR 3, built).
- Components in `src/components/admin/dashboard/`: `EvalCoverageCard.js` for
  Part A (PR 1). `EvalAnalysisSection.js` /
  `EvalAnalysisReport.js` shrink to Part B (PR 3, built). The report drops the
  cross-tab and the row-data table for new runs.
- Locales: new keys under `partnerDashboard.evalCoverage.*`, EN and FR
  together. Remove the dead `tooFew`/`tooMany`/progress keys. Program and
  action names go through the existing display-time FR maps.
- Numbers go through `formatNumber`/`formatPercent`. The section uses the
  shared card chrome and an accessible table.

## TODO — split coverage EN/FR (follow-up PR)

Eval-informed retrieval matches **same language only**, so a service with only
English evaluations has nothing to draw on for French questions — today's
single count per service hides that. Split questions, usable evaluations,
expiring and answers-using-evaluations by `pageLanguage` (the volume chart
already groups `en`/`fr` the same way). Kept out of PR 1 to keep it reviewable.

## PR breakdown

1. **Part A, coverage table** (built): endpoint, card, EN/FR copy, how-to guide
   section, dashboards doc. It stands alone and carries most of the value.
2. **Part A, most-used evaluations** (built): endpoint, card, EN/FR copy,
   how-to guide, dashboards doc. The weak-examples list was dropped.
3. **Part B simplification** (built, `eval-analysis-v2`): one call, input
   limit, removals. The EN/FR and evaluator tables stayed in the report.

Docs in the same PRs: update `docs/coding-agent-docs/dashboards.md` for the new
cards, and the admin how-to guide in `public/content/admin/` if it covers this
section (EN + FR).

## Open questions

- Is the 60-day "expiring soon" window right, or should it match an evaluation
  cadence the team already works to?

## What v1 did

For reference. v1 reports stored before PR 3 still display.

- **Gates:** an institution filter is required. A precheck counts the human
  evals in scope, and a run is only allowed between 20 and 200.
- **Tier 1:** deterministic stats in `services/evalAnalysisStats.js`: an
  evaluator table with a review flag (a perfect-rate delta of more than 20
  points and at least 10 evals), EN vs FR, and content-issue and low-score
  rows.
- **Tier 2:** program — action cross-tab, with groups of fewer than 2 evals
  dropped. It reuses the stored `context.program`/`action`. It falls back to
  chunked LLM classification (`evalAnalysisClassifyStrategy`, 20 rows per call)
  against the department seed list for normal-answer rows without a program.
- **Tier 3:** one insights call (`evalAnalysisInsightsStrategy`) for
  explanation themes and a content-issue note, in the dashboard language.
- **Flow:** the client drives `eval-analysis-advance` step by step
  (snapshot → classify chunks → synthesize). Runs are stored on `EvalAnalysis`
  with a past-runs list per institution.
