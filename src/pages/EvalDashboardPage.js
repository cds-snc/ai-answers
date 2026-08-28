import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { GcdsContainer, GcdsText, GcdsLink } from '@gcds-core/components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import { dataTableLanguage } from '../utils/dataTableLanguage.js';
import FilterPanel from '../components/admin/FilterPanel.js';
import EvaluationService from '../services/EvaluationService.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import LoadingOverlay from '../components/admin/LoadingOverlay.js';
import FeedbackInlineError from '../components/chat/FeedbackInlineError.js';
import { useInlineFormError } from '../hooks/useInlineFormError.js';
import { useFocusOnChange } from '../hooks/useFocusOnChange.js';
import { escapeHtmlAttribute, buildChatReviewLinkHtml, chatLangFromPageLanguage } from '../utils/reviewLink.js';
import { formatNumber } from '../utils/numberFormat.js';
import { wireTableAccessibility } from '../utils/admin/dataTableAccessibility.js';
import { buildChatGroupCallbacks, createChatGroupState } from '../utils/admin/chatGroupedTable.js';
import { buildEvalPillsHtml } from '../utils/admin/evalPills.js';
import { renderDateTimeCell } from '../utils/admin/dateTimeCell.js';
import { useSearchAnnouncement } from '../hooks/admin/useSearchAnnouncement.js';

DataTable.use(DT);

const TABLE_STORAGE_KEY = `evalDashboard_tableState_v3_`;

const truncateEmail = (email) => {
  if (!email) return '';
  return email.split('@')[0];
};

const truncateUrl = (url) => {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(part => part !== '');
    if (pathParts.length <= 1) {
      const domain = urlObj.hostname.replace(/^www\./, '');
      return pathParts.length === 1 ? `${domain}/${pathParts[0]}` : domain;
    }
    const truncatedParts = pathParts.slice(-3);
    return '/' + truncatedParts.join('/');
  } catch {
    return url;
  }
};

