# Dashboards & filters

Two dashboard families, one shared filter layer:

- **Card/chart dashboards** — Public and Partner. KPI cards, donuts, bars. See [Public & partner card dashboards](#public--partner-card-dashboards).
- **Table/filter dashboards** — Chat, Eval, AutoEval, and the older `MetricsDashboard` page. DataTables + filters; table mechanics are in [tables.md](tables.md).
- **Shared filter layer** — `FilterPanel.js` + `getChatFilterConditions` (`api/util/chat-filters.js`), consumed by Partner, Metrics, Chat, Eval, AutoEval, and Export. Public uses `DashboardFilterBar` instead.

| Editing… | Read first |
|----------|-----------|
| `FilterPanel.js` or `getChatFilterConditions` | [Shared filter logic](#shared-filter-logic) + [Cross-dashboard gotchas](#cross-dashboard-gotchas) |
| Chat / Eval / AutoEval / Metrics table dashboards | same, plus [tables.md](tables.md) |
| Public or Partner card dashboard | [Public & partner card dashboards](#public--partner-card-dashboards) |

## Shared filter logic

A change to `FilterPanel.js` or `getChatFilterConditions` must be verified on **every consumer** — each has a different pipeline shape (field paths, `$lookup` order, stored formats):

- **ChatDashboardPage** (`api/chat/chat-dashboard.js`)
- **EvalDashboardPage / AutoEvalDashboardPage** (`api/eval/eval-dashboard.js`) — aggregates from `Chat`, unwinds `interactions`; uses `basePath: 'interactions'`, `userField: 'user'`; `referringUrl` may lack a protocol prefix
- **MetricsDashboard** (`api/metrics/metrics-common.js` + metric endpoints)
- **PartnerDashboard** (`api/metrics/*` via `parseRequestFilters`)
- **ChatViewer / Chat logs list** (`api/db/db-chat-logs.js`)
- **Export/Download** (`api/chat/chat-export-logs.js`) — a `$lookup` overwrites `user`; apply the user-type filter early in `dateFilter`

**A new/changed `FilterPanel` field must also be forwarded by `ChatLogsDashboard.js`.** `ChatDashboardPage` forwards every filter key generically; `ChatLogsDashboard.js`'s `handleApplyFilters` hand-picks fields into `URLSearchParams` (`startDate`, `endDate`, `department`, `urlEn`, `urlFr`, `userType`, `answerType`, `partnerEval`, `aiEval`, `evalLogic`). A missing field is silently dropped from the download.

**`partnerEval`/`aiEval`/`answerType` allow-lists are hand-duplicated.** `api/db/db-chat-logs.js` and `api/chat/chat-export-logs.js` each keep `validCategories`/`validPartnerEvalCategories`/`validAnswerTypes` arrays that 400 a request before the pipeline runs. A new pseudo-category (like `noEval`, `hasContentIssue`) must be added to `chat-filters.js`, `FilterPanel.js`, **and both** arrays.

## Cross-dashboard gotchas

- **DataTables `stateSave`**: when changing column `searchable`/`orderable`, bump the page's `TABLE_STORAGE_KEY` version — stale localStorage silently applies old column filters.
- **Eval dashboard aggregates from `Chat`, then unwinds interactions**: one row per interaction, but `user`, `chatId`, `pageLanguage` stay on the chat document.
- **Cleanup `$project` stages**: a field added via `$lookup` + `$addFields` must survive any later `$project` that needs it.
- **Only AutoEval has per-column filters** (built in `initComplete`, sent as `columnSearch`; no global search). Chat and Eval use one global search. Adding column filters to Chat needs frontend (`initComplete` + `columnSearch`) and backend (`chat-dashboard.js`) work; the eval endpoint already handles `columnSearch`.
- **Chat grouping is shared**: striping and keep-chat-together cells for Chat, Eval and AutoEval come from `src/utils/admin/chatGroupedTable.js` — see [tables.md](tables.md#grouped-chat-tables).

---

# Public & partner card dashboards

| Dashboard | Page | Component | Audience |
|-----------|------|-----------|----------|
| Public | `src/pages/PublicDashboardPage.js` | `src/components/admin/PublicDashboard.js` | admin + partner |
| Partner | admin/partner area | `src/components/admin/PartnerDashboard.js` | admin + partner |

Same building blocks, same metric bundle, deliberately close layouts with a few intentional differences (below).

## Data flow

```
FilterPanel / DashboardFilterBar  ──onApply(filters)──►  useDashboardMetrics.fetchMetrics(filters)
                                                              ▼
        MetricsService.getXxxMetrics(filters)  ──►  /api/metrics/* endpoints  ──►  parseRequestFilters()
                                                              ▼
                              setMetrics({ ...usage, ...session, ...expert, ...ai, ...publicFb, ...dept, ...technical, ...tail })
```

- **`src/hooks/admin/useDashboardMetrics.js`** — 7 parallel fetches (usage, sessions, expert, ai, public feedback, departments, technical), then a best-effort tail round: blocked queries always; referrals, citations, programs, content-issue chats and harmful chats only when opted in (`useDashboardMetrics({ includeReferrals, includeCitations, includePrograms, includeContentIssueChats, includeHarmfulChats })` — partner opts into all five, public into none). Each tail fetch falls back to its empty shape on failure. `fetchMetrics(filters)` passes the filters object through unchanged.
- **`src/services/MetricsService.js`** — `_fetchMetric` serializes the filters object to query params.
- **`api/metrics/*.js`** — each endpoint calls `parseRequestFilters(req)` (`metrics-common.js`), reading `startDate/endDate/timezoneOffsetMinutes/department/userType/answerType/partnerEval/aiEval/urlEn/urlFr`. `userType` `'all'`/undefined = no filter.

## Filter components

| Component | Used by | Notes |
|-----------|---------|-------|
| `FilterPanel.js` | **Partner**, `MetricsDashboard` | Full filter: date range (default last 7 days), dept, userType, advanced (answerType/partnerEval/aiEval/url). `autoApply` loads on mount; `defaultUserType="all"`. |
| `DashboardFilterBar.js` | **Public** | Presets only: Last 30 days / Current quarter / Last 12 months (key `allTime`) / Custom. Auto-fires on mount. **Date range is the only filter** — no department (all-of-government) and no userType (`PublicDashboard` fixes `userType: 'public'`). |

End dates run through today (23:59:59); the picker allows today. There is **no** backend cap at yesterday (an earlier cap hid the current day's data and was reverted).

**Same-named presets must compute the same span in both components** — currently only "Last 30 Days"/`last30`. Day-counted presets are an *N-day window inclusive of today*: subtract `N − 1` (`subtract(29, 'days')`). Presets unique to one side (`Today`/`Yesterday`/`This Month`/`Last Month`; `currentQuarter`/`allTime`) are free to differ.

**`allTime` ("Last 12 months")** is a rolling 12-month window clamped to the first date with data: `start = max(firstDataDate, today − 12 months)`. While less than a year of data exists it's effectively "all data"; it becomes a true rolling year on its own. `firstDataDate` arrives as `minDate`; the range heading and the start input both clamp to it, so they always agree.

**Auto-load on mount.** `DashboardFilterBar` fires `onInitialLoad` (or `onApply`) once with the `allTime` range. If that default fetch gets slow as data grows, drop `onInitialLoad` from `PublicDashboard` so the bar waits for Apply.

**`FilterPanel` auto-close.** The panel closes after a fetch with results and stays open on error/zero results, via the `skipNextAutoClose` ref. `handleClear` sets it (it also calls `setIsOpen(true)`, which the auto-close would otherwise fight). `removeFilter` (pill ×) deliberately does not — removing a pill is a re-apply, so closing on results is correct.

## Public vs partner differences

**Public is public-only.** `PublicDashboard` injects `userType: 'public'` on every fetch, excluding admin/partner test traffic. Fixed in code; `publicDashboard.description` states the exclusion — keep the two in sync.

**Public is a trimmed cut of partner.** Deliberately absent, don't restore for symmetry:
- No token counts, no harmful card (internal cost/moderation detail).
- No "Operations metrics" section — the median response-time card sits beside the conversation-length donut.
- No satisfaction section (public-feedback metrics are still fetched, just not rendered).

**Public section order**: KPI row (accuracy donut + questions asked, then expert-evaluated → content issues) → top institutions → conversation length + median response time → blocked queries. Expert-evaluated precedes content issues because the issues are identified by those evaluators.

**Partner-only sections**: operations metrics (with tokens), top referral pages, top citation pages + answer types, question volume by program, satisfaction, content-issue and harmful chat lists (`ContentIssueChatsCard`, linked from the Content issues/Harmful `StatCard`s), and "Run eval analysis" (`EvalAnalysisSection`, enabled only with an institution filter).

## Metric bundle shape

```
metrics.firstDataDate                                    // earliest createdAt in range; null if no data
metrics.totalQuestions / totalQuestionsEn / totalQuestionsFr / totalConversations
metrics.totalInputTokens / totalOutputTokens (+En/Fr)    // usage
metrics.responseTime.{ count, median, p90, p95, max, maxChatId }   // ms, technical
metrics.sessionsByQuestionCount.{singleQuestion,twoQuestions,threeQuestions}.total
metrics.byDepartment[dept].{ total, expertScored.total } // total = interactions, not conversations
metrics.expertScored.<cat>.{ total, en, fr }   // cat: total, correct, needsImprovement, hasError,
                                                //      hasCitationError, harmful, hasContentIssue
metrics.aiScored.<cat>.{ total, en, fr }        // same, no hasContentIssue
metrics.expertScored.hasContentIssue.{ total, en, fr, needsImprovement, hasError }
metrics.publicFeedbackTotals.{ totalQuestionsWithFeedback, yes, no, enYes, enNo, frYes, frNo }
metrics.publicFeedbackReasons.{ yes, no }       // keyed by score (string) -> { en, fr, total }
metrics.blockedQueries.<type>.{ total, en, fr } // tooShort, piStage1, piStage2, profanity, threat,
                                                //   manipulation, azureGuardrail, unsupportedLanguage, total
metrics.topReferrals[]      // partner: [{ url, count }] top 20; count = CONVERSATIONS
metrics.topPrograms[]       // partner: [{ program, count, en, fr, programFr }]; 'unknown' = unclassified
metrics.topCitations[]      // partner: [{ url, count }] top 20; count = QUESTIONS citing the page
metrics.answerTypeBreakdown.{ normal, 'clarifying-question', 'pt-muni', 'not-gc' }
metrics.contentIssueChats[] / harmfulChats[]   // partner: [{ chatId, interactionId, pageLanguage, createdAt, status? }]
```

### What each metric counts

Most metrics count **interactions** (one per question): `totalQuestions`, `expertScored`, `aiScored`, `publicFeedback`, `byDepartment.total`, `byDepartmentCount`. A 3-question TBS session counts 3 toward TBS.

Chat-level on purpose: **`totalConversations`** (distinct Chat IDs), **`sessionsByQuestionCount`** (session depth), and **`topReferrals`** (see below). A new metric that aggregates from `Chat` without `$unwind`ing interactions must have an intentional counting unit.

Sources: expert `metrics-expert-feedback.js`, AI `metrics-ai-eval.js`, public feedback `metrics-public-feedback.js`, tokens `metrics-usage.js`, `responseTime` `metrics-technical.js`. Both dashboards show `responseTime.median`/`p95` in seconds.

## Shared UI building blocks (`src/components/admin/dashboard/`)

Charts are **recharts**, wrapped in `.dashboard-card` (white, `1px solid` border, no radius, no shadow — square corners throughout). Match this chrome for any new card. Colours: `src/constants/dashboardColours.js`.

**Every chart needs a text alternative.** Recharts SVGs expose data only on hover (WCAG 1.1.1/2.1.1 miss). `DonutCard`, `HBarCard`, `DivergingBarCard`, `StackedBarCard` take an `a11y` prop that renders a "Table view" `<details>` (`ChartDataToggle` → `ChartDataTable`) below the chart with the same `data`. Any **new** chart must do the same. Build one `a11y` object per page:

```jsx
const chartA11y = {
  categoryLabel: t('common.chartCategoryColumn'),
  valueLabel: t('common.chartValueColumn'),
  percentLabel: t('common.chartPercentColumn'),
  captionTemplate: t('common.chartDataTableCaption'),
  rawDataTableLabel: t('common.chartDataTableSummary'),
};
```

`StackedBarCard`'s `leftContent` mode replaces `title`/`subtitle`, so also pass `a11yTitle` for the table caption.

| File | Purpose |
|------|---------|
| `StatCard.js` | KPI card: label + big number + optional sub. `uppercase` = partner style. `href` makes the card a same-page link. |
| `ChartDataToggle.js` / `ChartDataTable.js` | The text-alternative "Table view"; only rendered via a chart's `a11y` prop. |
| `DonutCard.js` | Donut + centre figure; per-slice `colours[]`. |
| `HBarCard.js` | Horizontal bars; per-bar `data[i].colour`; `percent` mode; integer ticks; `<LabelList>` values; optional `tooltipContent`. |
| `DivergingBarCard.js` | Bars from a zero baseline: `positive` picks the side; label shows **% of total**, tooltip the count; symmetric domain. Partner satisfaction only. |
| `StackedBarCard.js` | Stacked bar; `leftContent` mode (see above). |
| `NoDataCard.js` | Same title + `common.notEnoughData`, shown in place of a chart below its sample threshold. |
| `CollapsibleCard.js` | Shell for a card whose heading/subtext stay visible and whose content sits behind a link-styled `<details>` trigger. `anchorId` for same-page links into the collapsed content. |
| `CountTable.js` | Two-column label/count table; `rows = [{ key, label, count, href? }]`. |
| `ReferralUrlsCard.js` | `CollapsibleCard` + `CountTable` of top referral pages. Partner only. |
| `CitationPagesCard.js` | `CollapsibleCard` + `CountTable` of top citation pages. Partner only. |
| `AnswerTypesCard.js` | `CollapsibleCard` + answer-type breakdown table (split out of `CitationPagesCard`). Partner only. |
| `ContentIssueChatsCard.js` | Collapsible list of chats matching an expert-feedback flag, each linking to review mode in a new tab; optional per-row `status` pill. Partner only. |
| `EvalAnalysisSection.js` / `EvalAnalysisReport.js` | "Run eval analysis" at the bottom of partner (see `useEvalAnalysis`). |

## Pure data helpers (`src/utils/dashboard/feedbackBreakdown.js`)

- `buildQualityBarData(expertScored, aiScored, t)` — quality bar rows as % of combined evals, fixed order, "Has answer error" last. Harmful isn't its own bar (the API folds harmful into `hasError`).
- `splitPublicFeedbackTotals(totals, noReasonsByScore)` — positive/negative **by score, not the yes/no click**.
- `buildFeedbackSplitData(totals, reasons, t)` — donut rows.
- `buildFeedbackReasonsData(reasons, t)` — reason rows in fixed `FEEDBACK_REASON_ORDER` (positives first, then negatives — not count-sorted), zero rows dropped; each row carries `positive` and `colour`. Edit `FEEDBACK_REASON_ORDER` to re-order.
- Score → positive/negative: `src/constants/UserFeedbackOptions.js` (`isPositiveScore`, `POSITIVE_SCORES`).

## Domain rules that are easy to get wrong

- **Accuracy** = `100 − round(hasError/total)`. The API's `hasError` count already includes `harmful` (the review UI only allows harmful after Incorrect). Citation issues and needs-improvement do **not** lower accuracy. Rendered as the accuracy donut on both dashboards, gated at `>= 10` combined evals; the EN/FR footer shows only when *each* language has **more than 10** evals, else omitted.
- **Category is mutually exclusive**, priority `harmful > hasCitationError > hasError > needsImprovement > correct` (`getPartnerEvalAggregationExpression`, `chat-filters.js`).
- **Citation errors are not answer errors** and can't carry harmful/content flags. The answer-error signal is sentence/total score `0` only.
- **Content issues** (`hasContentIssue`, expert-only) split into `needsImprovement` vs `hasError` by the raw error signal; the two sum to the total.
- **Public feedback `notWanted`** is a *no* click but counts as **positive**. Classify by score, not `feedback`.

## Safety: blocked-query counter

Guardrail-blocked queries (too short, word lists, PI detection, Azure filter, unsupported language) throw before `persistNode` and are never stored; a **text-free** counter is the only record.

- **Tagging:** each throw site in `agents/graphs/guardrails/` sets `blockType` on the error; multi-list hits classify to one primary bucket.
- **Recording:** the `catch` in `api/chat/chat-graph-run.js` fires `BlockedQueryService.record(...)` — never awaited, never throws.
- **Storage:** `models/blockedQueryCounter.js`, day-bucketed `{ date, type, lang, userType, count }` with atomic `$inc`. `userType` is `admin | referredPublic | publicOther` (`classifyUserType`, reusing `isReferredPublicUrl`).
- **Endpoint:** `api/metrics/metrics-blocked.js` → `metrics.blockedQueries`. Honours date range + `userType`; **ignores department** (blocks happen before it's known).
- **UI:** public and partner = `StatCard` (total) + `HBarCard` (by type, fixed order, zero rows dropped). Partner **hides the view when a department is selected** (`blockedQueries.deptNote`). Types/order: `src/constants/blockedQueryTypes.js`. Technical dashboard shows none — intentional.
- **"Private details" is a display-only merge** of `piStage1` + `piStage2` (`BLOCK_QUERY_GROUPS` in `blockedQueryTypes.js`, summed by `buildBlockedBarData` in `src/utils/dashboard/blockedQueryBars.js` — both dashboards call it). Storage and API keep the stages separate.
- **Partner userType is NOT forced to public** — partners see their own admin testing traffic. Don't "fix" it to match public.
- **No backfill:** counts accrue from deploy forward. Tests: `__tests__/blockedQueryService.test.js`, `src/utils/dashboard/blockedQueryBars.test.js`.

## Top referral pages (partner only)

- **Counting unit = CONVERSATIONS.** Collapses to distinct `(referringUrl, chat)` pairs first, then counts per URL, so multi-question sessions don't bias the list (two-stage grouping is also DocumentDB-friendly).
- **Endpoint:** `api/metrics/metrics-referrals.js` → `metrics.topReferrals`. Honours date range, userType/url filters, and department (the `contexts` lookup is skipped when no department is selected).
- **Normalization:** `api/util/normalizeReferralUrl.js` reduces raw referrers to a page key (strip protocol/`www.`/query/fragment/trailing slash; lowercase host); returns `null` for blanks and AI Answers self-referrals (`SELF_REFERRAL_LABELS`).
- **`RAW_URL_CAP` (500):** top 500 raw URLs are fetched before Node merges. Raise it only if one page fragments across hundreds of low-count variants.
- Tests: `__tests__/normalizeReferralUrl.test.js`, `__tests__/api.metrics-referrals.test.js`.

## Top citation pages + answer types (partner only)

Citations live in the `citations` collection (`providedCitationUrl`, fallback `aiCitationUrl`) via `answer.citation`; only `normal` answers carry one.

- **Counting unit = QUESTIONS.** One aggregation groups by `(answerType, citationUrl)`; Node sums per answer type and merges/ranks URLs via `normalizeReferralUrl`. Honours date range, userType/url, department.
- **Uncapped** — the answer-type totals need every group. If citation-URL cardinality explodes, split the breakdown into its own aggregation and cap the URL one.
- The URL list keys off any non-empty citation URL (robust to legacy `answerType`); the breakdown tallies the four known types.
- UI: `CitationPagesCard` + `AnswerTypesCard`. Tests: `__tests__/api.metrics-citations.test.js`.

## Question volume by program (partner only)

Ranked bar of `context.program`, directly under the accuracy row.

- **Bars are % of all *classified* questions**; top-N bars intentionally don't sum to 100%. Raw count + EN/FR split ride in the tooltip. The subtitle count reads lower than "Questions asked" because only `normal` answers are classified.
- **Endpoint:** `api/metrics/metrics-programs.js` → `metrics.topPrograms`, grouped by `$program` with an `en`/`fr` split by `pageLanguage`; `programFr` is the curated French name (empty → English). `'unknown'` is pulled out of the bars into the subtitle.
- Subtitle is terse at partner request. Tests: `__tests__/api.metrics-programs.test.js`.

## Satisfaction section (partner only)

A collapsible `<details>` (default closed) whose `<summary>` carries the headline (`{pct} helpful of {total} responses`).

- **Two gates:** the helpful/not donut shows from **10** responses; the per-reason `DivergingBarCard` only at **40+**. Below 10 the section is a `NoDataCard`.
- Summary styled by `.dashboard-collapse__summary` in `admin.css`.

## Local preview with mock data

Append `?mock=1` to `/en/public-dashboard` or `/en/partner-dashboard` — no backend needed, no restart. Data lives in `src/utils/dashboard/mockMetrics.js`; edit it to stress-test thresholds or layouts.

## Layout

- A lone component in a `dashboard-row` stretches full width — wrap it in `dashboard-col-third`/`dashboard-col-half` to match the neighbouring row's column count.
- Charts default to full width; beside a KPI card or donut, the chart takes the wider left column via `dashboard-chart-wide`.
- **Minimum-sample gates:** `>= 10` evals for the quality bar and accuracy donut, `>= 10` responses for the satisfaction donut, `>= 40` for the reason breakdown, `>= 10` conversations for the engagement donut. Blocked queries have no minimum.
- **Below a gate, render `NoDataCard`, don't hide the section** — a vanished card reads as a bug. Sections gated on *presence* of data (referrals, citations, programs, public's top institutions, chat lists) stay hidden when empty.

## Conventions

- **Status messages**: `StatusMessage` — `variant="error"` for fetch/export failures; `variant="info"` for the "no data for the selected filters" empty state (`common.noDataForFilters`; Public uses `publicDashboard.noData` since it has no filters to speak of). `warning` is for genuine caution (unsaved changes), not zero rows. See [status-and-error-messaging.md](status-and-error-messaging.md).
- **Loading states — by trigger, not by page:**
  - Filter-driven fetch → `<LoadingOverlay message={...} />` (`src/components/admin/LoadingOverlay.js`; blocks the whole page): Chat, Eval, AutoEval, ChatLogs, Public, Partner. Don't hand-roll `.loading-overlay` markup.
  - Multi-fetch progressive reveal (`MetricsDashboard`, `TechnicalMetricsDashboard`) → `LoadingOverlay` until the first section settles, then `SectionLoadingIndicator` per still-loading section (visual only, not a live region — one consolidated announcement instead of up to 7 simultaneous ones).
- **Locales**: `partnerDashboard.*` / `publicDashboard.*` namespaces; duplicated keys across the two are normal. Add EN + FR together; run `node scripts/find-dead-locale-keys.cjs`.
- **Numbers**: `formatNumber`/`formatPercent`/`formatDecimal` from `src/utils/numberFormat.js`.
- **En-dash ` – `** is fine in headings, date ranges, and `CRA-ARC`-style abbreviations; avoid it in chart labels/tooltips (recharts renders its own).
- **Public page title** carries "AI Answers" for screenshot identification; FR puts "Réponses IA" at the end.

## Tests

`src/utils/dashboard/feedbackBreakdown.test.js` covers the pure helpers; `__tests__/api.metrics-dashboard.test.js`, `integration.metrics-dashboard.test.js`, `api.metrics-technical.test.js` and the per-endpoint tests above cover the API.
