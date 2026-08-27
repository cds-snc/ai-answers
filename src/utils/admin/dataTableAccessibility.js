// Shared DOM-only accessibility wiring for DataTables, called once from a
// table's own `initComplete`. No React state involved; everything here is
// imperative DOM, mirroring DataTables' own imperative init style.
//
//   - setColumnHeaderScope: scope="col" on every header cell. DataTables
//     doesn't set this itself (a real WCAG 1.3.1 gap in the library, not
//     something a config option turns on). Use alone for a table with no
//     search box.
//   - wireTableAccessibility: the above, plus a dismissible search-term
//     pill next to the search box, same .filter-pill styling FilterPanel.js
//     uses for its own active-filter pills. Use for a table with one.
//
// wireTableAccessibility was previously hand-duplicated (near-identically)
// across ChatDashboardPage.js, EvalDashboardPage.js, and MetricsDashboard.js.

/**
 * Scope-only half of wireTableAccessibility, for a table with no search box
 * (ChatViewer.js's step-timeline and log-entries tables).
 *
 * @param {object} api - the DataTables API instance (`this.api()` inside initComplete)
 */
export function setColumnHeaderScope(api) {
  try {
    api.columns().header().each((header) => {
      header.setAttribute('scope', 'col');
    });
  } catch (e) {
    // Accessibility wiring must never break the table itself.
  }
}

/**
 * @param {object} api - the DataTables API instance (`this.api()` inside initComplete)
 * @param {object} options
 * @param {function} options.t - translation function
 */
export function wireTableAccessibility(api, { t }) {
  // Own try/catch, isolated from the pill logic below: a scope-setting
  // failure shouldn't also skip the pill.
  setColumnHeaderScope(api);
  try {
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
