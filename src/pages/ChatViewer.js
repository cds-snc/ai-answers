import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { GcdsContainer, GcdsText, GcdsLink, GcdsButton } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { useChatLogs } from '../hooks/chatviewer/useChatLogs.js';
import { useChatTimeline } from '../hooks/chatviewer/useChatTimeline.js';
import { useChatLogsTable } from '../hooks/chatviewer/useChatLogsTable.js';
import { useChatIdLookup } from '../hooks/admin/useChatIdLookup.js';
import StatusMessage, { useSrAnnouncer } from '../components/admin/StatusMessage.js';
import FeedbackInlineError from '../components/chat/FeedbackInlineError.js';
import ChatIdMatchList from '../components/admin/ChatIdMatchList.js';
import { formatNumber } from '../utils/numberFormat.js';
import { dataTableLanguage } from '../utils/dataTableLanguage.js';
import { buildChatReviewHref, chatLangFromPageLanguage } from '../utils/reviewLink.js';
import 'prismjs/themes/prism.css';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-xml-doc.js';

// "All" isn't one of these - it's its own pill below (a reset to no
// filter, not a fifth toggle to combine with the rest).
const LOG_LEVELS = [
  { value: 'info', labelKey: 'logging.info' },
  { value: 'debug', labelKey: 'logging.debug' },
  { value: 'warn', labelKey: 'logging.warn' },
  { value: 'error', labelKey: 'logging.error' },
];

// Registers the datatables.net-dt build with the React wrapper - same
// pattern as MetricsDashboard.js/TechnicalMetricsDashboard.js's own
// DataTable.use(DT). Separate from useChatLogsTable.js's own
// `import 'datatables.net-dt'` side effect, which registers $.fn.DataTable
// on jQuery for that hook's own direct jQuery-driven table - two different
// consumption paths for the same underlying library.
DataTable.use(DT);

