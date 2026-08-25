// Shared DOM-only accessibility wiring for a DataTable with a single global
// search box (Chat/Eval/Metrics dashboards) — call once from that table's own
// `initComplete`. No React state involved; everything here is imperative
// DOM, mirroring DataTables' own imperative init style.
//
//   - scope="col" on every header cell: DataTables doesn't set this itself
//     (a real WCAG 1.3.1 gap in the library, not something a config option
//     turns on).
//   - A dismissible search-term pill next to the search box, same
//     .filter-pill styling FilterPanel.js uses for its own active-filter
//     pills, so the current term is visible and clearable without needing
//     to select/delete the input text.
//
// Previously hand-duplicated (near-identically) across ChatDashboardPage.js,
// EvalDashboardPage.js, and MetricsDashboard.js.

/**
 * @param {object} api - the DataTables API instance (`this.api()` inside initComplete)
 * @param {object} options
 * @param {function} options.t - translation function
 */
export function wireTableAccessibility(api, { t }) {
  try {
    api.columns().header().each((header) => {
      header.setAttribute('scope', 'col');
    });

    const searchContainer = api.table().container().querySelector('.dt-search');
    if (!searchContainer) return; // searching disabled on this table
    const searchInput = searchContainer.querySelector('input');

    const pillEl = document.createElement('button');
    pillEl.type = 'button';
    pillEl.className = 'filter-pill filter-pill--closable dashboard-search-pill';
    searchContainer.insertAdjacentElement('afterend', pillEl);

    const renderSearchPill = (term) => {
      pillEl.innerHTML = '';
      pillEl.style.display = term ? '' : 'none';
      if (!term) return;
      pillEl.setAttribute('aria-label', `${t('dashboardFilter.removeFilter')} - ${term}`);
      pillEl.onclick = () => {
        api.search('').draw();
        // This button hides itself right after (display: none, above) - a
        // focused element getting display:none dropped focus to <body> with
        // no indication where it went. Standard "clear search" UX anyway:
        // land back in the box to type a new term.
        searchInput?.focus();
      };
      const labelSpan = document.createTextNode(t('admin.common.searchTermPillLabel').replace('{term}', () => term));
      pillEl.appendChild(labelSpan);
      const closeIcon = document.createElement('span');
      closeIcon.className = 'filter-pill__close';
      closeIcon.setAttribute('aria-hidden', 'true');
      closeIcon.textContent = '×';
      pillEl.appendChild(closeIcon);
    };

    renderSearchPill(api.search());
    api.on('search.dt', () => renderSearchPill(api.search()));
  } catch (e) {
    // Accessibility wiring must never break the table itself.
  }
}
