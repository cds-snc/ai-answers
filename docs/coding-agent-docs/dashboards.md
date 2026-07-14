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
- **EvalDashboardPage** (`api/eval/eval-dashboard.js`) — aggregates from `Chat`, unwinds `interactions`, and uses `basePath: 'interactions'` with `userField: 'user'`; `referringUrl` may be stored without protocol prefix
- **AutoEvalDashboardPage** (`api/eval/eval-dashboard.js`, same backend)
- **MetricsDashboard** (`api/metrics/metrics-common.js` + individual metric endpoints)
- **PartnerDashboard** (`api/metrics/*` via `parseRequestFilters`) — uses `FilterPanel` too; see the [filter components](#filter-components) table below
- **Export/Download** (`api/chat/chat-export-logs.js`) — has a `$lookup` that overwrites `user`; user-type filter must be applied early in `dateFilter` before the overwrite

## Cross-dashboard gotchas

- **DataTables `stateSave`**: When changing column `searchable`/`orderable` settings, bump the `TABLE_STORAGE_KEY` version — stale localStorage can silently apply old column filters that no longer have visible inputs.
- **Eval dashboard aggregates from `Chat`, then unwinds interactions**: This avoids a reverse lookup from each interaction into `chats.interactions`. The result is still one row per interaction/question, but parent fields like `user`, `chatId`, and `pageLanguage` stay on the base chat document. Shared filters should use `basePath: 'interactions'` and `userField: 'user'`.
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
                              setMetrics({ ...usage, ...session, ...expert, ...ai, ...publicFb, ...dept, ...technical, ...blocked, ...referrals, ...citations })
```

- **`src/hooks/admin/useDashboardMetrics.js`** — orchestrates 7 parallel metric
  fetches (usage, sessions, expert, ai, public feedback, departments, technical)
  plus a best-effort tail round (blocked queries always; **top referrals and top
  citations only when opted in via `useDashboardMetrics({ includeReferrals: true,
  includeCitations: true })`** — partner dashboard opts in, exec does not, so
  exec pays nothing for lists it doesn't render), abort, loading/error.
  `fetchMetrics(filters)` takes a **filters object** and passes it through
  unchanged; both filter components supply a superset/subset of `{ startDate,
  endDate, department, userType, ... }`. The tail fetches each fall back to their
  empty shape on failure, so one bad endpoint can't blank the rest of the
  dashboard.
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
| `DashboardFilterBar.js` | **Exec** | Preset bar (Last 30 days / Current quarter / Last 12 months / Custom — the `'allTime'` preset key is labelled "Last 12 months") **plus a partner-institution/department selector** (the "By partner institution" dropdown, from `PARTNER_DEPARTMENTS`). Auto-fires `onApply` on mount and on department change. No userType selector — ExecDashboard fixes `userType: 'public'` on every fetch (see below). The institution selector is **not** locked to a viewing partner's own institution — partners (who now have access) see the all-institutions default and can select any institution. |

`FilterPanel` owns its own default range (last 7 days). End dates run through today (23:59:59) and the picker allows selecting today — the backend queries `createdAt` up to the end date that's sent, so today's data is returned normally. (There is **no** backend cap at yesterday; an earlier version capped the picker at yesterday, which was reverted because it hid the current day's data.)

**Keep same-named presets aligned between the two filter components — presets unique to one side are free to differ.** `FilterPanel.js`'s daterangepicker `ranges` and `DashboardFilterBar.js`'s `getDateRange` are two independent implementations, but where **both define a preset with the same label** (currently only "Last 30 Days" / `last30`), they must compute the **same span**, since partners/admins compare them across dashboards. The convention for day-counted presets is an *N-day inclusive window counting today*, so subtract `N − 1` days for a labelled "Last N Days" (e.g. 30 days → `subtract(29, 'days')` / `setDate(getDate() - 29)`), not `N`. Presets that exist on only one side — `Today`/`Yesterday`/`This Month`/`Last Month` on `FilterPanel`, or `currentQuarter`/`allTime` on `DashboardFilterBar` — have no counterpart to match and can use whatever logic fits (calendar-boundary presets like these aren't day-counted anyway). When adding or changing a preset in either file, only check the other file if the same label exists there.

### DashboardFilterBar — "Last 12 months" preset (`allTime` key) and load-on-mount

**The `'allTime'` preset (labelled "Last 12 months") is a rolling 12-month window**, clamped up to the first date with real data: `start = max(firstDataDate, today − 12 months)`, `end = today`. While less than a year of data exists it's effectively "all data so far" (the clamp wins); once history passes 12 months it becomes a true rolling year, no code change needed. `firstDataDate` arrives as `minDate`; the snap effect re-applies through `getDateRange` so the clamp uses the real value. The exec range **heading** clamps the displayed start up to `firstDataDate`, so a partial year shows its true span and the label isn't misleading. (The preset key stays `allTime`; only the `dashboardFilter.allTime` label reads "Last 12 months".)

**Auto-loads on mount.** `DashboardFilterBar` fires `onInitialLoad` (or `onApply`) once on mount with the "Last 12 months" (`allTime`) range. This is intentional while data is small, but as volume grows the default fetch may become slow. If that happens, drop `onInitialLoad` from `ExecDashboard` — the bar will then wait for an explicit Apply click before fetching. The comment in `DashboardFilterBar.js` marks this known trade-off.

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
metrics.topReferrals[]                          // from metrics-referrals (partner only); ranked
                                                //   [{ url, count }], top 20, normalized page key,
                                                //   count = distinct CONVERSATIONS (not questions)
metrics.topCitations[]                          // from metrics-citations (partner only); ranked
                                                //   [{ url, count }], top 20, normalized page key,
                                                //   count = QUESTIONS that cited the page
metrics.answerTypeBreakdown.{ normal, 'clarifying-question', 'pt-muni', 'not-gc' } // question counts
                                                //   per answer type; `normal` = the answers with a citation
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
| `BlockedQueriesTable.js` | Plain DataTable-style table (Type / Total / EN / FR) for the blocked-query counter. Used on the **technical** dashboard (all tables there); the exec dashboard uses a `StatCard` + `HBarCard` instead. Row order from `BLOCK_QUERY_TYPES` (`src/constants/blockedQueryTypes.js`) — the raw per-type rows, **not** the merged exec/partner grouping. |
| `NoDataCard.js` | Placeholder card (title + short note) shown in place of a chart or donut that is below its minimum-sample threshold. Keeps the section's heading on the page instead of letting the card vanish — see [Minimum data thresholds](#layout). Message is always `common.notEnoughData`. |
| `CountTable.js` | Plain two-column "label / count" table with row dividers, shared by the collapsible list cards. `rows` = `[{ key, label, count, href? }]` — `href` renders the label as a new-tab link. Locale-free (labels passed in resolved). |
| `ReferralUrlsCard.js` | Collapsible (`<details>`) card wrapping a `CountTable` (referring page / click-throughs) for the top-referral-pages list. **Partner dashboard only.** URLs open in a new tab (`https://` prepended to the normalized page key). |
| `CitationPagesCard.js` | Collapsible (`<details>`) card with **two** `CountTable`s: top citation pages (cited page / questions) and the answer-type breakdown (answer type / questions). **Partner dashboard only.** |

## Pure data helpers (`src/utils/dashboard/feedbackBreakdown.js`)

- `buildQualityBarData(expertScored, aiScored, t)` — answer-quality bar rows as
  **% of combined expert+AI evals**, fixed order, **"Has answer error" last**,
  per-category colour. Harmful is not shown as its own bar here; the metrics API
  folds harmful incorrect answers into the returned `hasError` count, while the
  harmful card/row still reports them separately.
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

- **Accuracy** counts the returned `hasError` metric (answer errors). The metrics
  API includes both `hasError` and `harmful` categories in that returned count,
  because the review UI only allows harmful after selecting Incorrect (0).
  Citation issues and needs-improvement do **not** lower accuracy.
  `accuracy = 100 − round(hasError/total)`.
- **Category is mutually exclusive, priority `harmful > hasCitationError >
  hasError > needsImprovement > correct`** (`getPartnerEvalAggregationExpression`
  in `api/util/chat-filters.js`). So a harmful answer is categorized `harmful`
  for filters and the separate harmful row/card. The metrics API folds that
  category into the returned `hasError` count anywhere accuracy needs answer
  errors.
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
- **UI:** exec **and** partner = `StatCard` (total) + `HBarCard` (by type, fixed
  pipeline order, zero rows dropped); technical = `BlockedQueriesTable`. All three
  card dashboards track the applied department and **hide the blocked-query view
  when a department is selected** (showing `blockedQueries.deptNote` instead) — it
  can't be department-scoped. Type order/labels:
  `src/constants/blockedQueryTypes.js` + `blockedQueries.types.*` locale keys.
- **"Private details" is a display-only merge.** The exec and partner bars group
  the two privacy guardrails (`piStage1` programmatic + `piStage2` AI detection)
  into one **Private details** row — which stage caught the query is an
  implementation detail to those audiences. The grouping lives in
  `BLOCK_QUERY_GROUPS` (`blockedQueryTypes.js`) and is summed by the shared
  `buildBlockedBarData` (`src/utils/dashboard/blockedQueryBars.js`), which both
  dashboards call — don't rebuild the bar rows inline. The **technical**
  dashboard deliberately keeps the raw two-row split (`BLOCK_QUERY_TYPES`) so the
  guardrails stay debuggable. Storage, `blockType` tagging, and the metrics API
  are untouched — they still record and return both stages separately.
  Tests: `src/utils/dashboard/blockedQueryBars.test.js`.
- **Partner userType is deliberately NOT forced to public.** Exec fixes
  `userType: 'public'` on every fetch, so its blocked counter excludes admin/
  partner test traffic. The partner dashboard intentionally does **not** do this —
  it respects the `FilterPanel` userType selector (`defaultUserType="all"`) so
  partners can see their own admin testing progress alongside public usage. Do not
  "fix" the partner blocked counter to public-only to match exec.
- **No backfill:** counts accrue from deploy forward; historical blocks were never
  recorded. Tests: `__tests__/blockedQueryService.test.js`.

## Top referral pages (partner dashboard only)

Which pages on a partner's site drove the most click-throughs to AI Answers.
`referringUrl` is stored per interaction (indexed). End-to-end:

- **Counting unit = CONVERSATIONS, not questions.** Counting interactions would
  bias toward pages whose visitors happen to ask longer (multi-question)
  sessions. The pipeline collapses to distinct `(referringUrl, chat)` pairs
  first, then counts pairs per URL — so a 3-question session from one page counts
  once. (This is one of the few intentional chat-level counts; see [What each
  metric counts](#what-each-metric-counts).) Two-stage grouping (pair → count)
  also avoids a large `$addToSet` of chat IDs, which is DocumentDB-friendly.
- **Endpoint:** `api/metrics/metrics-referrals.js` → `metrics.topReferrals`
  (`[{ url, count }]`, top 20). Honours date range, userType/url filters, and
  **department** — when a partner is selected the list is scoped to that
  department (unlike blocked queries, which can't be); when none is selected it's
  the global top pages and the `contexts` lookup is skipped entirely (lighter).
- **Normalization:** `api/util/normalizeReferralUrl.js` reduces each raw referrer
  to a stable page key (strip protocol / leading `www.` / query / fragment /
  trailing slash; lowercase host). Counts for variants of the same page merge.
  Returns `null` to drop blanks and AI Answers self-referrals (in-app
  language-switch / navigation), reusing `SELF_REFERRAL_LABELS` from
  `chat-filters.js`.
- **`RAW_URL_CAP` (500):** the DB returns the top 500 raw URLs by count before
  Node normalizes + merges. Since normalization only ever merges rows, the
  top-20 is accurate in practice; the only blind spot is a single page split
  across hundreds of low-count variants (pathological). Raise the cap if that
  ever happens.
- **Why partner-only:** opted in via `useDashboardMetrics({ includeReferrals: true })`
  so the exec dashboard doesn't fetch it. Usertype is **not** forced to public
  here — same rationale as the blocked counter (partners see their own admin
  testing traffic too). Tests: `__tests__/normalizeReferralUrl.test.js`,
  `__tests__/api.metrics-referrals.test.js`.

## Top citation pages + answer-type breakdown (partner dashboard only)

Which GC pages AI Answers cited most, plus how questions split across answer
types. Citations live in a separate `citations` collection
(`providedCitationUrl`, falling back to `aiCitationUrl`) referenced from
`answer.citation`; only `normal` answers carry one.

- **Counting unit = QUESTIONS (interactions).** Each question that produced a
  citation URL counts once toward that page (and a question can sit in only one
  answer-type bucket).
- **Endpoint:** `api/metrics/metrics-citations.js` → `metrics.topCitations`
  (`[{ url, count }]`, top 20) **and** `metrics.answerTypeBreakdown`
  (`{ normal, 'clarifying-question', 'pt-muni', 'not-gc' }`). One aggregation
  groups by `(answerType, citationUrl)`; Node sums per answer type and
  merges/ranks the URLs (reusing `normalizeReferralUrl`). Honours date range,
  userType/url filters, and department (scoped when a partner is selected).
- **Uncapped on purpose:** the answer-type totals need every group, so unlike the
  referral list there's no `RAW_URL_CAP`. The `(answerType, url)` grouping still
  collapses to ~`distinct citation URLs + one row per non-citation answer type`,
  which is bounded like the referral list. If citation-URL cardinality ever
  explodes, split the breakdown into its own lightweight aggregation and cap the
  URL one.
- **Citation list counts any cited question, not just `answerType === 'normal'`:**
  the URL list keys off a non-empty citation URL, so it's robust to legacy/empty
  answerType values; the breakdown separately tallies the four known types.
- **UI:** `CitationPagesCard` (collapsible, partner-only) renders the citation
  `CountTable` then the answer-type `CountTable`. Opted in via
  `useDashboardMetrics({ includeCitations: true })`. Tests:
  `__tests__/api.metrics-citations.test.js`.

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
Charts and donuts don't render when the sample is too small to be meaningful (< 10). Current gates: `>= 10` evaluations for the quality bar and the exec accuracy donut, `>= 10` responses for satisfaction charts and donuts, `>= 10` conversations for the engagement donut. Blocked queries has no minimum — safety signals show regardless of volume.

**Below the threshold, render a `NoDataCard`, don't hide the section.** Users read a vanished card as a bug or a broken filter, so every threshold-gated section on the exec and partner dashboards swaps in a `NoDataCard` carrying the *same title* plus `common.notEnoughData`. Keep that pattern when adding a gated chart. (The exec accuracy donut used to collapse the whole KPI row into a flat fallback; it now always occupies its half so the row keeps its shape.)

This applies to **minimum-sample** gates only. Sections gated on *presence* of data — top referrals, top citations, top programs — stay hidden when empty, and exec's **top-institutions** row is hidden outright when a single institution is filtered (the count and the ranking are both answered by the filter itself, so a placeholder would be noise).

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