const ChatViewer = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  // Shared with the admin/eval "find a chat" pattern (ViewChatByIdSection.js,
  // EvalDashboardPage.js's standalone search): validates the typed ID and
  // confirms a chat with that ID actually exists before this page acts on it.
  const {
    chatId,
    setChatId,
    handleInputChange: handleChatIdLookupChange,
    loading: isCheckingChatId,
    status: chatIdStatus,
    setStatus: setChatIdStatus,
    setLoading: setCheckingChatId,
    hasError: hasChatIdError,
    errorCount: chatIdErrorCount,
    errorRef: chatIdErrorRef,
    inlineErrorMessage: chatIdInlineError,
    matches: chatIdMatches,
    matchesTruncated: chatIdMatchesTruncated,
    searchChats,
    selectMatch,
  } = useChatIdLookup({ lang });
  // Empty array means "All" - no filter, every level shown. Multi-select
  // (Warning + Error together is the whole point of combining them), not
  // the old single-choice dropdown's exclusive value.
  const [selectedLevels, setSelectedLevels] = useState([]);
  // Gates the level filter and trace/log view - neither is meaningful (or
  // shown) until a chat is actually confirmed found. Distinct from chatId
  // being non-empty (which is just "something is typed") - staged on
  // purpose: search/confirm the chat ID first, then everything else appears.
  const [hasConfirmedChat, setHasConfirmedChat] = useState(false);
  // Same details/summary "hidey" pattern as EvalDashboardPage.js's own
  // eval-search-chat-id panel - open by default, collapses automatically
  // once a chat's confirmed (resolveConfirmedChat). Reopening it lets the
  // admin search a different ID; that reopened search also doubles as the
  // Refresh results action further down.
  const [idPanelOpen, setIdPanelOpen] = useState(true);
  // Error text only - a failed fetch has no other visual cue, so it stays a
  // real, visible StatusMessage. Success doesn't need one: the table filling
  // in and the panel collapsing already say "it worked" loudly.
  const [refreshAnnouncement, setRefreshAnnouncement] = useState('');
  // The confirmed chat's own pageLanguage (normalized to 'en'/'fr'), for the
  // "Trace for: {chatId}" link's href below - buildChatReviewHref routes to
  // the chat's OWN language, not the admin's (official-languages.md Rule 2:
  // the review page and everything in the transcript itself must match what
  // the end user actually experienced). Set from the confirmed chat object
  // in resolveConfirmedChat; cleared alongside hasConfirmedChat everywhere
  // else it resets.
  const [confirmedChatLang, setConfirmedChatLang] = useState(null);
  const tableRef = useRef(null);
  const chatIdInputRef = useRef(null);
  const idPanelSummaryRef = useRef(null);
  // Lets an in-flight refresh recognize that the user has since switched to
  // a different chatId, so its result doesn't overwrite the announcement or
  // focus for the chat now on screen.
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;
  // The last chatId resolveConfirmedChat actually confirmed - distinct from
  // chatId (which also tracks whatever's typed, unconfirmed, in the reopened
  // panel). Lets resolveConfirmedChat tell "refreshing the same chat" apart
  // from "confirming a different one" - see its reset below.
  const confirmedChatIdRef = useRef(null);

  const { isRefreshingLogs, logs, refreshLogs } = useChatLogs(chatId);
  const stepTimeline = useChatTimeline(logs);
  const isBusy = isCheckingChatId || isRefreshingLogs;
  // The pill <button>s don't announce their new state natively, and the
  // table re-filtering below is a purely visual change (see
  // docs/coding-agent-docs/status-and-error-messaging.md's sr-only-
  // announcement test). sr-only only - which pill is dark and the table
  // itself already say this loudly for sighted users.
  const { message: levelFilterMessage, nonce: levelFilterNonce, announce: announceLevelFilter } = useSrAnnouncer();
  // Same reasoning, for an initial search's success outcome - the table
  // filling in for the first time already shows it. Refresh results
  // doesn't get the sr-only-only treatment: a refresh's whole point is that
  // the data might have changed since last looked at it, so the table
  // looking the same as before isn't itself confirmation it worked.
  const { message: loadAnnouncement, nonce: loadAnnounceNonce, announce: announceLoad } = useSrAnnouncer();
  // Visible (not sr-only, unlike the announcers above) confirmation that a
  // Refresh results click actually re-fetched.
  const {
    message: refreshResultsMessage,
    nonce: refreshResultsNonce,
    announce: announceRefreshResults,
    clear: clearRefreshResultsMessage,
  } = useSrAnnouncer();

  // Declared ahead of useChatLogsTable below (rather than alongside the
  // page's other handlers further down) so it exists in time to be passed
  // in as onDownloadLogs - the hook renders this into the log table's own
  // DataTables search row (layout.topEnd) rather than this page rendering
  // a separate button of its own.
  const handleDownloadLogs = () => {
    if (!chatId || !logs || logs.length === 0) {
      return;
    }

    const payload = {
      chatId,
      exportedAt: new Date().toISOString(),
      logCount: logs.length,
      logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `chat-logs-${chatId}-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useChatLogsTable({
    tableRef,
    logs,
    lang,
    selectedLevels,
    t,
    onDownloadLogs: handleDownloadLogs,
  });

  useEffect(() => {
    const storedChatId = localStorage.getItem('chatId');
    if (storedChatId) {
      setChatId(storedChatId);
    }
  }, []);

  // '' (the All pill) resets to no filter; any other value toggles its own
  // membership in selectedLevels, so Warning + Error can be shown together.
  // Counts client-side off the same `logs` array the table renders from -
  // useChatLogsTable's column(1).search does the equivalent multi-value
  // match, same comparison as the .filter() below.
  const handleLogLevelChange = (level) => {
    const nextLevels = level === ''
      ? []
      : selectedLevels.includes(level)
        ? selectedLevels.filter((l) => l !== level)
        : [...selectedLevels, level];
    setSelectedLevels(nextLevels);
    const count = nextLevels.length > 0
      ? logs.filter((log) => nextLevels.includes(log.logLevel)).length
      : logs.length;
    announceLevelFilter(
      nextLevels.length > 0
        ? t('logging.levelFilterAnnouncement')
            .replace('{count}', formatNumber(count, lang))
            .replace(
              '{level}',
              nextLevels.map((l) => t(LOG_LEVELS.find((entry) => entry.value === l)?.labelKey)).join(', ')
            )
        : t('logging.levelFilterAnnouncementAll').replace('{count}', formatNumber(count, lang))
    );
  };

  // Editing the field is a draft, not a commitment - only an explicit new
  // Search (handleSearchChatId -> resolveConfirmedChat) replaces whatever
  // chat is currently confirmed/loaded on screen.
  const handleChatIdChange = (e) => {
    handleChatIdLookupChange(e);
  };

  // Shared tail for every way a chat can get confirmed: an initial search
  // resolving to one match (searchChats), picking one out of several
  // (selectMatch), or a Refresh results click on an already-confirmed chat.
  // `requestedChatId` is the id that call was actually for. `source`
  // ('search' | 'refresh') only changes what happens once it succeeds -
  // whether to refocus, and whether the outcome is sr-only or a visible
  // message - the confirm/fetch logic itself is identical either way.
  //
  // chatIdRef guards throughout: both paths involve a real network round
  // trip, during which the viewer may have typed a different chatId - if
  // so, this result no longer describes what's on screen.
  const resolveConfirmedChat = async (chat, requestedChatId, source = 'search') => {
    if (chatIdRef.current !== requestedChatId) {
      return;
    }
    if (!chat) {
      // searchChats/selectMatch already cover empty/malformed input and
      // "no such chat" - just clear any stale success message.
      setRefreshAnnouncement('');
      return;
    }
    setChatIdStatus(null);
    // Routes the "Trace for: {chatId}" link to the chat's OWN language, not
    // the admin's - see reviewLink.js's own note.
    setConfirmedChatLang(chatLangFromPageLanguage(chat.pageLanguage));
    // A level filter or refresh message carried over from a previously-
    // viewed chat is a bug, not a convenience - only reset on an actually
    // different chat, not a re-search/refresh of the same one.
    if (confirmedChatIdRef.current !== requestedChatId) {
      setSelectedLevels([]);
      clearRefreshResultsMessage();
    }
    confirmedChatIdRef.current = requestedChatId;
    // Not gated on the log fetch below finishing, so the rest of the page
    // appears the moment the search resolves. Collapsing the ID panel here
    // is what turns "search again" into this page's only refresh mechanism.
    setHasConfirmedChat(true);
    setIdPanelOpen(false);

    const { logs: nextLogs, error } = await refreshLogs();
    if (chatIdRef.current !== requestedChatId) {
      return;
    }

    // searchChats/selectMatch's success branch leaves loading true for this
    // next step (see checkChatExists) - cleared here.
    setCheckingChatId(false);

    // A failed fetch also resolves to zero logs, so it needs its own
    // visible message - otherwise a failure reads identically to "nothing
    // new".
    if (error) {
      setRefreshAnnouncement(t('logging.refreshFailed'));
    } else {
      setRefreshAnnouncement('');
      const successMessage = t('logging.refreshComplete').replace('{count}', formatNumber(nextLogs.length, lang));
      if (source === 'refresh') {
        announceRefreshResults(successMessage);
      } else {
        announceLoad(successMessage);
      }
    }

    // Refresh results needs no explicit refocus - GcdsButton's `disabled`
    // reflects to aria-disabled, not the native attribute, so it stays
    // focusable and focus naturally stays put. The initial-search path is
    // different: the ID panel collapsing takes whatever had focus with it,
    // so it needs an explicit refocus onto the summary (2.4.3).
    if (source !== 'refresh') {
      idPanelSummaryRef.current?.focus?.();
    }
  };

  // The only action available before a chat is confirmed - explicit,
  // deliberate search (never auto-triggered by typing). Accepts a partial
  // ID as well as a full one - see useChatIdLookup.js's searchChats. A
  // partial fragment matching several chats leaves chatIdMatches populated
  // instead of resolving here; picking one (handleSelectMatch) runs through
  // the same resolveConfirmedChat tail. Also doubles as the refresh
  // mechanism, either by reopening the ID panel and searching the same ID
  // again, or via the dedicated Refresh results button (source: 'refresh').
  const handleSearchChatId = async (source = 'search') => {
    // Per AGENTS.md's "prefer rejecting the interaction over disabling the
    // control" - letting an empty submit through to searchChats('') below
    // surfaces the existing "Chat ID required" inline error instead of just
    // doing nothing. isBusy still short-circuits - that's a legitimate,
    // self-evident, temporary reason.
    if (isBusy) {
      return;
    }

    const typedChatId = chatId;

    // A fragment resolving to exactly one match updates chatId to that full
    // ID (searchChats' own setChatId) - resolveConfirmedChat's chatIdRef
    // guard has to compare against that resolved ID, not the originally-
    // typed fragment, or it would wrongly discard a perfectly good result.
    const chat = await searchChats(typedChatId);
    await resolveConfirmedChat(chat, chat?.chatId ?? typedChatId, source);
  };

  const handleSelectMatch = async (selectedChatId) => {
    const chat = await selectMatch(selectedChatId);
    await resolveConfirmedChat(chat, selectedChatId);
  };

  return (
    <GcdsContainer layout="page" className="mb-600 filter-fields-full-size">
      <h1 className="mb-400">{t('logging.title')}</h1>
      {/* TODO: this aria-label is hand-copied onto every admin page's own <nav> —
          worth centralizing into a shared local nav/breadcrumb component so new
          pages can't reintroduce the unlabeled-nav gap this fixes. */}
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('logging.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      <section className="mb-600">
        {/* Same details/summary "hidey" as EvalDashboardPage.js's
            eval-search-chat-id panel (.filter-panel/.filter-panel-summary,
            admin.css's eval-search-chat-id override so it doesn't shrink
            to a pill when closed). See idPanelOpen's own comment above. */}
        <details
          className="filter-panel eval-search-chat-id"
          open={idPanelOpen}
          onToggle={(e) => setIdPanelOpen(e.target.open)}
        >
          <summary className="filter-panel-summary" ref={idPanelSummaryRef}>
            <Search className="filter-panel-summary__icon" aria-hidden="true" />
            {/* Same shared label as EvalDashboardPage.js's/
                ViewChatByIdSection.js's own summary (admin.common) - just
                expands/collapses the search form, not a status display.
                The "Trace for:" line below names what's loaded. */}
            {t('admin.common.viewChatById')}
          </summary>
          <div className="filter-panel-content">
            <label htmlFor="chatIdInput" className="filter-label display-block">
              {t('logging.enterChatId')}
            </label>
            {hasChatIdError && (
              <FeedbackInlineError
                id="chatIdInput-error"
                message={chatIdInlineError}
                errorCount={chatIdErrorCount}
                inputRef={chatIdErrorRef}
              />
            )}
            {/* chat-id-lookup-field: same max-width: 40rem cap as
                ViewChatByIdSection.js's/EvalDashboardPage.js's own chatId
                fields (admin.css), instead of stretching full-width. */}
            <div className="chat-id-lookup-field">
              <input
                id="chatIdInput"
                name="chatId"
                type="text"
                ref={chatIdInputRef}
                value={chatId}
                onChange={handleChatIdChange}
                placeholder={t('admin.common.chatIdSearchPlaceholder')}
                required
                aria-required="true"
                disabled={isBusy}
                aria-describedby={hasChatIdError ? 'chatIdInput-error' : undefined}
                className="filter-input"
              />
            </div>
            <GcdsButton
              id="search-chat-id-button"
              type="button"
              disabled={isBusy}
              onClick={() => handleSearchChatId('search')}
              className="mt-200"
            >
              {isBusy ? t('logging.refreshPending') : t('admin.common.chatIdSearchButton')}
            </GcdsButton>
            {/* Shared with ViewChatByIdSection.js's own field - see
                ChatIdMatchList.js. */}
            <ChatIdMatchList
              fieldId="chatIdInput"
              matches={chatIdMatches}
              matchesHeading={t('admin.common.chatIdMatchesFound').replace('{count}', chatIdMatches?.length ?? 0)}
              matchesTruncatedMessage={
                chatIdMatchesTruncated
                  ? t('admin.common.chatIdMatchesTruncated').replace('{count}', chatIdMatches?.length ?? 0)
                  : null
              }
              onSelectMatch={handleSelectMatch}
            />
          </div>
        </details>

        {/* Which chat is loaded - a plain link to it in review mode
            (buildChatReviewHref, same pattern as ContentIssueChatsCard.js/
            UsedChatsPanel.js/EvalAnalysisReport.js), informational rather
            than a closable filter pill. Routes to the chat's OWN language
            (confirmedChatLang), not the admin's - see reviewLink.js's own
            note; `lang` is the admin's current language, for the review
            page's/link's own chrome. */}
        {hasConfirmedChat && (
          <>
            {/* Same referring-url-label pill ChatInterface.js's admin/
                review-mode view uses for "Referring URL: <link>", reused
                here for "Trace for: {chatId}". Wrapped in a block-level div
                since the pill itself is display:inline-block and this page
                needs the Refresh button below to land on its own line. */}
            <div className="mb-200">
              <span className="referring-url-label">
                <b>{t('logging.traceFor')}</b>{' '}
                <GcdsLink
                  href={buildChatReviewHref(chatId, confirmedChatLang, null, lang)}
                  target="_blank"
                  lang={lang}
                >
                  {chatId}
                </GcdsLink>
              </span>
            </div>
            {/* Re-runs the same search tail as the Search button above -
                evals can run against a chat well after it's over (a manual
                re-trigger, or an async auto-eval batch), appending new log
                entries under the same chatId. This is the "did anything get
                logged since I last looked" check, without reopening the ID
                panel by hand. */}
            <GcdsButton
              id="refresh-results-button"
              type="button"
              buttonRole="secondary"
              disabled={isBusy}
              onClick={() => handleSearchChatId('refresh')}
              className="mb-0"
            >
              {isBusy ? t('logging.refreshPending') : t('logging.refreshResults')}
            </GcdsButton>
            {/* Visible (not sr-only) - see refreshResultsMessage's own
                declaration. */}
            <StatusMessage
              persistent
              variant="success"
              message={refreshResultsMessage}
              nonce={refreshResultsNonce}
              className="mt-200"
            />
          </>
        )}

        <div>
          {/* chatIdStatus (not found / lookup failed) takes priority over
              a failed refresh - only one is ever meaningful at a time
              (resolveConfirmedChat clears chatIdStatus once a chat is
              confirmed). refreshAnnouncement only ever holds error text -
              see its own declaration. */}
          <StatusMessage
            variant={chatIdStatus ? chatIdStatus.variant : (refreshAnnouncement ? 'error' : undefined)}
            message={chatIdStatus ? chatIdStatus.text : refreshAnnouncement}
          />
          <StatusMessage persistent className="sr-only" message={loadAnnouncement} nonce={loadAnnounceNonce} />

          {hasConfirmedChat && stepTimeline && (
            <div>
              <h2>{t('logging.timeline.title')}</h2>
              {(stepTimeline.graphName || stepTimeline.userPerceivedMs != null) && (
                <ul>
                  {stepTimeline.graphName && (
                    <li>
                      <strong>{t('logging.timeline.graph')}:</strong> {stepTimeline.graphName}
                    </li>
                  )}
                  {stepTimeline.userPerceivedMs != null && (
                    <li>
                      <strong>{t('logging.timeline.userPerceived')}:</strong>{' '}
                      {stepTimeline.userPerceivedMs} ms
                    </li>
                  )}
                </ul>
              )}

              {stepTimeline.steps.length > 0 ? (
                // Same static-summary-table shape as MetricsDashboard.js's
                // Questions/Accuracy tables (paging/searching/ordering/info
                // all off) - a 5-10 row breakdown has nothing to page,
                // search, or sort. No "display" class either: that bundles
                // zebra striping + row-hover, which reads as an interactive/
                // sortable affordance this table doesn't have. type: 'num'
                // lets DataTables apply its own numeric right-align class,
                // same as countPctTable.js's numCol/pctCol.
                <DataTable
                  className="table-slim-padding"
                  data={stepTimeline.steps.flatMap((step) => {
                    const pct =
                      step.duration != null && stepTimeline.pctDenom
                        ? Math.round((step.duration / stepTimeline.pctDenom) * 1000) / 10
                        : null;
                    const note =
                      step.startRel == null
                        ? t('logging.timeline.skipped')
                        : step.endRel == null
                          ? t('logging.timeline.incomplete')
                          : null;
                    const rows = [
                      { step: step.name, start: step.startRel, end: step.endRel, duration: step.duration, durationNote: note, pct },
                    ];

                    if (step.breakdown) {
                      const dlPct = stepTimeline.pctDenom
                        ? Math.round((step.breakdown.downloadDuration / stepTimeline.pctDenom) * 1000) / 10
                        : null;
                      const genPct = stepTimeline.pctDenom
                        ? Math.round((step.breakdown.generationDuration / stepTimeline.pctDenom) * 1000) / 10
                        : null;

                      rows.push(
                        {
                          step: `${t('logging.timeline.downloads')} (x${step.breakdown.downloadCount})`,
                          start: null, end: null, duration: step.breakdown.downloadDuration, durationNote: null, pct: dlPct, indent: true,
                        },
                        {
                          step: t('logging.timeline.generation'),
                          start: null, end: null, duration: step.breakdown.generationDuration, durationNote: null, pct: genPct, indent: true,
                        }
                      );
                    }

                    return rows;
                  })}
                  columns={[
                    {
                      title: t('logging.timeline.step'),
                      data: 'step',
                      render: (d, type, row) => (type === 'display' && row.indent ? `<span style="padding-left:1.5em">${d}</span>` : d),
                    },
                    { title: t('logging.timeline.start'), data: 'start', type: 'num', render: (d, type) => (type === 'display' ? d ?? '-' : d) },
                    { title: t('logging.timeline.end'), data: 'end', type: 'num', render: (d, type) => (type === 'display' ? d ?? '-' : d) },
                    {
                      title: t('logging.timeline.duration'),
                      data: 'duration',
                      type: 'num',
                      render: (d, type, row) => {
                        if (type !== 'display') return d;
                        if (d != null) return d;
                        return row.durationNote ? `(${row.durationNote})` : '-';
                      },
                    },
                    { title: t('logging.timeline.pctOfTotal'), data: 'pct', type: 'num', render: (d, type) => (type === 'display' ? (d != null ? `${d}%` : '-') : d) },
                  ]}
                  options={{
                    paging: false,
                    searching: false,
                    ordering: false,
                    info: false,
                    language: dataTableLanguage(lang),
                  }}
                >
                  <caption className="sr-only">{t('logging.timeline.title')}</caption>
                </DataTable>
              ) : (
                <p>{t('logging.timeline.noTimeline')}</p>
              )}
            </div>
          )}

          {hasConfirmedChat && logs && (
            // metrics-table-container, not dashboard-table-container: this
            // table stays inside the page's normal grid/container width,
            // same as MetricsDashboard.js's own tables - no 90vw breakout.
            //
            // onClick here (not on the Refresh results button alone) is a
            // deliberate catch-all: a level pill, a metadata
            // expand/collapse toggle, a DataTables sort header/search box/
            // page button - none of those React-owns individually (most
            // are jQuery-rendered), but a real click still bubbles through
            // this one delegated listener regardless of what rendered the
            // target. clearRefreshResultsMessage no-ops if already empty.
            <div className="metrics-table-container" onClick={clearRefreshResultsMessage}>
              {/* Visible, not the shared sr-only admin.common.resultsHeading
                  other dashboards use - this sits right below the step
                  timeline's own visible h2, so a silent heading here would
                  read as an unlabeled continuation of that section. */}
              <h2>{t('logging.entriesHeading')}</h2>
              {/* Above the table on purpose, not up by the chat ID panel -
                  the pills only filter this table's rows (useChatLogsTable's
                  column search); they have nothing to do with the step
                  timeline above (useChatTimeline runs off the full,
                  unfiltered logs array). role="group"/aria-label carries the
                  pills' accessible name since there's no visible "Filter by
                  level" text. Real GcdsButtons: secondary role normally,
                  primary for whichever level(s) are selected. aria-pressed
                  (a real toggle-button state), not aria-current (that's for
                  "current page in a set") - and never the buttonRole colour
                  swap alone, since that carries no non-visual state (1.4.1).
                  Each label includes its own count - Warning/Error
                  otherwise look identical whether they hold 1 entry or 0.
                  Download lives in the table's own DataTables search row
                  (useChatLogsTable's layout.topEnd), not here. */}
              <div
                className="filter-bar__presets mb-200"
                role="group"
                aria-label={t('logging.filterByLevel')}
              >
                <GcdsButton
                  type="button"
                  buttonRole={selectedLevels.length === 0 ? 'primary' : 'secondary'}
                  onClick={() => handleLogLevelChange('')}
                  aria-pressed={selectedLevels.length === 0}
                >
                  {t('logging.all')} ({formatNumber(logs.length, lang)})
                </GcdsButton>
                {LOG_LEVELS.map(({ value, labelKey }) => {
                  const isActive = selectedLevels.includes(value);
                  const count = logs.filter((log) => log.logLevel === value).length;
                  return (
                    <GcdsButton
                      key={value}
                      type="button"
                      buttonRole={isActive ? 'primary' : 'secondary'}
                      onClick={() => handleLogLevelChange(value)}
                      aria-pressed={isActive}
                    >
                      {t(labelKey)} ({formatNumber(count, lang)})
                    </GcdsButton>
                  );
                })}
              </div>
              <StatusMessage persistent className="sr-only" message={levelFilterMessage} nonce={levelFilterNonce} />
              {/* Always mounted, even with zero logs — DataTables shows its
                  own localized empty state (see useChatLogsTable), keeping
                  tableRef stable so focus can be captured/restored across
                  refreshes instead of lost to <body>.

                  The wrapper div is load-bearing: DataTables re-parents
                  <table> into its own container, so it's no longer where
                  React left it. Without this div, React would try to
                  insert the conditional download button above using the
                  table as its reference sibling and throw NotFoundError.
                  A plain div here that React treats as a leaf confines
                  every DataTables DOM mutation inside a node React never
                  has to reach past. */}
              <div>
                {/* dashboard-table/zebra-stable-on-hover: same zebra
                    striping with no row-hover effect as BatchList.js's
                    plain (non-grouped) table - no chat-group rowspanning
                    here, so dashboard-table--grouped isn't needed. */}
                <table ref={tableRef} className="display dashboard-table zebra-stable-on-hover">
                  <thead>
                    <tr>
                      <th>{t('logging.createdAt')}</th>
                      <th>{t('logging.level')}</th>
                      <th>{t('logging.message')}</th>
                      <th>{t('logging.metadata')}</th>
                    </tr>
                  </thead>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </GcdsContainer>
  );
};

export default ChatViewer;
