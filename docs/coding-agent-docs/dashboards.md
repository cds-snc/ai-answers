# Exec & Partner Dashboards

Read this before working on the executive or partner dashboards (the card/chart
dashboards, **not** the older `MetricsDashboard` performance-metrics page).

## What they are

| Dashboard | Page | Component | Audience |
|-----------|------|-----------|----------|
| Executive | `src/pages/ExecDashboardPage.js` | `src/components/admin/ExecDashboard.js` | admin |
| Partner | (rendered in admin/partner area) | `src/components/admin/PartnerDashboard.js` | admin + partner |

Both compose the same building blocks and read the same metric bundle. They are
deliberately kept close in layout but differ in a few intentional ways (below).

## Data flow

```
FilterPanel / DashboardFilterBar  ──onApply(filters)──►  useDashboardMetrics.fetchMetrics(filters)
                                                              │  (passes filters straight through)
                                                              ▼
        MetricsService.getXxxMetrics(filters)  ──►  /api/metrics/* endpoints  ──►  parseRequestFilters()
                                                              │
                                          setMetrics({ ...usage, ...session, ...expert, ...ai, ...publicFb, ...dept })
```

- **`src/hooks/admin/useDashboardMetrics.js`** — orchestrates 7 parallel metric
  fetches (usage, sessions, expert, ai, public feedback, departments, technical),
  abort, loading/error. `fetchMetrics(filters)` takes a **filters
  object** and passes it through unchanged; both filter components supply a
  superset/subset of `{ startDate, endDate, department, userType, ... }`.
- **`src/services/MetricsService.js`** — `_fetchMetric` serializes the whole
  filters object to query params (`new URLSearchParams(filters)`).
- **`api/metrics/*.js`** — each endpoint calls `parseRequestFilters(req)`
  (`api/metrics/metrics-common.js`) which reads `startDate/endDate/department/
  userType/answerType/partnerEval/aiEval/urlEn/urlFr`. `userType` of `'all'` or
  undefined = no user-type filter.

## Filter components

| Component | Used by | Notes |
|-----------|---------|-------|
| `FilterPanel.js` | **Partner** | Full filter (date-range picker, dept, userType, advanced: answerType/partnerEval/aiEval/url). Pass `autoApply` to load on mount; `defaultUserType="all"`. Also used by `MetricsDashboard`. |
| `DashboardFilterBar.js` | **Exec** | Minimal (dept + two date inputs). Auto-fires `onApply` on mount (last 30 days). |

`FilterPanel` owns its own default range (last 7 days). The minimal bar uses 30.

## Metric bundle shape (the important fields)

```
metrics.totalQuestions / totalQuestionsEn / totalQuestionsFr / totalConversations
metrics.totalInputTokens / totalInputTokensEn / totalInputTokensFr   // from usage
metrics.totalOutputTokens / totalOutputTokensEn / totalOutputTokensFr // from usage
metrics.responseTime.{ count, median, p90, p95, max, maxChatId }    // ms, from technical
metrics.sessionsByQuestionCount.{singleQuestion,twoQuestions,threeQuestions}.total
metrics.byDepartment[dept].{ total, expertScored.total }
metrics.expertScored.<cat>.{ total, en, fr }   // cat: total, correct, needsImprovement,
                                                //      hasError, hasCitationError, harmful, hasContentIssue
metrics.aiScored.<cat>.{ total, en, fr }        // same cats EXCEPT no hasContentIssue
metrics.expertScored.hasContentIssue.{ total, en, fr, needsImprovement, hasError }
metrics.publicFeedbackTotals.{ totalQuestionsWithFeedback, yes, no, enYes, enNo, frYes, frNo }
metrics.publicFeedbackReasons.{ yes, no }       // keyed by score (string) -> { en, fr, total }
```

Expert metrics come from `api/metrics/metrics-expert-feedback.js`, AI from
`metrics-ai-eval.js`, public feedback from `metrics-public-feedback.js`. Token
totals come from `metrics-usage.js`; `responseTime` (ms percentiles) from
`metrics-technical.js`. The exec **Operations metrics** row reads
`responseTime.median`/`p95` (shown in seconds) and the token totals.

