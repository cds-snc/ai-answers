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
import { escapeHtmlAttribute, buildChatReviewLinkHtml, chatLangFromPageLanguage } from '../utils/reviewLink.js';
import { detectUrlLanguage } from '../utils/dashboard/urlLanguage.js';
import { normalizeAnswerText } from '../utils/answerText.js';
import { formatNumber } from '../utils/numberFormat.js';
import { wireTableAccessibility } from '../utils/admin/dataTableAccessibility.js';
import { useSearchAnnouncement } from '../hooks/admin/useSearchAnnouncement.js';
import { resolveDisplayContent } from '../utils/answerLanguage.js';

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
  // sr-only search-narrowing announcement + visible zero-result message
  // (SC 4.1.3) - shared with MetricsDashboard.js.
  const { searchAnnouncement, searchAnnounceNonce, zeroResultNonce, noteSearchResult, announce, reset: resetSearchAnnouncement } =
    useSearchAnnouncement({ t, fmtN: (n) => formatNumber(n, lang) });

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

  // Same EN/FR-official-languages display rule (shown as-is; non-EN/FR
  // collapses to English) as ExpertFeedbackPanel.js (resolveDisplayContent) -
  // questionLanguage drives
  // both the Question and Answer columns, since the AI answers in whatever
  // language was detected for the question (agenticBase.js), not a
  // separately-tracked language per column. DataTables `render` returns a
  // raw HTML string here, not JSX, so this can't reuse OriginalLanguagePill
  // (React) directly.
  //
  // Wrapping div is position:relative + reserved bottom padding, icon is
  // position:absolute within it, anchored to the wrapper's own bottom edge
  // - a static position regardless of how many lines the text above it
  // wraps to, instead of flowing inline right after text of varying length
  // (which put it in a different spot every row, and inline-after-text
  // also pushed translated rows' text down a line vs. untranslated rows'
  // single-line cells, breaking the table's row-height rhythm).
  //
  // Icon font-size is on the <i> itself, not on the .eval-tooltip wrapper -
  // .eval-tooltip::after (admin.css) has no font-size reset of its own, so
  // it inherits whatever font-size sits on the element carrying the
  // eval-tooltip class. Sizing the <i> instead of that wrapper keeps the
  // tooltip text at its normal size and only enlarges the glyph. 1.3em -
  // a modest bump over EvalDashboardPage.js's own 1.2em/1.4em icons: the
  // icon + visible "AI text" label together carry this pill's meaning
  // at a glance; the fuller "AI Answers' working text" explanation lives in
  // the tooltip/accessible name below, not visibly on the pill itself -
  // short label for scanning, full explanation on demand.
  //
  // .eval-tooltip/data-tooltip, not the native title attribute - same
  // reasoning as EvalDashboardPage.js's own icon cells: title's hover
  // delay is fixed by the browser and can't be shortened, this CSS
  // mechanism controls it. Accessible name for the icon+"AI text" pair
  // comes from the sibling .wb-inv span carrying the fuller explanation,
  // not aria-label, matching that same established pattern - the icon and
  // the visible "AI text" label both stay aria-hidden so a screen
  // reader gets the one, fuller phrase instead of "AI text" followed
  // redundantly by "AI Answers' working text".
  const renderLanguageAwareText = useCallback((original, english, questionLanguage) => {
    const resolved = resolveDisplayContent({ language: questionLanguage, original, english });
    if (!resolved.text) return '';
    const langAttr = resolved.lang ? ` lang="${escapeHtmlAttribute(resolved.lang)}"` : '';
    const text = escapeHtmlAttribute(normalizeAnswerText(resolved.text));
    if (!resolved.isSource) {
      return `<span${langAttr}>${text}</span>`;
    }
    const shortLabel = escapeHtmlAttribute(t('admin.common.sourceText'));
    // "AI Answers' working text" - not "Originally asked in: {language}"
    // (that's the question's language; this pill is about what the cell
    // itself is showing - the English text AI Answers worked from/with,
    // same framing as SourceViewComponent.js's own title).
    const fullLabel = escapeHtmlAttribute(t('admin.common.workingTextTooltip'));
    // The pill is a direct sibling here, not nested inside the text div -
    // its position:absolute needs to resolve against the <td> itself
    // (position:relative via this column's createdCell, so its box always
    // matches the row's actual height), not this div, so Question's and
    // Answer's pills land at the exact same Y position even when one
    // column's text runs longer than the other's in the same row.
    return `<div style="padding-bottom: 2.2em;">` +
      `<span${langAttr}>${text}</span>` +
      `</div>` +
      `<span class="filter-pill eval-tooltip" data-tooltip="${fullLabel}" style="position: absolute; bottom: 0.5em; left: 0;">` +
      `<i class="fa-solid fa-language" style="font-size: 1.3em;" aria-hidden="true"></i>` +
      `<span aria-hidden="true">${shortLabel}</span>` +
      `<span class="wb-inv">${fullLabel}</span>` +
      `</span>`;
  }, [t]);

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
    announce(t('admin.common.filtersClearedAnnouncement'));
    resetSearchAnnouncement();
    setError(null);
    setLoading(false);
  }, [LOCAL_TABLE_STORAGE_KEY, t, announce, resetSearchAnnouncement]);

  const columns = useMemo(() => ([
    {
      title: t('admin.common.columns.chatId'),
      data: 'chatId',
      searchable: false,
      orderable: false,
      render: (value, type, row) => {
        if (!value) return '';
        // Route to the chat's OWN pageLanguage, not the admin's current UI
        // language - the reviewed transcript (answer bubbles, citation
        // heading) must show what the end user actually saw
        // (docs/coding-agent-docs/official-languages.md Rule 2), so the
        // route itself has to land on that language. The admin's own
        // language is carried separately as the `adminLang` query param
        // (4th arg) for the review page's own chrome (ExpertFeedbackPanel,
        // "How was this answer?", Chat ID/Date/Referring URL labels) to use
        // instead - see reviewLink.js and HomePage.js's `adminLang`.
        const chatLang = chatLangFromPageLanguage(row.pageLanguage);
        return buildChatReviewLinkHtml(value, chatLang, row.interactionId, lang);
      }
    },
    {
      title: t('admin.common.columns.department'),
      data: 'department',
      searchable: false,
      orderable: true,
      render: (value) => escapeHtmlAttribute(value || '')
    },
    {
      title: t('admin.common.columns.program'),
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
      render: (value, type, row) => renderLanguageAwareText(value, row && row.englishQuestion, row && row.questionLanguage),
      // position:relative belongs on the <td> itself, not a wrapper div
      // inside it - the <td>'s own box stretches to match the row's
      // tallest cell (normal table behaviour), a div inside it doesn't.
      // The "Translated" pill's position:absolute needs to resolve
      // against that actual row-height box to stay anchored to the row's
      // real bottom edge, not just this cell's own shorter content height.
      createdCell: (td) => { td.style.position = 'relative'; }
    },
    {
      title: t('admin.chatDashboard.columns.answer', 'Answer'),
      data: 'answerContent',
      searchable: false,
      orderable: false,
      render: (value, type, row) => renderLanguageAwareText(value, row && row.englishAnswer, row && row.questionLanguage),
      createdCell: (td) => { td.style.position = 'relative'; }
    },
    {
      title: t('admin.chatDashboard.columns.citationUrl', 'Citation link'),
      data: 'citationUrl',
      // Capped so Question/Answer (no fixed width - they auto-fill
      // remaining space) don't get squeezed by this column growing to fit
      // a long citation URL - the visible text is already shortened via
      // truncateUrl() below, this just stops the column itself from
      // stretching past what that short text actually needs.
      width: '160px',
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
        //
        // gcds-link's own `lang` attribute does two unrelated jobs at once:
        // native HTML lang inheritance (how a screen reader pronounces the
        // slotted text) AND a plain JS property read (gcds-link.js's
        // assignLanguage/i18n[lang]) that picks which language string labels
        // its own icon - here, the "(Opens destination in a new tab.)"
        // accessible text. Those need different values: the outer element
        // keeps the admin's own `lang` so that hint announces in the
        // admin's language, and an inner span carries the citation URL's own
        // language (detectUrlLanguage) so the truncated citation text itself
        // is still pronounced correctly (WCAG 3.1.2) - same reasoning as
        // CountTable.js's citation links, applied here to the raw HTML form.
        const safeHref = escapeHtmlAttribute(value);
        const safeDisplay = escapeHtmlAttribute(truncateUrl(value));
        const citationLang = escapeHtmlAttribute(detectUrlLanguage(value, lang));
        return `<gcds-link href="${safeHref}" target="_blank" lang="${lang}"><span lang="${citationLang}">${safeDisplay}</span></gcds-link>`;
      }
    }
    // The "Page" language column (row.pageLanguage) used to live here as
    // the admin's only advance warning of which language route the Chat ID
    // link would drop them on - the review page used to switch its whole
    // chrome to that language. Now that review mode is its own page
    // (ChatReviewPage.js), the admin's own review chrome stays in their own
    // language regardless of the reviewed chat's pageLanguage, so that
    // warning no longer applies - removed rather than left as a now-
    // pointless column. row.pageLanguage itself is still used internally by
    // the Chat ID column's render() above (chatLangFromPageLanguage) to
    // route the transcript correctly; only the visible column is gone.
  ]), [renderLanguageAwareText, truncateUrl, t, lang]);

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

      {/* Visually hidden: FilterPanel's own <summary> isn't heading-navigable
          (it's a disclosure toggle, not a heading), so this gives
          screen-reader users a heading/landmark entry point into the filter
          section. Distinct text from FilterPanel's "Filters" summary label
          so the two don't read as an identical back-to-back announcement. */}
      <h2 className="sr-only">{t('admin.filters.sectionHeading')}</h2>
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

      <StatusMessage variant={error ? 'error' : undefined}>
        {error && <>{t('admin.chatDashboard.error')} <code lang="en">{String(error)}</code></>}
      </StatusMessage>

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
              {/* Sibling of the Filters h2 above, not nested under it - matches
                  EvalDashboardPage.js's resultsHeading. Previously nothing
                  filled this role, so the table had no heading-navigation stop
                  of its own at all. */}
              <h2 className="sr-only">{t('admin.common.resultsHeading')}</h2>
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
                    const api = this.api();
                    tableApiRef.current = api;
                    wireTableAccessibility(api, { t });
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

                      noteSearchResult(searchValue, total);

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
