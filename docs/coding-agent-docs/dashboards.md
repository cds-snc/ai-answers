# Dashboards & filters

There are two dashboard families, and one filter layer shared across most of them:

- **Card/chart dashboards** — Executive and Partner. KPI cards, donuts, bars.
  Deep-dive in [Exec & partner card dashboards](#exec--partner-card-dashboards).
- **Table/filter dashboards** — Chat, Eval, AutoEval, and the older
  `MetricsDashboard` performance-metrics page. DataTables + per-column/global filters.
- **Shared filter layer** — `FilterPanel.js` + `getChatFilterConditions`
  (`api/util/chat-filters.js`), consumed by Partner, Metrics, Chat, Eval, AutoEval,
  and Export. The Exec dashboard is the odd one out (uses `DashboardFilterBar`).

**Jump to what you're touching:**

| Editing… | Read first |
|----------|-----------|
| `FilterPanel.js` or `getChatFilterConditions` (affects many dashboards) | [Shared filter logic](#shared-filter-logic-read-first-when-touching-filters) + [Cross-dashboard gotchas](#cross-dashboard-gotchas) |
| Chat / Eval / AutoEval / Metrics table dashboards | [Shared filter logic](#shared-filter-logic-read-first-when-touching-filters) + [Cross-dashboard gotchas](#cross-dashboard-gotchas) |
| Exec or Partner card/chart dashboard | [Exec & partner card dashboards](#exec--partner-card-dashboards) |

## Shared filter logic (read first when touching filters)

When changing `FilterPanel.js` or the backend filter logic in `getChatFilterConditions` (`api/util/chat-filters.js`), you must verify the change works across **all consumers** — each has a different aggregation pipeline shape, so a regex or filter condition that works on one may fail on another due to different field paths, `$lookup` ordering, or stored data formats:

- **ChatDashboardPage** (`api/chat/chat-dashboard.js`)
- **EvalDashboardPage** (`api/eval/eval-dashboard.js`) — aggregates from `Interaction` with `basePath: ''` and `userField: 'chatUser'`; `referringUrl` may be stored without protocol prefix
- **AutoEvalDashboardPage** (`api/eval/eval-dashboard.js`, same backend)
- **MetricsDashboard** (`api/metrics/metrics-common.js` + individual metric endpoints)
- **PartnerDashboard** (`api/metrics/*` via `parseRequestFilters`) — uses `FilterPanel` too; see the [filter components](#filter-components) table below
- **Export/Download** (`api/chat/chat-export-logs.js`) — has a `$lookup` that overwrites `user`; user-type filter must be applied early in `dateFilter` before the overwrite

## Cross-dashboard gotchas

- **DataTables `stateSave`**: When changing column `searchable`/`orderable` settings, bump the `TABLE_STORAGE_KEY` version — stale localStorage can silently apply old column filters that no longer have visible inputs.
- **Eval dashboard aggregates from `Interaction`, not `Chat`**: Fields from the parent chat (like `user`, `chatId`, `pageLanguage`) must be `$lookup`'d and extracted. The `user` field lives on `Chat`, so in the eval pipeline it's `chatUser` — pass `userField: 'chatUser'` to `getChatFilterConditions`.
- **Cleanup `$project` stages**: If you add a `$lookup` + `$addFields` for a new field, don't remove it in the cleanup `$project` if a later `$project` still needs it.
- **Chat Dashboard doesn't support per-column filters** (only global search). Eval Dashboard does via `columnSearch` + `initComplete` filter inputs. Adding column filters to Chat Dashboard requires both frontend (`initComplete` + `columnSearch` in ajax) and backend (`columnSearch` handling in `chat-dashboard.js`).

---

# Exec & partner card dashboards

The card/chart dashboards — **not** the older `MetricsDashboard` performance-metrics
page. (If you're only touching their filters, the shared sections above usually
cover it.)

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
                              setMetrics({ ...usage, ...session, ...expert, ...ai, ...publicFb, ...dept, ...technical, ...blocked })
```

- **`src/hooks/admin/useDashboardMetrics.js`** — orchestrates 8 parallel metric
  fetches (usage, sessions, expert, ai, public feedback, departments, technical,
  blocked), abort, loading/error. `fetchMetrics(filters)` takes a **filters
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
| `DashboardFilterBar.js` | **Exec** | Preset bar (Last 30 days / Current quarter / All time / Custom). Auto-fires `onApply` on mount. No userType selector — ExecDashboard fixes `userType: 'public'` on every fetch (see below). |

`FilterPanel` owns its own default range (last 7 days). End dates cap at yesterday (23:59:59) to match the backend, which queries `createdAt` up to midnight — today's data is never returned.

### DashboardFilterBar — "All data" preset and load-on-mount

**"All data" is a temporary preset** that spans from the first date with real data in the DB (`metrics.firstDataDate`, passed as `minDate`) to yesterday. Once a full year of data exists, replace it with a "Last year" preset (or add it alongside "Current quarter"). To do this: add a `'lastYear'` case to `getDateRange`, update `PRESETS`, and add locale keys for `dashboardFilter.lastYear` in both EN and FR.

**Auto-loads on mount.** `DashboardFilterBar` fires `onInitialLoad` (or `onApply`) once on mount with the "All data" range. This is intentional while data is small, but as volume grows the default fetch may become slow. If that happens, drop `onInitialLoad` from `ExecDashboard` — the bar will then wait for an explicit Apply click before fetching. The comment in `DashboardFilterBar.js` marks this known trade-off.

### FilterPanel auto-close behaviour

`FilterPanel` auto-closes after a successful fetch (results > 0) and stays open on error or zero results. This is controlled by `skipNextAutoClose` (a ref):

- **`handleClear`** sets `skipNextAutoClose.current = true` before calling `onApplyFilters` / `onClearFilters`. It also calls `setIsOpen(true)` directly — without the skip, the auto-close effect would immediately fight that and close the panel again.
- **`removeFilter`** (pill × button) does **not** set `skipNextAutoClose`. This is intentional: removing a pill is semantically the same as re-applying filters, so if results come back the panel should auto-close normally. If the panel was open because of zero results and removing the pill brings results back, closing is the correct outcome.

**Exec dashboard is public-only.** `ExecDashboard` wraps every metrics fetch
(`fetchExecMetrics`) to inject `userType: 'public'`, so it reports public usage
and excludes questions from admin/partner accounts signed in to test/evaluate.
`'public'` (no logged-in user) already covers the referred-public subset; in the
blocked-query counter it sums `referredPublic + publicOther`. This is fixed in
code, not user-selectable. The title note (`execDashboard.description`) states the
exclusion — keep the two in sync.

**Exec range heading** clamps its start date up to `metrics.firstDataDate` (the
first day with data in range) so it never shows an empty leading stretch when the
default 12-month window reaches back before any data exists. `firstDataDate` is a
`$min` over `createdAt` in `metrics-usage.js`; the heading self-corrects if the DB
is cleared and data starts later. The filter bar's **start input** is snapped to
that same date once the fetch returns (`DashboardFilterBar`'s `dataStartDate`
prop) so the inputs and the heading always show the same range — the snap changes
only after a fetch, so it never fights a mid-edit.

## Metric bundle shape (the important fields)

```
metrics.firstDataDate                                                // earliest createdAt in range (ISO ts), from usage; null if no data
metrics.totalQuestions / totalQuestionsEn / totalQuestionsFr / totalConversations
metrics.totalInputTokens / totalInputTokensEn / totalInputTokensFr   // from usage
metrics.totalOutputTokens / totalOutputTokensEn / totalOutputTokensFr // from usage
metrics.responseTime.{ count, median, p90, p95, max, maxChatId }    // ms, from technical
metrics.sessionsByQuestionCount.{singleQuestion,twoQuestions,threeQuestions}.total
metrics.byDepartment[dept].{ total, expertScored.total }  // total = interactions (questions), not conversations
metrics.expertScored.<cat>.{ total, en, fr }   // cat: total, correct, needsImprovement,
                                                //      hasError, hasCitationError, harmful, hasContentIssue
metrics.aiScored.<cat>.{ total, en, fr }        // same cats EXCEPT no hasContentIssue
metrics.expertScored.hasContentIssue.{ total, en, fr, needsImprovement, hasError }
metrics.publicFeedbackTotals.{ totalQuestionsWithFeedback, yes, no, enYes, enNo, frYes, frNo }
metrics.publicFeedbackReasons.{ yes, no }       // keyed by score (string) -> { en, fr, total }
metrics.blockedQueries.<type>.{ total, en, fr } // from metrics-blocked; type: tooShort,
                                                //   piStage1, piStage2, profanity, threat,
                                                //   manipulation, azureGuardrail,
                                                //   unsupportedLanguage, plus a `total` bucket
```

### What each metric counts

Most metrics count at the **interaction level** (one per question asked):
`totalQuestions`, `expertScored`, `aiScored`, `publicFeedback`, `byDepartment.total`, and `byDepartmentCount` (institutions with questions) all count interactions. A 3-question TBS session counts as 3 toward TBS's total.

Two metrics count at the **chat (conversation) level** — intentionally:
- **`totalConversations`** — distinct Chat IDs; measures unique conversations.
- **`sessionsByQuestionCount`** — groups by Chat ID to show session depth (how many questions per conversation). Chat-level grouping is correct here.

Nothing else should count at the Chat ID level. If you add a new metric that aggregates from `Chat` without `$unwind`ing interactions, verify the counting unit is intentional.

Expert metrics come from `api/metrics/metrics-expert-feedback.js`, AI from
`metrics-ai-eval.js`, public feedback from `metrics-public-feedback.js`. Token
totals come from `metrics-usage.js`; `responseTime` (ms percentiles) from
`metrics-technical.js`. The exec **and** partner **Operations metrics** rows
read `responseTime.median`/`p95` (shown in seconds) and the token totals.

## Shared UI building blocks (`src/components/admin/dashboard/`)

All charts are **recharts** (`BarChart`/`PieChart`), wrapped in a shared white
card chrome (border `#e0e0e0`, radius 8, soft shadow, 15px/600 title). Match this
chrome when adding a new card — don't drop a bare `<table>`/chart in. Colours
come from `src/constants/dashboardColours.js`.

| File | Purpose |
|------|---------|
| `StatCard.js` | KPI card: label + big number + optional sub. `uppercase` = partner style; plain (default) = exec style. |
| `DonutCard.js` | Donut + centre figure. Per-slice colours via `colours[]`. |
| `HBarCard.js` | Horizontal bars. Per-bar colour via `data[i].colour`; `percent` mode (0–100 axis + `%`); integer-only ticks (`allowDecimals={false}`); value labels via `<LabelList>`; optional `tooltipContent` (recharts custom-content fn) to surface extra per-row fields; `subtitle`/`noDataLabel`. |
| `DivergingBarCard.js` | Diverging horizontal bars from a zero baseline: positive rows extend right (green), negative left (red); `value` is the non-negative count, `positive` picks the side. Axis + per-bar data label show **% of total**; tooltip shows the **count**. Symmetric domain (one shared scale, not per-side). Used for the satisfaction breakdown on both dashboards. |
| `BlockedQueriesTable.js` | Plain DataTable-style table (Type / Total / EN / FR) for the blocked-query counter. Used on the **technical** dashboard (all tables there); the exec dashboard uses a `StatCard` + `HBarCard` instead. Row order from `src/constants/blockedQueryTypes.js`. |

## Pure data helpers (`src/utils/dashboard/feedbackBreakdown.js`)

- `buildQualityBarData(expertScored, aiScored, t)` — answer-quality bar rows as
  **% of combined expert+AI evals**, fixed order, **"Has answer error" last**,
  per-category colour. **Harmful is excluded** (own card).
- `splitPublicFeedbackTotals(totals, noReasonsByScore)` — reclassifies public
  feedback to positive/negative **by score, not the yes/no click** (see rules).
- `buildFeedbackSplitData(totals, reasons, t)` — donut rows (helpful / not helpful).
- `buildFeedbackReasonsData(reasons, t)` — full reason breakdown bar rows in the
  fixed `FEEDBACK_REASON_ORDER` (positives green first, negatives red after — NOT
  count-sorted, stable across date ranges), zero rows dropped. Each row carries
  `positive` (for `DivergingBarCard`'s left/right) **and** `colour` (for plain
  bars). To re-order the satisfaction breakdown, edit `FEEDBACK_REASON_ORDER` in
  `feedbackBreakdown.js` — it drives both dashboards.
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

## Safety: blocked-query counter

Queries stopped by the guardrails (too short, profanity/threat/manipulation word
lists, programmatic + AI privacy detection, Azure content filter, unsupported
language) **throw before `persistNode`** and are never written as Chat/Interaction
records — the question text is intentionally discarded. A **text-free** counter is
the only record of them. End-to-end:

- **Tagging:** each guardrail throw site in `agents/graphs/guardrails/` sets a `blockType` on the
  thrown error (`ShortQueryValidation` / `RedactionError`). A word-list block that
  trips several lists is classified to one primary bucket by priority.
- **Recording:** the single `catch` in `api/chat/chat-graph-run.js` fires
  fire-and-forget `BlockedQueryService.record({ blockType, lang, user,
  referringUrl })` — never awaited, never throws.
- **Storage:** `models/blockedQueryCounter.js`, day-bucketed
  `{ date, type, lang, userType, count }` with an atomic `$inc`/upsert. No text.
  `userType` is `admin | referredPublic | publicOther` via
  `classifyUserType` (reuses `isReferredPublicUrl` from `api/util/chat-filters.js`
  so it matches the dashboard userType filter).
- **Endpoint:** `api/metrics/metrics-blocked.js` → `metrics.blockedQueries`
  (per-type `{ total, en, fr }`). It honours date range + `userType`, and
  **ignores department on purpose** (blocks happen before the department is known).
- **UI:** exec = `StatCard` (total) + `HBarCard` (by type, fixed pipeline order,
  zero rows dropped); technical = `BlockedQueriesTable`. Both dashboards track the
  applied department and **hide the blocked-query view when a department is
  selected** (showing `blockedQueries.deptNote` instead) — it can't be
  department-scoped. Type order/labels: `src/constants/blockedQueryTypes.js` +
  `blockedQueries.types.*` locale keys.
- **No backfill:** counts accrue from deploy forward; historical blocks were never
  recorded. Tests: `__tests__/blockedQueryService.test.js`.

## Local preview with mock data

The exec and partner dashboards can be loaded with realistic placeholder data — no API or backend required. This is useful for layout and locale review without needing real data in the database.

Append `?mock=1` to the dashboard URL in your browser:

```
http://localhost:3000/en/exec-dashboard?mock=1
http://localhost:3000/en/partner-dashboard?mock=1
```

No server restart needed — adding or removing `?mock=1` and refreshing is enough. The mock data is defined in `src/utils/dashboard/mockMetrics.js` and covers all sections: KPI cards, quality bar, satisfaction charts, blocked queries, operations metrics, and conversation depth.

To update the placeholder values (e.g. to stress-test a specific threshold or layout edge case), edit `mockMetrics.js` directly and refresh.

## Layout

**Solo, partial-row, and paired components**
A component left alone in a `dashboard-row` will stretch full width — wrap it in `dashboard-col-third` or `dashboard-col-half` to constrain it. Pick the fraction that matches the column count of the nearest sibling row (e.g. if the row above has 3 cards, use `dashboard-col-third`).

Charts default to full width. When a related KPI card or donut sits alongside one, the chart takes the left (wider) column using `dashboard-chart-wide` and the card or donut sits unstyled on the right.

**Minimum data thresholds**
Hide charts and donuts when the sample is too small to be meaningful (< 10). Current gates: `>= 10` evaluations for quality bars, `>= 10` responses for satisfaction charts and donuts, `>= 10` conversations for the engagement donut. Blocked queries has no minimum — safety signals show regardless of volume.

## Conventions

- **Locales**: each dashboard has its own `partnerDashboard.*` / `execDashboard.*`
  namespace (`kpi`, `charts`). Duplicated keys across the two are normal. Add
  EN + FR together; run `node scripts/find-dead-locale-keys.cjs` (0 parity gaps).
- **Numbers/percent**: always `formatNumber`/`formatPercent`/`formatDecimal`
  from `src/utils/numberFormat.js` (locale-aware; FR uses `1 000`, `45 %`).
- **En-dash separators**: a hardcoded ` – ` is acceptable in headings, date
  ranges (e.g. `formatDateRange` in `ExecDashboard`), and department
  abbreviations like `CRA-ARC` (these end with a name, not a dash, and are
  short enough not to line-break). Avoid it in chart bar labels and tooltips —
  the chart library renders its own dash between label and value, and a
  hardcoded ` – ` sits directly next to it.
- **Exec page title** carries "AI Answers" for screenshot identification; FR puts
  "Réponses IA" at the end (matches `admin.partnerTitle`).
- The exec dashboard is a **single filterable section** defaulting to the last 12
  months (the old fixed last-12-months row + its second `useDashboardMetrics`
  instance were removed in the reorg). One filter, one metrics fetch.

## Tests

`src/utils/dashboard/feedbackBreakdown.test.js` (vitest) covers the pure helpers
— ordering (incl. the fixed `FEEDBACK_REASON_ORDER`), colours, score
classification, the feedback split. Run:
`npx vitest run src/utils/dashboard/feedbackBreakdown.test.js`. The metrics
endpoints are covered by `__tests__/*metrics-dashboard*.test.js`. The blocked-
query counter (classification, day-bucketing, userType mapping, metric bundle
shape) is covered by `__tests__/blockedQueryService.test.js`.