## Shared UI building blocks (`src/components/admin/dashboard/`)

| File | Purpose |
|------|---------|
| `StatCard.js` | KPI card: label + big number + optional sub. `uppercase` = partner style; plain (default) = exec style. |
| `KpiRow.js` | The 3 exec headline KPIs (questions / expert-evaluated / accuracy) derived from a metrics bundle. Reused for the filtered range **and** the last-12-months row. |
| `DonutCard.js` | Donut + centre figure. Per-slice colours via `colours[]`. |
| `HBarCard.js` | Horizontal bars. Per-bar colour via `data[i].colour`; `percent` mode (0–100 axis + `%`); value labels via `<LabelList>`; `subtitle`/`noDataLabel`. |

## Pure data helpers (`src/utils/dashboard/feedbackBreakdown.js`)

- `buildQualityBarData(expertScored, aiScored, t)` — answer-quality bar rows as
  **% of combined expert+AI evals**, fixed order, **"Has answer error" last**,
  per-category colour. **Harmful is excluded** (own card).
- `splitPublicFeedbackTotals(totals, noReasonsByScore)` — reclassifies public
  feedback to positive/negative **by score, not the yes/no click** (see rules).
- `buildFeedbackSplitData(totals, reasons, t)` — donut rows (helpful / not helpful).
- `buildFeedbackReasonsData(reasons, t)` — full reason breakdown bar: positives
  (green) first, negatives (red) after, fixed order, zero rows dropped.
- Score → positive/negative is defined in `src/constants/UserFeedbackOptions.js`
  (`isPositiveScore`, `POSITIVE_SCORES`, the `positiveAboutAI` flag).

Colours: `src/constants/dashboardColours.js` (single source of truth).

## Domain rules that are easy to get wrong

- **Accuracy** counts only `hasError` (answer errors). Citation issues and
  needs-improvement do **not** lower accuracy. `accuracy = 100 − round(hasError/total)`.
- **Category is mutually exclusive, priority `harmful > hasCitationError >
  hasError > needsImprovement > correct`** (`getPartnerEvalAggregationExpression`
  in `api/util/chat-filters.js`). So a harmful answer is categorized `harmful`,
  not `hasError` — harmful is genuinely additive, not a subset double-counted.
- **Citation errors are NOT answer errors** and can't carry harmful/content
  flags. The "answer error" signal is sentence/total score `0` only (never
  `citationScore`). `totalScore = sentenceComponent + citationComponent`, so
  `totalScore===0` always implies a sentence error too.
- **Content issues** (`hasContentIssue`) are expert-only and split into
  `needsImprovement` vs `hasError` by the **raw error signal** (so harmful/
  citation answers that also have an error land in the error bucket); the two
  always sum to the total.
- **Public feedback `notWanted`** ("answer is clear, but not what I wanted to
  hear") is a *no* click but counts as **positive** about AI. Classify by score,
  not the raw `feedback` field.

## Conventions

- **Locales**: each dashboard has its own `partnerDashboard.*` / `execDashboard.*`
  namespace (`kpi`, `charts`). Duplicated keys across the two are normal. Add
  EN + FR together; run `node scripts/find-dead-locale-keys.cjs` (0 parity gaps).
- **Numbers/percent**: always `formatNumber`/`formatPercent`/`formatDecimal`
  from `src/utils/numberFormat.js` (locale-aware; FR uses `1 000`, `45 %`).
- **Exec page title** carries "AI Answers" for screenshot identification; FR puts
  "Réponses IA" at the end (matches `admin.partnerTitle`).
- The exec **last-12-months row** uses a *second* `useDashboardMetrics` instance
  fetched once on mount for `now − 1 year`, independent of the filter.

## Tests

`src/utils/dashboard/feedbackBreakdown.test.js` (vitest) covers the pure helpers
— ordering, colours, score classification, the feedback split. Run:
`npx vitest run src/utils/dashboard/feedbackBreakdown.test.js`. The metrics
endpoints are covered by `__tests__/*metrics-dashboard*.test.js`.
