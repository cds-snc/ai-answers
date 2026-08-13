# Server-side tables

Any page rendering a paginated/searchable/sortable table backed by a server-side fetch (not just dashboards — Settings' audit history is a non-dashboard example) is built on `datatables.net-react` + `datatables.net-dt`. There are currently **two** wrapper components around that library, with different purposes — don't mix them up.

| | `src/components/admin/ServerDataTable.js` | `src/components/experimental/ExperimentalServerDataTable.js` |
|---|---|---|
| Status | Stable — safe for a production page to depend on | Free to change while trying ideas out |
| Current consumers | `SettingsPage.js` (its first) | `ExperimentalAnalysisPage.js`, `ExperimentalDatasetsPage.js` |
| Use for | Any new production table | Experimental-only pages |

**Don't add a new production table's dependency to the experimental one, and don't fold production-driven changes into it.** `components/experimental/` is deliberately a space where people can change things freely without asking "does this break a production page?" — a production page depending on it would defeat that. If you're building a table for a real (non-experimental) page, use `ServerDataTable.js`.

## `ServerDataTable.js`

Takes `columns`, `fetchData` (called with DataTables' own `{ start, length, search, orderBy, orderDir }`, returns `{ data, recordsTotal, recordsFiltered }`), plus optional `ordering`/`pageLength`/`lengthChange`/`layout`/`renderActions`/`emptyTableText` — see its own header comment for the full list.

To refresh the table after some other action changes the underlying data (e.g. a save), use the imperative ref rather than bumping `tableKey`:

```jsx
const tableRef = useRef(null);
<ServerDataTable ref={tableRef} tableKey="my-table" columns={columns} fetchData={fetchData} />
// after a save:
tableRef.current?.reload();
```

`tableRef.current.reload()` re-fetches the current page/search/sort in place via the DataTables API's own `ajax.reload(null, false)`. Bumping the `tableKey` prop instead forces a full unmount/remount — only do that for a genuine schema/column change; using it as a "just refetch" mechanism silently resets whatever the user had typed into the search box or paged to (this was a real bug in an earlier version of the Settings audit history table).

## Migrating an existing hand-rolled table

Most tables in this app (ChatDashboardPage, EvalDashboardPage, AutoEvalDashboardPage, `MetricsDashboard`, SessionPage, UsersPage, PublicEvalPage) still hand-roll their own `DataTable.use(DT)`/`columns`/`options`/`ajax` wiring rather than using `ServerDataTable.js`. Consolidating them onto it is a real goal, not done yet — each has its own accumulated per-page behavior (ChatDashboardPage's `stateSave`/localStorage persistence and filter-driven ajax params in particular) that needs its own careful migration, not a single sweeping rename. If you're touching one of these pages' table setup anyway, consider migrating it onto `ServerDataTable.js` as part of that work rather than extending the hand-rolled version further — but don't take on the migration as an unrelated side quest to an unrelated task.

Dashboard-specific table behavior (per-column filters, `stateSave` versioning, shared filter logic) is documented in [dashboards.md](dashboards.md) — this file covers the table component itself, not dashboard-specific filter wiring.
