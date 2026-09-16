# Tables

Read this before adding or changing any table — a DataTables instance or a plain `<table>` — on an admin/partner page. Every table in the app follows one aligned design; new ones must match it rather than pick their own zones, box styles, or pagination.

## The two table styles: search vs. filter

Every server-side table has one text box top-left. Which of two styles it uses depends on what the box does:

| | **Search-style** | **Filter-style** |
|---|---|---|
| Where | The Chat and Eval **dashboards** — the box is the table's primary way of finding rows across the whole dataset | Tables **inside a page** (Users, Sessions, Settings history, Batch list, Chat viewer log entries, Metrics institution breakdown, Similar chats) — the box narrows the rows already on screen |
| Label | Visible bold `Search:` (`admin.common.searchLabel`) | sr-only label (page-specific key, e.g. `admin.session.filterLabel`) |
| Placeholder | `admin.common.searchPlaceholder` ("e.g. tax, contact, account") | `admin.common.filterPlaceholder` ("Filter") |
| Box | 1px black border, sits right of the label | 2px black border, flush left, native clear (×) always visible |
| Search-term pill | Yes — dismissible `.filter-pill`, injected by `wireTableAccessibility` | No (the × does that job) |
| Container class | `dashboard-table-container` | `metrics-table-container` |

AutoEval is a third case: no global box at all, per-column filter controls in each header (`.dt-col-filter-container`, sent as `columnSearch`) — see [dashboards.md](dashboards.md#cross-dashboard-gotchas).

The CSS behind both styles is keyed on the DOM DataTables builds: a filter-style box is any `.dt-search` whose `<label>` contains a `.sr-only` span (`:has(> label > .sr-only)`), so you get it by passing the sr-only label — no extra class.

## Shared layout: the four zones

The paginated admin tables (Chat, Eval, AutoEval, Users, Sessions, Batch list, Similar chats, Metrics institutions, Chat viewer log entries) all pass the same DataTables `layout`:

```js
layout: {
  topStart: 'search',                                 // the search/filter box
  topEnd: {},
  bottomStart: { features: ['pageLength', 'info'] },  // "Showing X to Y of Z" + entries per page
  bottomEnd: { paging: { firstLast: false } },        // Previous / numbers / Next
},
```

`ServerDataTable` applies only `bottomEnd`, so pass the other three zones via its `layout` prop — `SettingsPage` and `PublicEvalPage` currently don't, and fall back to DataTables' default (page-length top-left, search top-right); aligning them is a pending tidy-up, not a design choice. Don't try to stack "Showing X to Y" under the search box via DataTables' numbered row slots (`top2Start`) — it never worked reliably; `bottomStart` is the one native position that does.

**Pagination** on every instance is styled like GC DS `gcds-pagination` (list display, ~70% size: 14px text, 2.125rem targets) by `div.dt-container div.dt-paging` in `admin.css` — no per-table CSS. Previous is omitted on the first page and Next on the last; `installPagingFocusGuard()` (installed once in `App.js`) moves keyboard focus to the current page number when the button just pressed disappears.

## Class cheat-sheet

Container (the `<div>` around `<DataTable>`):

| Class | Use |
|---|---|
| `dashboard-table-container` | Chat/Eval/AutoEval dashboards, Batch list: 90vw breakout, horizontal scroll. Add `--grouped` on the chat-grouped dashboards (zeroes the compounding gap under the FilterPanel pills). |
| `metrics-table-container` | Any table that stays inside the page's normal width (Users, Sessions, Settings, Metrics, Similar chats, End-user feedback, Chat viewer). Same box/label rules as above — the two rule sets are copied; keep them in sync. |
| `experimental-table-container` | `ServerDataTable`'s default (`containerClassName`) and the experimental pages: 100vw breakout. |
| `table-scroll` | Overflow wrapper for a non-DataTables `<table>` (Vector page); Settings also adds it to its `ServerDataTable` container. Give it `tabIndex={0}` so Safari/Firefox keyboard users can reach and scroll it. |

Table (`className` on `<DataTable>` / `<table>`):

| Class | Use |
|---|---|
| `display dashboard-table zebra-stable-on-hover` | The standard striped server-side table. `dashboard-table` carries the sorted-column highlight and header sort arrows; `zebra-stable-on-hover` keeps the stripe colour on hover instead of DataTables' flat hover fill. |
| `display dashboard-table dashboard-table--grouped` | Chat-grouped dashboards only (with `dashboard-table-container--grouped`); replaces `zebra-stable-on-hover`, since striping is per chat, not per row — see below. |
| `dataTable table-slim-padding` | Dense read-only tables (Chat viewer timelines, Vector page). Add `table-key-value` for a two-column label/value table that shrinks to its content, `table-fixed-layout` for a table whose rows arrive one at a time and shouldn't shift. |
| `review-table` | The chat review panels (`chat.css`), not admin tables. |

Cells: `col-chat-id` (fixed 150px, UUID wraps to two lines), `col-nowrap`. In grouped tables the helper sets `group-cell`/`group-cell--start|mid|end` itself; `chat-id-cell` is passed by the page as the chatId column's `extraClass`.

## Accessibility wiring (`src/utils/admin/dataTableAccessibility.js`)

Call from the table's `initComplete`:

- `setColumnHeaderScope(api)` — `scope="col"` on every header (DataTables doesn't set it). For a table with no search box.
- `wireTableAccessibility(api, { t })` — the above plus the dismissible search-term pill. Used by the search-style tables; filter-style tables don't have a pill (the box's native × clears it), so they use `setColumnHeaderScope` alone. AutoEval also calls it — the pill half is a deliberate no-op there (no `.dt-search` box); don't "fix" it to `setColumnHeaderScope`.
- `getHeaderTitleText(header)` — a header's title without any filter control text appended into it.

Every table also needs an **sr-only `<caption>`** naming it (`ServerDataTable`'s `caption` prop; `<caption className="sr-only">` on hand-rolled/plain tables) and `scope="col"` on plain `<table>` headers. Column filter controls get `aria-label="{Filter} — {column title}"`.

React content inside a DataTables cell must mount through `src/utils/dataTableCellRoot.js` (one live root per cell; `createRoot` on a reused cell leaks and warns).

`language: dataTableLanguage(lang)` (`src/utils/dataTableLanguage.js`) supplies the French strings; spread and override `search`/`searchPlaceholder` for the box label.

## Grouped chat tables

Chat, Eval and AutoEval rows are question/answer pairs; a multi-turn chat spans consecutive rows with the same `chatId` (the backends' sort tiebreaker keeps them adjacent under any sort). `src/utils/admin/chatGroupedTable.js` makes them read as one group:

```js
const groupState = useRef(createChatGroupState());
// in the DataTables options:
...buildChatGroupCallbacks({
  stateRef: groupState,
  columns,
  groupedColumns: [
    { data: 'chatId', boundByChatId: false, extraClass: 'chat-id-cell' },
    { data: 'department' },   // boundByChatId defaults to true; mergeEmpty, extraClass optional
  ],
})
```

- `createdRow` stripes by chat (`chat-group-a`/`chat-group-b`, `chat-group-start`).
- `drawCallback` makes keep-chat-together cells for `groupedColumns`: the value shows on the group's first row; the cells below keep it as `sr-only` text with the inter-row border removed by CSS, so every row still reads completely in a screen reader's linear mode. This is deliberately **not** `rowSpan` — a cell per row is reliable in every reader and reading mode.
- To group another column, add it to the page's `groupedColumns` — don't write a new `drawCallback`.

Column filters (AutoEval) initialise from `column.search()` so a `stateSave`-restored filter is visible; a box holding a filter gets the sorted column's blue fill; a zero result caused by column filters names them rather than blaming the panel filters.

## `ServerDataTable.js` — the shared wrapper

Two wrappers around `datatables.net-react` exist; don't mix them up:

| | `src/components/admin/ServerDataTable.js` | `src/components/experimental/ExperimentalServerDataTable.js` |
|---|---|---|
| Status | Stable — production pages may depend on it | Free to change |
| Consumers | `SettingsPage.js` | `ExperimentalAnalysisPage.js`, `ExperimentalDatasetsPage.js` |
| Use for | Any new production table | Experimental pages only |

Props: `columns`, `fetchData` (`{ start, length, search, orderBy, orderDir }` → `{ data, recordsTotal, recordsFiltered }`), `tableKey`, `lang`, `caption`, `searchLabelSrOnly` + `searchPlaceholder` (filter-style box), `order`, `ordering`, `pageLength`, `lengthChange`, `layout`, `renderActions`/`actionsTitle`/`actionsWidth`, `emptyTableText`, `initialResult`, `containerClassName`, `onError`.

To refresh after something else changes the data, use the ref, not `tableKey`:

```jsx
const tableRef = useRef(null);
<ServerDataTable ref={tableRef} tableKey="my-table" columns={columns} fetchData={fetchData} caption={t('…')} searchLabelSrOnly={t('…')} searchPlaceholder={t('admin.common.filterPlaceholder')} />
tableRef.current?.reload();   // re-fetches in place, keeps page/search/sort
```

Bumping `tableKey` remounts the table and silently resets what the user typed or paged to — only for a genuine column/schema change.

## Hand-rolled tables and migration

Chat, Eval, AutoEval, Metrics, Technical metrics, Similar chats, Batch list, Sessions, Users, Chat viewer and Public eval still wire `DataTable.use(DT)`/`columns`/`options`/`ajax` themselves. They all follow the shared zones, classes and a11y helpers above, so a new hand-rolled table has no excuse not to. Consolidating them onto `ServerDataTable` is a real goal — if you're already changing one of these tables' setup, consider migrating it; don't take it on as a side quest.

Chat/Eval/AutoEval also ignore an ajax response that lands after Clear all unmounted the table (or after a newer request) — keep that guard when touching their ajax handlers.

Dashboard filter wiring (`FilterPanel`, `stateSave` versioning, `columnSearch`) is in [dashboards.md](dashboards.md).