const getDefaultEvalFilters = () => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 7);
  return {
    startDate: start.toISOString(),
    endDate: now.toISOString()
  };
};
const EvalDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tableKey, setTableKey] = useState(0);
  const [dataTableReady, setDataTableReady] = useState(false);
  const [pageResultCount, setPageResultCount] = useState(0);
  // sr-only search-narrowing announcement + visible zero-result message
  // (SC 4.1.3) - shared with ChatDashboardPage.js/MetricsDashboard.js.
  // syntheticCount (see the ajax callback below) is a pagination trick, not
  // a real count, so search completions pass count: null here and get the
  // count-less "results updated" message instead of "N results found".
  const { zeroResultNonce, noteSearchResult, noteLoadResult, announce, reset: resetSearchAnnouncement } =
    useSearchAnnouncement({ t, fmtN: (n) => formatNumber(n, lang) });
  // Tracked so a zero-result global search doesn't feed FilterPanel's own
  // "reopen on zero results" effect - see the filterResultCount prop below
  // (same guard as ChatDashboardPage.js's).
  const [searchTerm, setSearchTerm] = useState('');
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);
  // The standalone "Search by Chat or Interaction ID" box shown before the
  // full table/Filters are ever applied (see the render below) - kept
  // separate from `searchTerm` (which tracks the *real* DataTables search
  // box, once the table exists) so this one can be read at render time to
  // seed the table's initial search when it first mounts.
  const [pendingSearch, setPendingSearch] = useState('');
  // Set when the chat ID search's own pre-check (see handleSearchChatIdSubmit)
  // finds nothing - distinct from pageResultCount === 0, which only ever
  // applies once the real table exists.
  const [searchChatIdNotFound, setSearchChatIdNotFound] = useState(false);
  // Field-tied validation ("enter a chat ID"), not a page-level outcome -
  // FeedbackInlineError + aria-describedby, matching SimilarChatsDashboard.js's
  // and VectorPage.js's identical chat-ID-lookup pattern (see AGENTS.md's
  // "StatusMessage vs. form-field errors"). useInlineFormError (not plain
  // useState) so errorCount increments on every triggerError(), forcing
  // FeedbackInlineError's key={errorCount} to mount a fresh node and
  // re-announce even a repeat identical failure.
  const {
    hasError: hasSearchChatIdError,
    errorCount: searchChatIdErrorCount,
    errorRef: searchChatIdErrorRef,
    triggerError: triggerSearchChatIdError,
    clearError: clearSearchChatIdError,
  } = useInlineFormError();

  // A11y: on a successful chat ID search, handleApplyFilters unmounts the
  // whole chat ID search box - including the Search button the user just
  // activated - in the same render that mounts the results table. With no
  // focus handling, the browser's default on a focused element leaving the
  // DOM is to drop focus to <body>, right when the user most needs to land
  // on the results (SC 2.4.3). useFocusOnChange (same hook
  // searchChatIdErrorRef above already uses for the inline error) moves
  // focus to the results heading below instead - a counter, not a
  // boolean, so a second search that also succeeds still re-fires the
  // effect. Only bumped on the chat ID search path specifically: a normal
  // FilterPanel Apply keeps focus on its own Apply button already, so it
  // doesn't need this.
  const [searchChatIdFoundNonce, setSearchChatIdFoundNonce] = useState(0);
  const resultsHeadingRef = useFocusOnChange(searchChatIdFoundNonce);

  const tableApiRef = useRef(null);
  const filtersRef = useRef(getDefaultEvalFilters());
  // Tracks chat-group striping state across a single draw's rows (reset in
  // preDrawCallback, mutated in createdRow as each row is built in order) -
  // same grouping approach as ChatDashboardPage.js, ported here so a
  // multi-turn chat's evaluated interactions read as one group instead of
  // unrelated rows.
  const chatGroupStateRef = useRef(createChatGroupState());
  // Bumped by Clear all and by each ajax call, so a response that lands
  // after the table was cleared (or superseded) can't set error/count/loading
  // state on a table that's gone.
  const ajaxSeqRef = useRef(0);

  const LOCAL_TABLE_STORAGE_KEY = `${TABLE_STORAGE_KEY}${lang}`;

  useEffect(() => {
    // allow table render
    setTimeout(() => setDataTableReady(true), 0);
  }, []);

  // mergeDefaults=false is for the chat ID search's own "found" branch below:
  // it needs the table to open with the exact all-time (unscoped) filters
  // the pre-check itself searched with, not the default last-7-days range
  // merged on top - merging would silently re-scope the very match that was
  // just confirmed to exist, showing an empty table right after finding it.
  const handleApplyFilters = useCallback((filters, { mergeDefaults = true } = {}) => {
    const normalized = mergeDefaults
      ? { ...getDefaultEvalFilters(), ...(filters || {}) }
      : { ...(filters || {}) };
    filtersRef.current = normalized;
    setHasAppliedFilters(true);
    setLoading(true);
    try {
      if (tableApiRef.current) tableApiRef.current.ajax.reload(null, true);
      else setTableKey((prev) => prev + 1);
    } catch (e) { void e; }
  }, []);

  // The standalone pre-table search box's own submit. Runs a lightweight
  // pre-check (length: 1 - just need to know whether anything matches, not
  // a full page) before mounting the real table: surfacing the whole table
  // shell for a chat/interaction ID that doesn't exist would show an empty
  // table with no explanation, which reads as broken, not "not found". If
  // something matches, proceed exactly like a normal Apply - the table
  // mounts and `pendingSearch` (still in scope) seeds its initial search
  // value, so the very first real fetch already reflects it. If nothing
  // matches, say so and leave the chat ID search box up to try again.
  //
  // Deliberately UNSCOPED - filterType/presetValue: 'all' makes the backend
  // skip its own date $match entirely (see getDateRange in
  // api/eval/eval-dashboard.js), rather than the default filters (last 7
  // days). "Find by Chat ID" means find that ID if it exists, period - not
  // "if it exists within whatever range happens to be the default". Passing
  // no date params at all would actually be MORE restrictive, not less:
  // getDateRange's own fallback (no startDate/endDate, no preset) is a bare
  // 24-hour window.
  const handleSearchChatIdSubmit = useCallback(async (e) => {
    e.preventDefault();
    const term = pendingSearch.trim();
    if (!term) {
      triggerSearchChatIdError();
      return;
    }
    clearSearchChatIdError();
    setSearchChatIdNotFound(false);
    setLoading(true);
    setError(null);
    const unscopedFilters = { filterType: 'preset', presetValue: 'all' };
    try {
      const result = await EvaluationService.getEvalDashboard({
        ...unscopedFilters,
        search: term,
        start: 0,
        length: 1
      });
      const found = Array.isArray(result?.data) && result.data.length > 0;
      if (found) {
        // mergeDefaults: false - the table must open with this exact
        // all-time scope, not the default last-7-days range merged back on
        // top of it (which would silently re-scope the match just found).
        // Loading is NOT cleared here (see below) - handleApplyFilters
        // already set it true for the table it's about to mount, and that
        // table's own ajax callback is what should clear it once its real
        // fetch actually lands. Clearing it here instead raced ahead of
        // that: hasAppliedFilters/loading/pageResultCount briefly lined up
        // as "applied, not loading, zero results", which is exactly the
        // no-data StatusMessage's condition - flashing "No data" for a
        // search that had, in fact, just found something.
        handleApplyFilters(unscopedFilters, { mergeDefaults: false });
        // See searchChatIdFoundNonce's own comment above - moves focus to
        // the results heading instead of it falling to <body> once this
        // submit button unmounts.
        setSearchChatIdFoundNonce((n) => n + 1);
      } else {
        setSearchChatIdNotFound(true);
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to look up chat/interaction ID', err);
      setError(err.message || String(err));
      setLoading(false);
    }
  }, [pendingSearch, handleApplyFilters, triggerSearchChatIdError, clearSearchChatIdError]);

  // Clear all is a restart, not a re-apply: same reasoning as
  // ChatDashboardPage.js's handleClearFilters - resets hasAppliedFilters to
  // false (the same gate that hides the whole results block, including the
  // real table's search box, before the first-ever Apply) instead of
  // silently auto-fetching the reset defaults, so nothing renders again
  // until an explicit Apply or a submitted chat ID search.
  const handleClearFilters = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        try { window.localStorage.removeItem(LOCAL_TABLE_STORAGE_KEY); } catch (e) { void e; }
      }
    } catch (e) { void e; }
    filtersRef.current = getDefaultEvalFilters();
    // Stale otherwise: the DataTable unmounts (hasAppliedFilters below gates
    // it), but nothing else clears this ref, and a truthy leftover would
    // fool the next handleApplyFilters' `if (tableApiRef.current)` check
    // into calling .ajax.reload() on an already-destroyed table instead of
    // mounting a fresh one.
    tableApiRef.current = null;
    ajaxSeqRef.current += 1;
    setHasAppliedFilters(false);
    setPageResultCount(0);
    setSearchTerm('');
    setPendingSearch('');
    setSearchChatIdNotFound(false);
    setError(null);
    setLoading(false);
    announce(t('admin.common.filtersClearedAnnouncement'));
    resetSearchAnnouncement();
  }, [LOCAL_TABLE_STORAGE_KEY, t, announce, resetSearchAnnouncement]);

  const columns = useMemo(() => ([
    {
      title: t('admin.common.columns.chatId'),
      data: 'chatId',
      render: (value, type, row) => {
        if (!value) return '';
        // Route to the reviewed chat's own pageLanguage, not the admin's
        // current UI language - see the same note in ChatDashboardPage.js.
        const chatLang = chatLangFromPageLanguage(row.pageLanguage);
        return buildChatReviewLinkHtml(value, chatLang, row.interactionId || row._id, lang);
      },
      searchable: false,
      orderable: false
    },
    {
      // Visible header is just "#" - within a row already labelled by its
      // Chat ID, "the number in this row" reads fine to a sighted user
      // without spelling it out. A screen-reader user hitting the header
      // in isolation (table nav, or before reaching Chat ID) doesn't get
      // that context from a bare "#" though, so the full "Question number"
      // is set as this header's aria-label in initComplete below instead
      // of being spelled out in the visible title.
      title: t('admin.evalDashboard.columns.questionNumber'),
      // DataTables builds the sort button's aria-label from ariaTitle at
      // init - the th aria-label set later in initComplete doesn't reach it.
      ariaTitle: t('admin.evalDashboard.columns.questionNumberAriaLabel'),
      data: 'questionNumber',
      render: (value) => value != null ? String(value) : '',
      width: '40px',
      searchable: false,
      orderable: false
    },
    {
      // admin.evalDashboard.columns.partnerEval/aiEval, not the shared
      // admin.chatDashboard.columns.* keys AutoEvalDashboardPage.js still
      // uses below - Eval Dashboard wants the shorter "Partner"/"AI"
      // headers without renaming AutoEval's "Partner eval"/"AI eval".
      // No fixed width (unlike most other columns here) - the pill count
      // varies a lot row to row now that citation/content issue can stack
      // (one, two, or three pills), so a fixed px either wastes space on a
      // single-pill row or cramps/wraps a stacked one. The table already
      // runs table-layout: auto (see admin.css) with autoWidth: false, so
      // leaving width unset lets the browser size the column to whichever
      // row's pills are actually widest on the current page, same as any
      // plain HTML table column would.
      title: t('admin.evalDashboard.columns.partnerEval'), data: 'partnerEval', render: (v, type, row) => buildEvalPillsHtml(t, v, [
        { active: row && row.partnerHasCitationError, className: 'hasCitationError', labelKey: 'admin.chatDashboard.labels.evaluation.hasCitationError' },
        { active: row && row.partnerHasContentIssue, className: 'hasContentIssue', labelKey: 'admin.chatDashboard.labels.contentIssue' }
      ]), searchable: false, orderable: false
    },
    {
      title: t('admin.evalDashboard.columns.aiEval'), data: 'aiEval', render: (v, type, row) => buildEvalPillsHtml(t, v, [
        { active: row && row.aiHasCitationError, className: 'hasCitationError', labelKey: 'admin.chatDashboard.labels.evaluation.hasCitationError' }
      ]), searchable: false, orderable: false
    },
    {
      title: t('admin.evalDashboard.columns.feedback'), data: 'feedback', width: '60px', render: v => {
        // Icon + hidden text, same tight pattern as the Download column
        // below (FA icon since GC DS has no thumbs glyph, aria-hidden, real
        // meaning carried in wb-inv text) instead of a spelled-out pill -
        // keeps this column narrow. Coloured with --gcds-border-default -
        // the same grey the row/cell dividers use (see .group-cell's
        // border-right and the other border rules above) - rather than
        // positive/negative green/red or text-status--neutral (blue,
        // despite the name): whether an answer was helpful is subjective,
        // not a pass/fail outcome like Download's states.
        //
        // data-tooltip (+ .eval-tooltip's CSS, see admin.css) gives sighted
        // mouse users a hover tooltip with the same text the wb-inv span
        // already gives screen-reader users - a custom CSS tooltip rather
        // than the native title attribute so the appear delay is ours to
        // set (0.5s - native title's delay is fixed by the browser, not
        // controllable). Safe to add now specifically because the icon
        // stays aria-hidden: an arbitrary data-* attribute on an
        // aria-hidden element isn't exposed to the accessibility tree
        // either, so it can't compete with/double up on the wb-inv
        // announcement. Two channels, one source of truth each.
        if (v === 'yes') return `<i class="fa-solid fa-thumbs-up eval-tooltip" style="font-size: 1.2em; color: var(--gcds-border-default);" aria-hidden="true" data-tooltip="${escapeHtmlAttribute(t('reviewPanels.helpfulYes'))}"></i><span class="wb-inv">${escapeHtmlAttribute(t('reviewPanels.helpfulYes'))}</span>`;
        if (v === 'no') return `<i class="fa-solid fa-thumbs-down eval-tooltip" style="font-size: 1.2em; color: var(--gcds-border-default);" aria-hidden="true" data-tooltip="${escapeHtmlAttribute(t('reviewPanels.helpfulNo'))}"></i><span class="wb-inv">${escapeHtmlAttribute(t('reviewPanels.helpfulNo'))}</span>`;
        return '';
      }, searchable: false, orderable: true
    },
    {
      title: t('admin.evalDashboard.columns.download'),
      data: 'hasDownload',
      // hasDownload: 'success' | 'partial' | 'failed' | '' (see api/eval/eval-dashboard.js)
      // TODO: near-duplicate icon+hidden-text markup per branch - a small
      // helper would collapse this (see matching TODO in eval-dashboard.js
      // about the 3x-duplicated status classification). Deliberately
      // deferred alongside that TODO - see its comment for why.
      render: v => {
        // No GC DS check/half-circle icon, so FA + hidden text alternative.
        // data-tooltip (custom CSS tooltip, see the matching comment on the
        // Feedback column above for why not the native title attribute)
        // gives sighted mouse users a hover tooltip with the same text the
        // wb-inv span gives screen-reader users.
        if (v === 'success') {
          return `<span class="text-status--positive"><i class="fa-solid fa-check eval-tooltip" style="font-size: 1.4em;" aria-hidden="true" data-tooltip="${escapeHtmlAttribute(t('reviewPanels.downloadSuccess'))}"></i><span class="wb-inv">${escapeHtmlAttribute(t('reviewPanels.downloadSuccess'))}</span></span>`;
        }
        if (v === 'partial') {
          // Smaller than the other two icons - a filled circle shape reads
          // visually larger than the check/x glyphs at the same font-size.
          return `<span class="text-status--warning"><i class="fa-solid fa-circle-half-stroke eval-tooltip" style="font-size: 1.2em;" aria-hidden="true" data-tooltip="${escapeHtmlAttribute(t('reviewPanels.downloadPartial'))}"></i><span class="wb-inv">${escapeHtmlAttribute(t('reviewPanels.downloadPartial'))}</span></span>`;
        }
        if (v === 'failed') {
          return `<span class="text-status--negative"><i class="fa-solid fa-xmark eval-tooltip" style="font-size: 1.4em;" aria-hidden="true" data-tooltip="${escapeHtmlAttribute(t('reviewPanels.fail'))}"></i><span class="wb-inv">${escapeHtmlAttribute(t('reviewPanels.fail'))}</span></span>`;
        }
        return '';
      },
      width: '50px', searchable: false, orderable: true
    },
    { title: t('admin.common.columns.department'), data: 'department', width: '110px', searchable: false, orderable: true },
    { title: t('admin.common.columns.program'), data: 'program', width: '160px', render: (v, type, row) => { const d = (lang === 'fr' && row && row.programFr) ? row.programFr : v; return d ? escapeHtmlAttribute(d) : ''; }, searchable: false, orderable: true },
    { title: t('admin.evalDashboard.columns.action'), data: 'action', width: '90px', render: (v, type, row) => { const d = (lang === 'fr' && row && row.actionFr) ? row.actionFr : v; return d ? escapeHtmlAttribute(d) : ''; }, searchable: false, orderable: true },
    { title: t('admin.chatDashboard.columns.referringUrl'), data: 'referringUrl', render: v => v ? escapeHtmlAttribute(truncateUrl(v)) : `<span style="color: #666;">${escapeHtmlAttribute(t('reviewPanels.none'))}</span>`, searchable: false, orderable: true },
    { title: t('admin.common.columns.pageLanguage'), ariaTitle: t('admin.common.columns.pageLanguageAriaLabel'), data: 'pageLanguage', width: '50px', render: v => v ? escapeHtmlAttribute(v.toUpperCase()) : '', searchable: false, orderable: true },
    { title: t('admin.evalDashboard.columns.creatorEmail'), data: 'creatorEmail', render: v => escapeHtmlAttribute(truncateEmail(v || '')), searchable: false, orderable: true },
    { title: t('admin.evalDashboard.columns.expertEmail'), data: 'expertEmail', render: v => escapeHtmlAttribute(truncateEmail(v || '')), searchable: false, orderable: true },
    {
      // Not shown as a column: the date range is already a filter choice
      // (see the filter panel), so a per-row Date value is redundant on
      // screen. Kept in the columns array (visible: false) rather than
      // deleted outright, since the default order below and the
      // dtOrder -> backend-field mapping further down both key off this
      // column's index/data - hiding it keeps that wiring intact while
      // dropping it from the header/rows.
      title: t('admin.evalDashboard.columns.date'), data: 'date', render: (v) => renderDateTimeCell(v, lang), searchable: false, orderable: true, visible: false
    }
  ]), [t, lang]);

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">{t('admin.evalDashboard.title', 'Evaluation dashboard')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      {/* Visually hidden - same as ChatDashboardPage.js's matching heading:
          FilterPanel's own <summary> isn't heading-navigable, so this gives
          screen-reader users a heading/landmark entry point into the filter
          section. Distinct text from FilterPanel's "Filters" summary label. */}
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
          // didn't match anything - not that the applied filters are wrong,
          // so don't feed it into FilterPanel's own "reopen on zero
          // results" logic (see the effect in FilterPanel.js keyed off
          // filterResultCount === 0). Passing null there is a no-op for
          // that effect, leaving the panel's open/closed state alone - same
          // guard as ChatDashboardPage.js's.
          filterResultCount={searchTerm ? null : pageResultCount}
          hasAppliedFilters={hasAppliedFilters}
        />
      </div>

      {loading && (
        <LoadingOverlay message={t('admin.evalDashboard.loading')} />
      )}

      <StatusMessage variant={error ? 'error' : undefined}>
        {error && <>{t('admin.evalDashboard.error')} <code lang="en">{String(error)}</code></>}
      </StatusMessage>

      {/* Distinct from the filters-driven empty state below - a zero-result
          global search means the search term didn't match anything, not
          that the applied filters themselves are wrong (same distinction as
          ChatDashboardPage.js's noSearchResults/noDataForFilters split). */}
      {hasAppliedFilters && !loading && !error && pageResultCount === 0 && searchTerm && (
        <StatusMessage variant="info" assertive message={t('admin.common.noSearchResults').replace('{term}', () => searchTerm)} nonce={zeroResultNonce} />
      )}

      {hasAppliedFilters && !loading && !error && pageResultCount === 0 && !searchTerm && (
        <StatusMessage variant="info" assertive message={t('common.noDataForFilters')} nonce={zeroResultNonce} />
      )}

      {/* A sub-component of the Filters box above, not a peer - same
          details/summary chrome, sits directly below it. Surfaces just the
          "Find by Chat ID" input before any Apply, not the whole table
          (columns, per-column filters, pagination) - showing the full table
          shell with nothing applied yet reads as confusing/broken (looks
          operable, isn't). Submitting applies the default filters and seeds
          the real table's search box with whatever was typed - see
          handleSearchChatIdSubmit and the `search:` option below. Hidden
          again once results exist, since the real DataTables search box
          (same label) takes over. */}
      {!hasAppliedFilters && (
        <details className="filter-panel eval-search-chat-id">
          <summary className="filter-panel-summary">
            <Search className="filter-panel-summary__icon" aria-hidden="true" />
            {t('admin.common.viewChatById')}
          </summary>
          <div className="filter-panel-content">
            {/* noValidate: required/aria-required below are for semantics and
                AT only - native browser validation would otherwise intercept
                an empty submit before handleSearchChatIdSubmit runs, bypassing
                the custom FeedbackInlineError/announcement flow (SC 3.3.2/
                4.1.3). Only one field in this form, so no ExpertFeedbackComponent.js-
                style risk of silently dropping an unrelated field's native check. */}
            <form onSubmit={handleSearchChatIdSubmit} noValidate>
              <label htmlFor="eval-search-chat-id-input" className="filter-label">
                {t('admin.evalDashboard.searchChatIdInputLabel')}
              </label>
              {hasSearchChatIdError && (
                <FeedbackInlineError
                  id="eval-search-chat-id-error"
                  message={t('admin.common.chatIdRequired')}
                  errorCount={searchChatIdErrorCount}
                  inputRef={searchChatIdErrorRef}
                />
              )}
              <div className="eval-search-chat-id__field">
                <input
                  id="eval-search-chat-id-input"
                  type="search"
                  className="filter-input"
                  value={pendingSearch}
                  onChange={(e) => {
                    setPendingSearch(e.target.value);
                    setSearchChatIdNotFound(false);
                    clearSearchChatIdError();
                  }}
                  placeholder={t('admin.common.chatIdSearchPlaceholder')}
                  required
                  aria-required="true"
                  aria-describedby={hasSearchChatIdError ? 'eval-search-chat-id-error' : undefined}
                />
              </div>
              <button type="submit" className="filter-button filter-button-primary mt-200">
                {t('admin.common.chatIdSearchButton')}
              </button>
            </form>
            {searchChatIdNotFound && (
              <StatusMessage variant="info" message={t('admin.common.chatNotFound')} />
            )}
          </div>
        </details>
      )}

      {hasAppliedFilters && dataTableReady && (
        <div className="dashboard-table-container dashboard-table-container--grouped">
            {/* tabIndex={-1}: not in the normal tab order (sr-only, nothing
                to tab TO here) - only a programmatic .focus() target, via
                resultsHeadingRef/useFocusOnChange above. */}
            <h2 ref={resultsHeadingRef} tabIndex={-1} className="sr-only">
              {t('admin.common.resultsHeading')}
            </h2>
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
                autoWidth: false,
                order: [[13, 'desc']],
                // Seeds the search box with whatever was typed into the
                // standalone pre-table chat ID search (see the render below) -
                // read once here, at this mount's render, since the table
                // only ever mounts via a genuine Apply (including the quick
                // search's own submit, which is just handleApplyFilters).
                search: { search: pendingSearch },
                stateSave: true,
                // Same zones as ChatDashboardPage.js: search alone on top
                // (topEnd left empty), "Page N" and entries-per-page both
                // bottom-left above pagination, paging alone bottom-right -
                // one shared layout instead of each page inventing its own
                // placement. infoCallback below (Eval-specific: no real
                // recordsTotal to show a "Showing X to Y of Z" count, since
                // counting is avoided for cost - see its own comment) still
                // controls the *text*; this only changes where it sits.
                layout: {
                  topStart: 'search',
                  topEnd: {},
                  bottomStart: { features: ['pageLength', 'info'] },
                  bottomEnd: { paging: { firstLast: false } }
                },
                infoCallback: function (_settings, start, end, _max, _total, _pre) {
                  const pageNumber = Math.floor(Math.max(Number(start) - 1, 0) / Math.max(end - start, 1)) + 1;
                  return `${t('common.page', 'Page')} ${pageNumber}`;
                },
                language: {
                  ...dataTableLanguage(lang),
                  search: t('admin.common.searchLabel'),
                  searchPlaceholder: t('admin.common.searchPlaceholder')
                },
                // Striping and keep-chat-together cells - see
                // utils/admin/chatGroupedTable.js.
                ...buildChatGroupCallbacks({
                  stateRef: chatGroupStateRef,
                  columns,
                  groupedColumns: [
                    { data: 'expertEmail' },
                    { data: 'creatorEmail' },
                    { data: 'pageLanguage' },
                    // Empty renders as "None" - merge those too.
                    { data: 'referringUrl', mergeEmpty: true },
                    { data: 'action' },
                    { data: 'program' },
                    { data: 'department' },
                    { data: 'chatId', boundByChatId: false, extraClass: 'chat-id-cell' },
                  ],
                }),
                // Add per-column header inputs
                initComplete: function () {
                  try {
                    const api = this.api();
                    tableApiRef.current = api;
                    wireTableAccessibility(api, { t });

                    // Q # header shows just "#" (see the column comment
                    // above) - aria-label carries the spelled-out meaning
                    // for screen-reader users instead.
                    const questionNumberHeader = api.column(columns.findIndex((c) => c.data === 'questionNumber')).header();
                    if (questionNumberHeader) {
                      questionNumberHeader.setAttribute('aria-label', t('admin.evalDashboard.columns.questionNumberAriaLabel'));
                    }
                    // Page language header shows just "Page" (kept short so
                    // the column stays narrow, same reasoning as Q # above)
                    // - aria-label carries the spelled-out meaning instead.
                    const pageLanguageHeader = api.column(columns.findIndex((c) => c.data === 'pageLanguage')).header();
                    if (pageLanguageHeader) {
                      pageLanguageHeader.setAttribute('aria-label', t('admin.common.columns.pageLanguageAriaLabel'));
                    }
                  } catch (e) { /* ignore initComplete errors */ }
                },
                // ajax collects per-column searches and sends them to backend
                ajax: async (dtParams, callback) => {
                  const seq = ++ajaxSeqRef.current;
                  try {
                    setLoading(true);
                    setError(null);
                    const dtOrder = Array.isArray(dtParams.order) && dtParams.order.length > 0 ? dtParams.order[0] : { column: columns.length - 1, dir: 'desc' };
                    // Derived from `columns` (in scope above) rather than hand-listed, so
                    // inserting/removing a column can't silently desync this mapping from
                    // the actual column positions. Only the last column's row-data key
                    // ('date') differs from the backend sort field name ('createdAt').
                    const orderByMap = columns.map((c) => (c.data === 'date' ? 'createdAt' : c.data));
                    const orderBy = orderByMap[dtOrder.column] || 'createdAt';
                    const orderDir = dtOrder.dir || 'desc';
                    const searchValue = (dtParams.search && dtParams.search.value) || '';
                    setSearchTerm(searchValue);
                    const columnSearches = {};
                    if (Array.isArray(dtParams.columns)) {
                      dtParams.columns.forEach((col) => {
                        const val = col && col.search && String(col.search.value || '').trim();
                        if (val) {
                          const colName = col.data || null;
                          if (colName) columnSearches[colName] = val;
                        }
                      });
                    }
                    const query = {
                      ...filtersRef.current,
                      start: dtParams.start || 0,
                      length: dtParams.length || 10,
                      orderBy,
                      orderDir,
                      draw: dtParams.draw || 0
                    };
                    if (searchValue) query.search = searchValue;
                    if (Object.keys(columnSearches).length) query.columnSearch = columnSearches;
                    const result = await EvaluationService.getEvalDashboard(query);
                    if (seq !== ajaxSeqRef.current) return;
                    const rows = Array.isArray(result?.data) ? result.data : [];
                    const start = Number.isFinite(Number(dtParams.start)) ? Number(dtParams.start) : 0;
                    const hasMore = result?.hasMore === true;
                    // dtParams.start/length are chat-index units ONLY for
                    // the default (createdAt) sort - see the matching
                    // useChatGroupedPagination branch in eval-dashboard.js.
                    // Any explicit column sort (Department/Program/Action/
                    // Feedback/Download) is scoped to individual
                    // interactions on purpose - sorting by Download=failed
                    // should show the failed downloads, not drag in every
                    // other question from the same chat - so the backend
                    // falls back to plain row-based pagination there, and
                    // this synthetic total has to advance in the same
                    // units it did, or it invents phantom pages (the same
                    // bug fixed for the chat-grouped case, mirrored here
                    // for the row-based one).
                    const syntheticUnitCount = orderBy === 'createdAt'
                      ? new Set(rows.map((r) => r.chatId)).size
                      : rows.length;
                    const syntheticCount = start + syntheticUnitCount + (hasMore ? 1 : 0);
                    setPageResultCount(syntheticCount);
                    // count: null - syntheticCount above is a pagination
                    // trick (avoids a real COUNT query), not a trustworthy
                    // result count, so the sr-only announcement uses the
                    // count-less "results updated" message instead of "N
                    // results found". TODO: pass the real count once a cheap
                    // one is available from the backend.
                    const loadCount = syntheticCount === 0 ? 0 : null;
                    if (!noteSearchResult(searchValue, loadCount)) noteLoadResult(loadCount);
                    callback({ draw: dtParams.draw || 0, recordsTotal: syntheticCount, recordsFiltered: syntheticCount, data: rows });
                  } catch (err) {
                    console.error('Failed to load eval dashboard data', err);
                    if (seq !== ajaxSeqRef.current) return;
                    setError(err.message || String(err));
                    setPageResultCount(0);
                    callback({ draw: dtParams.draw || 0, recordsTotal: 0, recordsFiltered: 0, data: [] });
                  } finally {
                    if (seq === ajaxSeqRef.current) setLoading(false);
                  }
                },
                stateSaveCallback: function (settings, data) {
                  try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(LOCAL_TABLE_STORAGE_KEY, JSON.stringify(data)); } catch (e) { void e; }
                },
                stateLoadCallback: function () {
                  try {
                    if (typeof window !== 'undefined' && window.localStorage) {
                      const stored = window.localStorage.getItem(LOCAL_TABLE_STORAGE_KEY);
                      const parsed = stored ? JSON.parse(stored) : null;
                      // stateSave persists the whole DataTables state - page
                      // length, sort, column order AND the search term -
                      // across reloads. The search term carrying over
                      // silently re-applies a stale search on a fresh page
                      // load/refresh, which reads as the search being
                      // "stuck" (same fix as ChatDashboardPage.js's
                      // stateLoadCallback) - same for sort: a stale sort
                      // column silently overrides the default display order
                      // on refresh, with nothing on screen indicating a
                      // non-default sort is active. Clear those two, keep
                      // the rest (page length/column visibility).
                      if (parsed && parsed.search) {
                        parsed.search.search = '';
                      }
                      if (parsed && parsed.order) {
                        delete parsed.order;
                      }
                      return parsed;
                    }
                  } catch (e) { void e; }
                  return null;
                }
              }}
            >
              <caption className="sr-only">{t('admin.evalDashboard.title')}</caption>
            </DataTable>
        </div>
      )}
    </GcdsContainer>
  );
};

export default EvalDashboardPage;
