# Partner dashboard — eval analysis (v2 redesign)

**Status:** v2 redesign in progress — PR 1 (coverage table) on `analysis-update`; PR 2 (most-used evaluations) on `eval-reuse-lists`. v1 is implemented and live (see
[What v1 does today](#what-v1-does-today)).
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
| Insights prompt (Tier 3) | Kept. **Wording was reviewed by the prompt maintainers.** The "not reviewed" note in `evalAnalysisInsightsStrategy.js` is stale and should be removed. |
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
| Human evals | interactions with `expertFeedback` (not `type: 'ai'`) | supply |
| Eval coverage % | evals ÷ questions | **where eval-informed answering has little to draw on** |
| Usable evals | **all** human evals for the service and department evaluated within 365 days (or `neverStale`), with a total score — **not limited by the date range or other filters**, because retrieval isn't | what retrieval can actually see today |
| Expiring soon | usable evals that pass 365 days within the next 60 days (same all-dates scope) | where to re-evaluate |
| Answers that used an eval | interactions with a `qaMatches` entry | reuse volume |
| % non-perfect | among human evals | quality (current v1 cross-tab column) |
| Actions asked about | `context.action` per program, most frequent first | what people want to do |

Sort by questions, descending (top 25, like the volume chart). Busy services
with low coverage are where to evaluate next — the sort and the coverage column
show that; there is no separate highlight in PR 1 (thresholds would be
arbitrary). The per-service example chat link was dropped from PR 1: the reuse
lists in PR 2 link to real evaluations instead.

**Known limit:** "in use" doesn't check whether the evaluation's embedding has
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
table) move into Part A, computed by aggregation over the same scope.

**Out of Part A on purpose:** before/after effect of evals on scores. Evaluated
samples are small and the choice of which chats get evaluated skews them, so
the result would be misleading. Revisit only if volume grows.

### Part B — "What the explanations say" (on demand, one LLM call)

- An institution filter is required. The button is labelled with the number of
  non-perfect evaluations in scope.
- **One** call to the existing `evalAnalysisInsightsStrategy`. The inputs are
  the Part A numbers and the non-perfect and content-issue rows.
- **Input limit, not population limit:** send at most `MAX_INSIGHT_ROWS`
  (start at 150) non-perfect rows. When there are more, prioritise errors
  first, then the most recent. The report states "based on N of M".
- Theme minimum is unchanged: max(2, 20% of non-perfect rows), asked in the
  prompt and filtered on the output.
- Results are stored as before (an `EvalAnalysis` doc with the insights and the
  filter snapshot) so past runs can be re-displayed without cost. The
  past-runs list stays.
- It is a single request, with no advance loop. The UI shows the loading state
  through `LoadingOverlay`. If one call proves too slow for the request
  timeout, the fallback is a two-step create/advance, not chunking.

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

- `services/EvalAnalysisService.js` collapses to `createAndSynthesize(filters,
  language)`. It fetches non-perfect and content-issue rows only, with the
  input limit, then makes one insights call and stores the result.
- `evalAnalysisInsightsStrategy.js`: remove the stale "not reviewed" note.
  **No prompt wording change in this work.** If the new inputs (coverage,
  reuse) seem worth giving to the model, flag it to the maintainers instead.
- `api/eval/eval-analysis-run.js` does the whole run in one request and
  returns the finished doc.

**Removed** (confirm before deleting)

- `agents/strategies/evalAnalysisClassifyStrategy.js` and its tests
- `api/eval/eval-analysis-advance.js`, `api/eval/eval-analysis-precheck.js`
- The `classifying` status, `progress`, the stored `programs` vocabulary and
  the full `rows` snapshot on `models/evalAnalysis.js`. Keep old docs readable:
  the report component must still render a v1 doc's `crossTab`.
- `rowNeedsClassification` and the `MIN_EVALS`/`MAX_EVALS` exports, if nothing
  else uses them.
- Check whether `getSeedPrograms`/`ACTION_SEEDS` still have other callers (the
  per-question classifier uses its own guidance) before touching them.

**Database notes (DocumentDB 8)**

- Always `$match` on `Chat.createdAt` before the interactions lookup. v1's
  `buildPipeline` doesn't, and runs every chat through the lookup on each
  precheck.
- Validate the `qaMatches` unwind with `explain("executionStats")` on a
  production-sized range.

## Frontend changes

- Service + hook: coverage is an opt-in fetch in `useDashboardMetrics`
  (`includeEvalCoverage`, via `MetricsService.getEvalCoverageMetrics`), like the
  other partner-only cards — same filters, loading and abort handling, no new
  hook. `useEvalAnalysis.js` drops the precheck and drive loop (PR 3).
- Components in `src/components/admin/dashboard/`: `EvalCoverageCard.js` for
  Part A (PR 1). `EvalAnalysisSection.js` /
  `EvalAnalysisReport.js` shrink to Part B. The report drops the cross-tab for
  new runs because Part A replaces it.
- Locales: new keys under `partnerDashboard.evalCoverage.*`, EN and FR
  together. Remove the dead `tooFew`/`tooMany`/progress keys. Program and
  action names go through the existing display-time FR maps.
- Numbers go through `formatNumber`/`formatPercent`. The section uses the
  shared card chrome and an accessible table.

## TODO — split coverage EN/FR (follow-up PR)

Eval-informed retrieval matches **same language only**, so a service with only
English evaluations has nothing to draw on for French questions — today's
single coverage column hides that. Split questions, evaluations, in-use,
expiring and answers-using-evaluations by `pageLanguage` (the volume chart
already groups `en`/`fr` the same way). Kept out of PR 1 to keep it reviewable.

## PR breakdown

1. **Part A, coverage table** (built): endpoint, card, EN/FR copy, how-to guide
   section, dashboards doc. It stands alone and carries most of the value.
2. **Part A, most-used evaluations** (built): endpoint, card, EN/FR copy,
   how-to guide, dashboards doc. The weak-examples list was dropped.
3. **Part B simplification**: one call, input limit, removals, and moving the
   EN/FR and evaluator tables into Part A.

Docs in the same PRs: update `docs/coding-agent-docs/dashboards.md` for the new
cards, and the admin how-to guide in `public/content/admin/` if it covers this
section (EN + FR).

## Open questions

- Is the 60-day "expiring soon" window right, or should it match an evaluation
  cadence the team already works to?

## What v1 does today

For reference, until v2 replaces it.

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
