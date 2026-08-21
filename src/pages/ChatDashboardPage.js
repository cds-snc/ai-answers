import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@gcds-core/components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import { dataTableLanguage } from '../utils/dataTableLanguage.js';
import FilterPanel from '../components/admin/FilterPanel.js';
import DashboardService from '../services/DashboardService.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import LoadingOverlay from '../components/admin/LoadingOverlay.js';
import { escapeHtmlAttribute, buildChatReviewLinkHtml } from '../utils/reviewLink.js';
import { normalizeAnswerText } from '../utils/answerText.js';
import { formatNumber } from '../utils/numberFormat.js';

DataTable.use(DT);

const formatDateForApi = (value) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const pad = (num) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};

const getTimezoneOffsetMinutes = (value) => {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset();
  return Number.isFinite(offset) ? offset : undefined;
};

const TABLE_STORAGE_KEY = `chatDashboard_tableState_v2_`;

const ChatDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tableKey, setTableKey] = useState(0);
  const [dataTableReady, setDataTableReady] = useState(false);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // sr-only announcement of a search narrowing the result set to a non-zero
  // count (SC 4.1.3) - DataTables' own "Showing X to Y of Z" text has no
  // aria-live, so a screen reader user typing a search term that goes from
  // e.g. 50 to 3 results gets no indication anything changed. The zero-
  // result case is already covered by the visible noSearchResults
  // StatusMessage below. nonce is bumped alongside so a second, different
  // search that happens to land on the same count still re-announces (same
  // persistent+sr-only+nonce pattern as ConnectivityPage/VectorPage).
  const [searchAnnouncement, setSearchAnnouncement] = useState('');
  const [searchAnnounceNonce, setSearchAnnounceNonce] = useState(0);
  // Same reasoning, opposite case: the zero-result StatusMessage below is a
  // plain conditional render, not persistent+sr-only, but has the identical
  // no-op-remount problem when its text is IDENTICAL across two different
  // triggers - e.g. editing one bad search term into another bad one both
  // render "No search results found.", so nothing in the DOM actually
  // changes and a screen reader user gets no indication the second search
  // even ran. Bumped on every ajax completion that lands on zero (not
  // gated to "new search term only" like searchAnnounceNonce - a 0-result
  // page can't be paged further, so every such completion is a genuinely
  // new query, not a repeat draw of the same one).
  const [zeroResultNonce, setZeroResultNonce] = useState(0);
  const previousSearchTermRef = useRef('');

  const tableApiRef = useRef(null);
  const filtersRef = useRef({});
  // Tracks chat-group striping state across a single draw's rows (reset in
  // preDrawCallback, mutated in createdRow as each row is built in order).
  const chatGroupStateRef = useRef({ lastChatId: undefined, parity: 0 });

  const LOCAL_TABLE_STORAGE_KEY = `${TABLE_STORAGE_KEY}${lang}`;

  // Helper function to truncate URL to path only (max 3 segments)
  const truncateUrl = useCallback((url) => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part !== '');

      // If no path segments or only 1 segment, show the domain
      if (pathParts.length <= 1) {
        const domain = urlObj.hostname.replace(/^www\./, '');
        return pathParts.length === 1 ? `${domain}/${pathParts[0]}` : domain;
      }

      // Keep only the last 3 path segments for longer URLs
      const truncatedParts = pathParts.slice(-3);
      return '/' + truncatedParts.join('/');
    } catch {
      return url;
    }
  }, []);

  // Question/Answer cell text: strip pipeline-added sentence markers
  // (<s-1>...</s-1>, added for per-sentence citation/scoring) so they never
  // show up as literal text, and render the full content - no truncation.
  const renderAnswerText = useCallback((value) => {
    if (!value) return '';
    return escapeHtmlAttribute(normalizeAnswerText(value));
  }, []);

  useEffect(() => {
    setTimeout(() => setDataTableReady(true), 0);
  }, []);

  const handleApplyFilters = useCallback((filters) => {
    const enrichedFilters = { ...(filters || {}) };
    const tzOffset = getTimezoneOffsetMinutes(enrichedFilters.startDate || enrichedFilters.endDate);
    if (tzOffset !== undefined) {
      enrichedFilters.timezoneOffsetMinutes = tzOffset;
    }
    filtersRef.current = enrichedFilters;
    setHasAppliedFilters(true);
    setLoading(true);
    try {
      if (tableApiRef.current) {
        tableApiRef.current.ajax.reload();
      } else {
        setTableKey((prev) => prev + 1);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Clear all is a restart, not a re-apply: unlike removing a single pill or
  // reopening the panel to change one field (both of which keep the results
  // area showing and re-fetch with the new selection - see FilterPanel's own
  // removeFilter/handleApply), Clear all means "I haven't chosen anything
  // yet". So this resets hasAppliedFilters to false - the exact same gate
  // that hides the whole results block before the first-ever Apply - rather
  // than silently auto-fetching the reset defaults and showing a result set
  // the user never asked for. Nothing renders again until an explicit Apply.
  const handleClearFilters = useCallback(() => {
    // Clear saved table state
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        try { window.localStorage.removeItem(LOCAL_TABLE_STORAGE_KEY); } catch (e) { void e; }
        try { window.localStorage.removeItem(TABLE_STORAGE_KEY); } catch (e) { void e; }
      }
    } catch (e) {
      void e;
    }
    filtersRef.current = {};
    // Stale otherwise: the DataTable unmounts (hasAppliedFilters below gates
    // it), but nothing else clears this ref, and a truthy leftover would
    // fool the next handleApplyFilters' `if (tableApiRef.current)` check
    // into calling .ajax.reload() on an already-destroyed table instead of
    // mounting a fresh one.
    tableApiRef.current = null;
    setHasAppliedFilters(false);
    setRecordsTotal(0);
    setSearchTerm('');
    // Clear all unmounts the whole results section (hasAppliedFilters
    // gates it) with no other indication anything happened - the acting
    // control (the Clear all button, inside FilterPanel) keeps focus, so
    // this isn't a focus-loss issue like the chat ID search one, but a
    // screen reader user still gets no confirmation the reset actually
    // took effect. Reuses the same persistent+sr-only searchAnnouncement
    // region as the search-narrowing announcement, just for a different
    // message - same nonce bump so it re-announces even if cleared twice
    // in a row with nothing else changing in between.
    setSearchAnnouncement(t('admin.common.filtersClearedAnnouncement'));
    setSearchAnnounceNonce((n) => n + 1);
    previousSearchTermRef.current = '';
    setError(null);
    setLoading(false);
  }, [LOCAL_TABLE_STORAGE_KEY, t]);

  const columns = useMemo(() => ([
    {
      title: t('admin.chatDashboard.columns.chatId', 'Chat ID'),
      data: 'chatId',
      searchable: false,
      orderable: false,
      render: (value, type, row) => {
        if (!value) return '';
        const chatLang = row.pageLanguage && (row.pageLanguage.toLowerCase().includes('fr')) ? 'fr' : 'en';
        return buildChatReviewLinkHtml(value, chatLang, row.interactionId);
      }
    },
    {
      title: t('admin.chatDashboard.columns.department', 'Department'),
      data: 'department',
      searchable: false,
      orderable: true,
      render: (value) => escapeHtmlAttribute(value || '')
    },
    {
      title: t('admin.chatDashboard.columns.program', 'Service'),
      data: 'program',
      searchable: false,
      orderable: true,
      render: (value, type, row) => {
        const display = (lang === 'fr' && row && row.programFr) ? row.programFr : value;
        return display ? escapeHtmlAttribute(display) : '';
      }
    },
    {
      title: t('admin.chatDashboard.columns.question', 'Question'),
      data: 'redactedQuestion',
      searchable: false,
      orderable: false,
      render: (value) => renderAnswerText(value)
    },
    {
      title: t('admin.chatDashboard.columns.answer', 'Answer'),
      data: 'answerContent',
      searchable: false,
      orderable: false,
      render: (value) => renderAnswerText(value)
    },
    {
      title: t('admin.chatDashboard.columns.citationUrl', 'Citation link'),
      data: 'citationUrl',
      searchable: false,
      orderable: false,
      render: (value) => {
        if (!value) return '';
        // <gcds-link> (not a plain <a>) to match every other DataTables-
        // rendered link in this app (see buildChatReviewLinkHtml in
        // reviewLink.js) - the custom element auto-upgrades once inserted
        // and handles the new-tab icon/rel/accessible text itself. href is
        // the full citation URL; the visible text stays the shorthand
        // truncated form.
        const safeHref = escapeHtmlAttribute(value);
        const safeDisplay = escapeHtmlAttribute(truncateUrl(value));
        return `<gcds-link href="${safeHref}" target="_blank" lang="${lang}">${safeDisplay}</gcds-link>`;
      }
    }
  ]), [renderAnswerText, truncateUrl, t, lang]);

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">{t('admin.chatDashboard.title', 'Chat dashboard')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', 'Admin Navigation')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>
            {t('common.backToAdmin')}
          </GcdsLink>
        </GcdsText>
      </nav>

      {/* Visually hidden: the filter panel's own summary/controls already make
          its purpose clear on screen, and this heading's copy just repeated
          that at the cost of vertical space. Kept as a real heading (not
          removed) so screen-reader users navigating by heading/landmark
          still get this section announced. */}
      <h2 className="sr-only">{t('admin.chatDashboard.timeRangeTitle')}</h2>
      <div className="mb-100">
        <FilterPanel
          lang={lang}
          onApplyFilters={(filters) => { handleApplyFilters(filters); }}
          onClearFilters={handleClearFilters}
          isVisible={true}
          filterLoading={loading}
          filterError={error}
          // While a search term is active, a zero count means the search
          // didn't match anything - not that the filters themselves are
          // wrong, so don't feed it into FilterPanel's own "reopen on zero
          // results" logic (see the effect in FilterPanel.js keyed off
          // filterResultCount === 0). Passing null there is a no-op for
          // that effect, leaving the panel's open/closed state alone; the
          // search-specific StatusMessage below covers this case instead.
          filterResultCount={searchTerm ? null : recordsTotal}
          hasAppliedFilters={hasAppliedFilters}
        />
      </div>

      {loading && (
        <LoadingOverlay message={t('admin.chatDashboard.loading')} />
      )}

      <StatusMessage
        variant={error ? 'error' : undefined}
        message={error ? `${t('admin.chatDashboard.error')} ${String(error)}` : null}
      />

      {hasAppliedFilters && !loading && !error && recordsTotal === 0 && searchTerm && (
        <StatusMessage variant="info" message={t('admin.common.noSearchResults')} nonce={zeroResultNonce} />
      )}

      <StatusMessage persistent message={searchAnnouncement} nonce={searchAnnounceNonce} className="sr-only" />

      {hasAppliedFilters && !loading && !error && recordsTotal === 0 && !searchTerm && (
        <StatusMessage variant="info" message={t('common.noDataForFilters')} nonce={zeroResultNonce} />
      )}

      {hasAppliedFilters && (
        <div>
          {dataTableReady && (
            <div className="dashboard-table-container dashboard-table-container--grouped">
              <DataTable
                key={tableKey}
                columns={columns}
                className="display dashboard-table dashboard-table--grouped"
                options={{
                  processing: true,
                  serverSide: true,
                  paging: true,
                  searching: true,
                  ordering: true,
                  order: [],
                  // autoWidth (DataTables' default true) + scrollX together
                  // pin each column to a fixed pixel width computed from a
                  // separate header/body table pair - when a column's cell
                  // content varies a lot in width across rows/redraws (e.g.
                  // Question/Answer/Citation link, often empty), that pair
                  // falls out of sync and the header drifts away from its
                  // column's data. EvalDashboardPage.js already avoids this
                  // (autoWidth: false, no scrollX) - matching that here.
                  autoWidth: false,
                  stateSave: true,
                  // Search, entries-per-page, and the results summary all
                  // live together on the left (topStart, in that order),
                  // replacing DataTables' default top-right search
                  // placement (topEnd, left empty here) - single global
                  // search now that the Service column's own per-column
                  // filter box is gone; search covers every column server-
                  // side (see the $or in api/chat/chat-dashboard.js), not
                  // just Chat ID.
                  // Search alone on top (the search-term pill is injected
                  // beside it in initComplete). "Showing X to Y of Z" and
                  // entries-per-page both sit bottom-left, above pagination -
                  // a single native DataTables layout row, unlike stacking
                  // it under search which never reliably worked via
                  // DataTables' own numbered-row slots (e.g. top2Start).
                  layout: {
                    topStart: 'search',
                    topEnd: {},
                    bottomStart: { features: ['pageLength', 'info'] },
                    bottomEnd: 'paging'
                  },
                  language: {
                    ...dataTableLanguage(lang),
                    search: t('admin.common.searchLabel'),
                    searchPlaceholder: t('admin.common.searchPlaceholder')
                  },
                  stateSaveCallback: function (settings, data) {
                    try {
                      if (typeof window !== 'undefined' && window.localStorage) {
                        window.localStorage.setItem(LOCAL_TABLE_STORAGE_KEY, JSON.stringify(data));
                      }
                    } catch (e) {
                      // ignore
                    }
                  },
                  stateLoadCallback: function () {
                    try {
                      if (typeof window !== 'undefined' && window.localStorage) {
                        const stored = window.localStorage.getItem(LOCAL_TABLE_STORAGE_KEY);
                        const parsed = stored ? JSON.parse(stored) : null;
                        // stateSave persists the whole DataTables state -
                        // page length, sort, column order AND the search
                        // term - across reloads. Page length carrying over
                        // is expected/useful; the search term carrying over
                        // silently re-applies a stale search on a fresh
                        // page load, which reads as a bug (you refresh
                        // expecting a clean table) - same for sort: a stale
                        // sort column silently overrides the table's own
                        // default display order (createdAt desc) on refresh,
                        // which is confusing since nothing on screen
                        // indicates a non-default sort is active. Clear
                        // those two, keep the rest (page length/column
                        // visibility).
                        if (parsed && parsed.search) {
                          parsed.search.search = '';
                        }
                        if (parsed && parsed.order) {
                          delete parsed.order;
                        }
                        return parsed;
                      }
                    } catch (e) {
                      // ignore
                    }
                    return null;
                  },
                  // Each row is one question/answer pair, not one chat - a
                  // multi-turn chat spans several consecutive rows sharing a
                  // chatId (see the backend's chatCreatedAt/questionNumber
                  // sort). Plain per-row zebra striping (see .chat-dashboard-
                  // table's nth-child rule in admin.css) would cut through
                  // the middle of a chat's rows and make them look
                  // unrelated. Stripe by chat GROUP instead: every row
                  // sharing a chatId gets the same shaded/unshaded class,
                  // alternating only when the chatId changes, plus a
                  // top-border marker on the first row of each new group.
                  preDrawCallback: function () {
                    chatGroupStateRef.current = { lastChatId: undefined, parity: 0 };
                  },
                  createdRow: function (row, data) {
                    const state = chatGroupStateRef.current;
                    const chatId = data && data.chatId;
                    const isFirstRowOfPage = state.lastChatId === undefined;
                    if (chatId !== state.lastChatId) {
                      if (!isFirstRowOfPage) {
                        state.parity = state.parity === 0 ? 1 : 0;
                        row.classList.add('chat-group-start');
                      }
                      state.lastChatId = chatId;
                    }
                    row.classList.add(state.parity === 0 ? 'chat-group-a' : 'chat-group-b');
                    // Group hover used to live here (highlighting every row
                    // belonging to the same chat on mouseenter/mouseleave)
                    // but was removed: purely decorative with nothing to
                    // click, so it just read as a false affordance. Native
                    // per-row hover stays disabled below rather than
                    // reinstated - it looked broken on the rowspan'd Chat
                    // ID/Department/Service cells (a spanned cell doesn't
                    // live in every row it visually covers, so only its own
                    // anchor row would ever light up) - so there's
                    // deliberately no hover feedback at all now, not a
                    // reversion to per-row.
                  },
                  // Collapse the Chat ID/Department/Service cells across a
                  // chat's consecutive rows into single rowspan'd cells,
                  // instead of repeating identical values on every row -
                  // both a stronger visual grouping cue than striping
                  // alone, and better for screen readers (one spanned cell
                  // announced once, not the same value read out N times).
                  // Department/Service only merge WITHIN a chat's own rows,
                  // never across chats - two unrelated chats happening to
                  // share a department shouldn't look like one group.
                  // Recomputed from scratch on every draw (paging/sorting/
                  // filtering all trigger a fresh drawCallback) rather than
                  // incrementally patched, so it can't drift out of sync
                  // with whatever rows are currently rendered - safe under
                  // serverSide mode, which rebuilds row nodes per draw
                  // rather than reusing stale cached ones.
                  drawCallback: function () {
                    try {
                      const api = this.api();
                      const rowNodes = api.rows({ page: 'current' }).nodes();
                      const rowData = api.rows({ page: 'current' }).data().toArray();

                      // valueFn returns the value consecutive rows must
                      // share to merge; boundByChatId additionally requires
                      // rows to belong to the same chat (used for
                      // Department/Service so the merge never crosses a
                      // chat boundary, even if two different chats happen
                      // to share the same value).
                      // extraClass marks the Chat ID column's anchor cells
                      // specifically (regardless of span size) so the CSS
                      // vertical divider can target that class instead of
                      // `:first-child` - cell removal above means the DOM's
                      // actual first <td> in a row varies (it becomes
                      // whichever column survived removal), so position-
                      // based selectors silently pick the wrong cell.
                      const collapseColumn = (colIndex, valueFn, boundByChatId, extraClass) => {
                        if (colIndex === -1) return;
                        let i = 0;
                        while (i < rowData.length) {
                          let span = 1;
                          while (
                            i + span < rowData.length &&
                            // Merging on an empty value (several consecutive
                            // blank cells) doesn't convey anything - just a
                            // divider-bordered box around nothing. Leave those
                            // as ordinary, unmerged single-row cells instead.
                            valueFn(rowData[i]) &&
                            valueFn(rowData[i + span]) === valueFn(rowData[i]) &&
                            (!boundByChatId || rowData[i + span].chatId === rowData[i].chatId)
                          ) {
                            span += 1;
                          }
                          const anchorCell = rowNodes[i] && rowNodes[i].cells[colIndex];
                          if (anchorCell) {
                            anchorCell.rowSpan = span;
                            anchorCell.classList.toggle('row-spanned', span > 1);
                            if (extraClass) anchorCell.classList.add(extraClass);
                            // This span's last row is the page's actual
                            // last row, but the anchor cell itself (where
                            // the rowspan - and any border-bottom drawn on
                            // it - actually lives) sits higher up, on
                            // whichever row started the group. Without this,
                            // the table's bottom edge has a gap under any
                            // column still mid-span when the page ends -
                            // the closing border only reaches the columns
                            // that still have a real <td> on the last row.
                            anchorCell.classList.toggle('spans-to-page-end', i + span === rowData.length);
                          }
                          for (let j = i + 1; j < i + span; j += 1) {
                            const cellToRemove = rowNodes[j] && rowNodes[j].cells[colIndex];
                            if (cellToRemove) cellToRemove.remove();
                          }
                          i += span;
                        }
                      };

                      // Right-to-left by column index: removing a cell from
                      // a row shifts every later cell's index in that same
                      // row's live HTMLCollection, so a column must be
                      // fully processed before any column to its left.
                      collapseColumn(columns.findIndex((c) => c.data === 'program'), (r) => r.program, true);
                      collapseColumn(columns.findIndex((c) => c.data === 'department'), (r) => r.department, true);
                      collapseColumn(columns.findIndex((c) => c.data === 'chatId'), (r) => r.chatId, false, 'chat-id-cell');

                      // Sort-icon tooltip text (visual only - see the
                      // thead th[data-tooltip] comment in admin.css
                      // for why this is a sighted-user mirror, not itself
                      // an accessibility mechanism). Runs every draw, not
                      // just initComplete, because the text depends on
                      // aria-sort (set by DataTables' own header-update
                      // logic, which runs as part of every draw cycle
                      // including sort changes) - "activate for ascending
                      // sort" needs to flip to "activate for descending
                      // sort" the moment a column becomes the active sort,
                      // matching GC DS's own table pattern (see admin.css
                      // comment above the CSS rules this feeds). Ported
                      // rather than shared with EvalDashboardPage.js's
                      // identical version - same reasoning as
                      // collapseColumn above, each page's DataTables
                      // options object is otherwise page-specific.
                      api.columns().header().each((header) => {
                        if (!header.classList.contains('dt-orderable-asc') && !header.classList.contains('dt-orderable-desc')) return;
                        const orderSpan = header.querySelector('.dt-column-order');
                        if (!orderSpan) return;
                        const title = (header.textContent || '').trim();
                        const currentSort = header.getAttribute('aria-sort');
                        // 3-state cycle, not 2 - see the matching comment
                        // in EvalDashboardPage.js's identical version for
                        // why (DataTables' own default asSorting is
                        // ['asc', 'desc', ''], a third click removes
                        // sorting entirely).
                        const nextKey = currentSort === 'ascending'
                          ? 'admin.common.sortActivateDescending'
                          : currentSort === 'descending'
                            ? 'admin.common.sortRemove'
                            : 'admin.common.sortActivateAscending';
                        header.setAttribute('data-tooltip', t(nextKey).replace('{column}', () => title));
                      });
                    } catch (e) { /* ignore drawCallback errors */ }
                  },
                  initComplete: function () {
                    try {
                      const api = this.api();
                      tableApiRef.current = api;

                      // DataTables doesn't add scope="col" to the header
                      // cells it generates from `columns` on its own (this is
                      // a real WCAG 1.3.1 gap in the library, not something a
                      // config option turns on) - set it once here rather
                      // than per-column above. Headers are only built once on
                      // init (serverSide mode only redraws the body per
                      // page), and this instance is recreated from scratch on
                      // every tableKey remount, so it can't drift out of sync.
                      api.columns().header().each((header) => {
                        header.setAttribute('scope', 'col');
                      });

                      // Active search term shown as a dismissible pill right
                      // beside the search box, same .filter-pill styling
                      // FilterPanel already uses for its own active-filter
                      // pills, so the current term is visible and clearable
                      // without needing to select/delete the input text.
                      const searchContainer = api.table().container().querySelector('.dt-search');
                      if (searchContainer) {
                        // Whole pill is the close target, not just the small
                        // × - a real <button> (not a span wrapping one), same
                        // reasoning and CSS as FilterPanel.js's own pills
                        // (see admin.css's .filter-pill--closable comment).
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
                      }
                    } catch (e) { /* ignore initComplete errors */ }
                  },
                  ajax: async (dtParams, callback) => {
                    try {
                      setLoading(true);
                      setError(null);
                      // Derived from `columns` (in scope above) rather than hand-listed, so
                      // inserting/removing a column can't silently desync this mapping from
                      // the actual column positions (same fix already applied in
                      // EvalDashboardPage.js).
                      const orderByMap = columns.map((c) => c.data);
                      const dtOrder = Array.isArray(dtParams.order) && dtParams.order.length > 0 ? dtParams.order[0] : null;
                      const orderBy = dtOrder ? (orderByMap[dtOrder.column] || 'createdAt') : 'createdAt';
                      const orderDir = dtOrder ? (dtOrder.dir || 'desc') : 'desc';
                      const searchValue = (dtParams.search && dtParams.search.value) || '';
                      setSearchTerm(searchValue);
                      const currentFilters = filtersRef.current || {};

                      const normalizedFilters = { ...currentFilters };
                      const normalizedStart = formatDateForApi(currentFilters.startDate);
                      const normalizedEnd = formatDateForApi(currentFilters.endDate);
                      if (normalizedStart) normalizedFilters.startDate = normalizedStart;
                      if (normalizedEnd) normalizedFilters.endDate = normalizedEnd;
                      const tzOffset = getTimezoneOffsetMinutes(currentFilters.startDate || currentFilters.endDate);
                      if (tzOffset !== undefined) normalizedFilters.timezoneOffsetMinutes = tzOffset;

                      const query = {
                        ...normalizedFilters,
                        start: dtParams.start || 0,
                        length: dtParams.length || 10,
                        orderBy,
                        orderDir,
                        draw: dtParams.draw || 0
                      };
                      if (searchValue) {
                        query.search = searchValue;
                      }
                      const result = await DashboardService.getChatDashboard(query);
                      const total = result?.recordsTotal || 0;
                      setRecordsTotal(total);

                      // Only re-announce on an actual new search term, not on
                      // every draw (paging/sorting a still-active search
                      // shouldn't repeat "N results" on every page turn).
                      if (searchValue !== previousSearchTermRef.current) {
                        previousSearchTermRef.current = searchValue;
                        if (searchValue && total > 0) {
                          setSearchAnnouncement(
                            t('admin.chatDashboard.searchResultsAnnouncement').replace('{count}', () => formatNumber(total, lang))
                          );
                          setSearchAnnounceNonce((n) => n + 1);
                        }
                      }
                      // zeroResultNonce - see its own comment above - bumped
                      // on every completion that lands on zero, not gated to
                      // "new search term" like searchAnnounceNonce: a
                      // 0-result page can't be paged further, so there's no
                      // "just re-drawing the same query" case to filter out
                      // here the way there is for the non-zero count above.
                      if (total === 0) {
                        setZeroResultNonce((n) => n + 1);
                      }

                      callback({
                        draw: dtParams.draw || 0,
                        recordsTotal: result?.recordsTotal || 0,
                        recordsFiltered: result?.recordsFiltered || 0,
                        data: Array.isArray(result?.data) ? result.data : []
                      });
                    } catch (err) {
                      console.error('Failed to load chat dashboard data', err);
                      setError(err.message || String(err));
                      callback({ draw: dtParams.draw || 0, recordsTotal: 0, recordsFiltered: 0, data: [] });
                    } finally {
                      setLoading(false);
                    }
                  }
                }}
              >
                <caption className="sr-only">{t('admin.chatDashboard.title')}</caption>
              </DataTable>
            </div>
          )}
        </div>
      )}
    </GcdsContainer>
  );
};

export default ChatDashboardPage;
