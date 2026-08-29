import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GcdsContainer, GcdsText } from '@gcds-core/components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../../hooks/useTranslations.js';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';
import { formatNumber, formatPercent } from '../../utils/numberFormat.js';
import EndUserFeedbackSection from '../metrics/EndUserFeedbackSection.js';
import FilterPanel from './FilterPanel.js';
import MetricsService from '../../services/MetricsService.js';
import StatusMessage from './StatusMessage.js';
import LoadingOverlay from './LoadingOverlay.js';
import SectionLoadingIndicator from './SectionLoadingIndicator.js';
import { setColumnHeaderScope } from '../../utils/admin/dataTableAccessibility.js';
import { escapeHtml } from '../../utils/htmlEscape.js';
import { useSearchAnnouncement } from '../../hooks/admin/useSearchAnnouncement.js';
import { useResultsLoadedAnnouncement } from '../../hooks/admin/useResultsLoadedAnnouncement.js';
import { buildCountPctRow, getCountPctColumns } from '../../utils/metrics/countPctTable.js';

DataTable.use(DT);

const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString()
  };
};

const initialMetricsState = {
  totalConversations: 0,
  totalConversationsEn: 0,
  totalConversationsFr: 0,
  sessionsByQuestionCount: {
    singleQuestion: { total: 0, en: 0, fr: 0 },
    twoQuestions: { total: 0, en: 0, fr: 0 },
    threeQuestions: { total: 0, en: 0, fr: 0 }
  },
  totalQuestions: 0,
  totalQuestionsEn: 0,
  totalQuestionsFr: 0,
  answerTypes: {
    normal: { total: 0, en: 0, fr: 0 },
    'clarifying-question': { total: 0, en: 0, fr: 0 },
    'pt-muni': { total: 0, en: 0, fr: 0 },
    'not-gc': { total: 0, en: 0, fr: 0 }
  },
  expertScored: {
    total: { total: 0, en: 0, fr: 0 },
    correct: { total: 0, en: 0, fr: 0 },
    needsImprovement: { total: 0, en: 0, fr: 0 },
    hasError: { total: 0, en: 0, fr: 0 },
    hasCitationError: { total: 0, en: 0, fr: 0 },
    harmful: { total: 0, en: 0, fr: 0 },
    hasContentIssue: { total: 0, en: 0, fr: 0 }
  },
  aiScored: {
    total: { total: 0, en: 0, fr: 0 },
    correct: { total: 0, en: 0, fr: 0 },
    needsImprovement: { total: 0, en: 0, fr: 0 },
    hasError: { total: 0, en: 0, fr: 0 },
    hasCitationError: { total: 0, en: 0, fr: 0 },
    harmful: { total: 0, en: 0, fr: 0 }
  },
  byDepartment: {},
  publicFeedbackTotals: {
    totalQuestionsWithFeedback: 0,
    yes: 0, no: 0, enYes: 0, enNo: 0, frYes: 0, frNo: 0
  },
  publicFeedbackReasons: { yes: {}, no: {} },
  publicFeedbackScores: {},
  publicFeedbackReasonsByLang: { en: {}, fr: {} }
};

const MetricsDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  // err.message is raw, untranslated exception text — wrap it in its own
  // lang="en" span in SectionWrapper below rather than rendering it inside a
  // translated StatusMessage, same pattern as DeleteChatSection.js.
  // admin.common.fetchError: shared with TechnicalMetricsDashboard.js's
  // identical fetch-error template (was two duplicate page-scoped keys).
  // TODO (Official Languages): still just a pronunciation fix, not a
  // translation — needs the metrics-* API routes to return a stable error
  // code instead of free text before this can be properly localized.
  const [fetchErrorPrefix, fetchErrorSuffix] = t('admin.common.fetchError').split('{message}');
  const [metrics, setMetrics] = useState(initialMetricsState);
  const [loadingState, setLoadingState] = useState({
    usage: false,
    session: false,
    expert: false,
    ai: false,
    publicFb: false,
    dept: false
  });
  const [errorState, setErrorState] = useState({
    usage: null,
    session: null,
    expert: null,
    ai: null,
    publicFb: null,
    dept: null
  });

  // AbortController ref for cancelling in-flight requests
  const abortControllerRef = useRef(null);

  // Track if we've ever loaded data to decide when to show the dashboard vs empty state
  const [hasStartedLoading, setHasStartedLoading] = useState(false);
  // True once any one of the 6 sections has settled (success or error) this
  // fetch cycle — drives the LoadingOverlay-then-incremental-reveal handoff
  // below. Reset false at the top of fetchMetrics, flipped true in
  // fetchSection's own finally (runs for every section either way).
  const [hasAnySectionSettled, setHasAnySectionSettled] = useState(false);

  // Announcement of the Institution breakdown table's own search box
  // narrowing (SC 4.1.3) — shared with ChatDashboardPage.js. Also reused
  const { noteSearchResult } = useSearchAnnouncement({ t, fmtN });

  // Memoized: the DataTables React wrapper rebuilds every row when the
  // `data` prop's identity changes, and this component re-renders on each
  // filter keystroke (noteSearchResult sets state) - an inline array meant
  // a full rebuild per keystroke, which also jumped the page to the top.
  const byDepartmentRows = useMemo(
    () => Object.entries(metrics.byDepartment).map(([department, data]) => ({
      department: (!department || department === 'Unknown') ? t('metrics.dashboard.byDepartment.noContextDept') : department,
      totalQuestions: data.total,
      expertScoredTotal: data.expertScored.total,
      expertScoredPct: data.total ? Math.round((data.expertScored.total / data.total) * 100) : 0,
      expertScoredHasError: data.expertScored.hasError,
      // null (not '-' directly): this column has real ordering
      // on (unlike Accuracy summary's twin above), so the raw
      // sort/type value has to stay numeric-or-null, with '-'
      // only substituted at display time below.
      expertScoredAccuracyPct: data.expertScored.total ? 100 - Math.round((data.expertScored.hasError / data.expertScored.total) * 100) : null
    })),
    [metrics.byDepartment, t]
  );

  const updateLoading = useCallback((key, isLoading) => {
    setLoadingState(prev => ({ ...prev, [key]: isLoading }));
  }, []);

  const updateError = useCallback((key, error) => {
    setErrorState(prev => ({ ...prev, [key]: error }));
  }, []);

  const fetchMetrics = useCallback(async (filters = null) => {
    // Cancel any in-flight requests before starting new ones
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    const f = filters || getDefaultDateRange();
    setHasStartedLoading(true);
    setHasAnySectionSettled(false);

    // Clear errors but keep stale data visible during loading (no flash)
    setErrorState({
      usage: null,
      session: null,
      expert: null,
      ai: null,
      publicFb: null,
      dept: null
    });

    // Helper to handle fetch with abort support and error tracking
    const fetchSection = async (key, fetchFn) => {
      updateLoading(key, true);
      updateError(key, null);
      try {
        const data = await fetchFn(f, signal);
        if (!signal.aborted) {
          setMetrics(prev => ({ ...prev, ...data }));
        }
      } catch (err) {
        if (!signal.aborted) {
          console.error(`${key} fetch error`, err);
          updateError(key, err.message || String(err));
        }
      } finally {
        if (!signal.aborted) {
          updateLoading(key, false);
          setHasAnySectionSettled(true);
        }
      }
    };

    // Fire all 6 requests in parallel (progressive loading)
    fetchSection('usage', MetricsService.getUsageMetrics.bind(MetricsService));
    fetchSection('session', MetricsService.getSessionMetrics.bind(MetricsService));
    fetchSection('expert', MetricsService.getExpertMetrics.bind(MetricsService));
    fetchSection('ai', MetricsService.getAiEvalMetrics.bind(MetricsService));
    fetchSection('publicFb', MetricsService.getPublicFeedbackMetrics.bind(MetricsService));
    fetchSection('dept', MetricsService.getDepartmentMetrics.bind(MetricsService));
  }, [updateLoading, updateError]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // The one completion announcement every dashboard makes ("Results
  // loaded.", nothing on zero) once every section has settled — the
  // counterpart to the LoadingOverlay shown until the first one does (see
  // render below).
  const allSettled = hasStartedLoading && !Object.values(loadingState).some(Boolean);
  useResultsLoadedAnnouncement({
    loading: hasStartedLoading && !allSettled,
    count: metrics.totalQuestions,
    // Any section failing shows its own error box; "Results loaded." on
    // top of that would contradict it.
    error: Object.values(errorState).some(Boolean),
    t,
  });

  const handleApplyFilters = (filters) => {
    fetchMetrics(filters);
  };

  const handleClearFilters = (defaultFilters) => {
    fetchMetrics(defaultFilters || { ...getDefaultDateRange(), userType: 'public' });
  };



  // 2nd question = sessions with 2+ questions; 3rd = sessions with 3+

  const secondQuestionTotal = metrics.sessionsByQuestionCount.twoQuestions.total + metrics.sessionsByQuestionCount.threeQuestions.total;
  const secondQuestionEn = metrics.sessionsByQuestionCount.twoQuestions.en + metrics.sessionsByQuestionCount.threeQuestions.en;
  const secondQuestionFr = metrics.sessionsByQuestionCount.twoQuestions.fr + metrics.sessionsByQuestionCount.threeQuestions.fr;

  // Builds one Accuracy summary row from raw {total,en,fr} count objects —
  // shared by all three rows below rather than duplicating the same
  // total/percent arithmetic three times. Returns raw numbers, not
  // formatted strings: see the DataTable's own columns comment for why.
  const buildAccuracyRow = (metricLabel, total, hasError) => ({
    metric: metricLabel,
    totalEvaluated: total.total,
    totalEvaluatedEn: total.en,
    totalEvaluatedFr: total.fr,
    pctOfQuestions: metrics.totalQuestions ? Math.round((total.total / metrics.totalQuestions) * 100) : null,
    hasAnswerError: hasError.total,
    accuracyPct: total.total ? 100 - Math.round((hasError.total / total.total) * 100) : 0,
    accuracyPctEn: total.en ? 100 - Math.round((hasError.en / total.en) * 100) : 0,
    accuracyPctFr: total.fr ? 100 - Math.round((hasError.fr / total.fr) * 100) : 0
  });

  const SectionWrapper = ({ children, isLoading, title, error }) => (
    <div className="mb-600">
      <div>
        {title && <h2 className="mb-0">{title}</h2>}
        {isLoading && (
          <SectionLoadingIndicator message={t('common.loading')} />
        )}
        {error && !isLoading && (
          <StatusMessage variant="error">
            {fetchErrorPrefix}<code lang="en">{error}</code>{fetchErrorSuffix}
          </StatusMessage>
        )}
        {/* No loading-dim/disable while a section refetches — removed rather
            than replaced the Tailwind-shaped classes here, which were never
            real CSS in this project. Same gap in
            TechnicalMetricsDashboard.js's identical SectionWrapper. */}
        {children}
      </div>
    </div>
  );

  return (
    <GcdsContainer size="xl">
      <div className="mb-100">
        <FilterPanel
          lang={lang}
          onApplyFilters={handleApplyFilters}
          onClearFilters={handleClearFilters}
          isVisible={true}
          defaultUserType="public"
          filterLoading={Object.values(loadingState).some(Boolean)}
          filterError={Object.values(errorState).find(Boolean) || null}
          filterResultCount={metrics.totalQuestions || 0}
          hasAppliedFilters={hasStartedLoading}
          // This dashboard's filters go through metrics-common.js's
          // parseRequestFilters, not the shared getChatFilterConditions —
          // partnerEval/aiEval are pushed as two separate sequential $match
          // pipeline stages there, not a combinable condition array, and
          // "Content issue" isn't wired into that filter path at all (even
          // though metrics-expert-feedback.js already computes the same
          // boolean for its own chart). Hidden here rather than offering a
          // choice that would silently match nothing. See FilterPanel's own
          // showEvalLogic prop comment.
          //
          // TODO: "No evaluation" is NOT hidden the same way, but has the
          // identical problem - parseRequestFilters passes it straight
          // through as the literal { category: 'noEval' }, which the
          // aggregation never actually produces (a no-eval row's category
          // is null, not the string 'noEval'), so selecting that checkbox
          // here silently returns zero rows every time. getChatFilterConditions
          // (Chat/Eval Dashboard) handles this correctly today - this path
          // never got the same treatment.
          //
          // Bigger question raised alongside that bug: given how much of
          // the full advanced FilterPanel doesn't cleanly apply here already
          // (evalLogic off, Content issue hidden, now a broken noEval too),
          // is reusing the whole shared FilterPanel even the right fit for
          // this dashboard, or would a smaller, dedicated filter set (only
          // the filters that actually work/make sense for these charts)
          // serve it better? Worth evaluating, not just patching noEval in
          // isolation.
          showEvalLogic={false}
          // "More filters" is hidden — answerType/partnerEval/aiEval are each
          // a hard pre-aggregation $match, so filtering by one collapses its
          // own breakdown table (Question types, Partner/AI evaluations) to
          // a 100%/0% tautology. urlEn/urlFr don't have this problem (a real
          // narrowing filter, no chart breaks down by referring URL) — if
          // wanted later, re-enable via showAdvancedSection={true}
          // showCategoryFilters={false} (both already in FilterPanel.js)
          // rather than exposing the other three columns too.
          //
          // department (Row 1, always visible) does NOT have this problem
          // despite the same kind of $match: the Institution breakdown
          // table's columns are each department's own internal ratio, not a
          // share of a cross-department total, so picking one institution
          // still shows real, meaningful numbers.
          showAdvancedSection={false}
        />
      </div>

      {/* Blocks the whole results area until the first of the 6 sections
          settles (success or error) — same LoadingOverlay pattern as
          ChatDashboardPage.js/EvalDashboardPage.js's single-fetch tables,
          adapted for this page's 6-concurrent-fetch shape. Once any one
          settles, the grid below takes over and each still-pending section
          shows its own SectionLoadingIndicator instead. */}
      {hasStartedLoading && !hasAnySectionSettled && (
        <LoadingOverlay message={t('admin.common.metricsLoading')} />
      )}

      {/* isEmptyPeriod also gates the tables block below: a genuinely empty
          period would otherwise render all 7 fixed-row tables full of
          zeroed rows underneath this same banner — a redundant wall of "0"
          repeating the one fact the banner already stated. Requires no
          errors anywhere: totalQuestions comes from the 'usage' fetch
          specifically, so a failed 'usage' fetch alone would also read as
          "0 questions" — without this check, hiding the tables would hide
          that section's error message (and any real data from the other,
          successful fetches) instead of just skipping redundant zeros. */}
      {(() => {
        const isEmptyPeriod = allSettled
          && !Object.values(errorState).some(Boolean)
          && metrics.totalQuestions === 0;
        return (
          <>
            {isEmptyPeriod && (
              <StatusMessage variant="info" assertive message={t('common.noDataForFilters')} />
            )}

            {hasAnySectionSettled && !isEmptyPeriod && (
              <GcdsContainer size="xl" className="mb-600">

                <div>
            {/* Table 1: Questions by position */}
            <SectionWrapper isLoading={loadingState.usage || loadingState.session} title={t('metrics.dashboard.questions.title')} error={errorState.usage || errorState.session}>
              <div>
                <DataTable
                  data={[
                    // percentage: 100 overrides buildCountPctRow's self-divide
                    // (count === denom here) — the helper falls to 0 when the
                    // count is genuinely 0, but this row is 100% of itself by
                    // definition regardless of count, matching this row's
                    // original hardcoded fmtPct(100) exactly. enPercentage/
                    // frPercentage aren't overridden: those were already
                    // computed (with the same 0-fallback) before this refactor.
                    { ...buildCountPctRow(t('metrics.dashboard.totalQuestions'), { total: metrics.totalQuestions, en: metrics.totalQuestionsEn, fr: metrics.totalQuestionsFr }, metrics.totalQuestions), percentage: 100 },
                    buildCountPctRow(t('metrics.dashboard.questions.firstQuestion'), { total: metrics.totalConversations, en: metrics.totalConversationsEn, fr: metrics.totalConversationsFr }, metrics.totalQuestions),
                    buildCountPctRow(t('metrics.dashboard.questions.secondQuestion'), { total: secondQuestionTotal, en: secondQuestionEn, fr: secondQuestionFr }, metrics.totalQuestions),
                    buildCountPctRow(t('metrics.dashboard.questions.thirdOrMore'), metrics.sessionsByQuestionCount.threeQuestions, metrics.totalQuestions)
                  ]}
                  columns={getCountPctColumns(t, fmtN, fmtPct)}
                  options={{ paging: false, searching: false, ordering: false, info: false, stripe: true, initComplete: function () { setColumnHeaderScope(this.api()); }, className: 'display zebra-stable-on-hover', language: dataTableLanguage(lang) }}
                >
                  <caption className="sr-only">{t('metrics.dashboard.questions.title')}</caption>
                </DataTable>
              </div>
            </SectionWrapper>

            {/* Table 2: Accuracy summary */}
            <SectionWrapper isLoading={loadingState.expert || loadingState.ai || loadingState.usage} title={t('metrics.dashboard.accuracy.title')} error={errorState.expert || errorState.ai || errorState.usage}>
              <p className="mb-300">{t('metrics.dashboard.accuracy.note')}</p>
              <div>
                <DataTable
                  data={[
                    buildAccuracyRow(
                      t('metrics.dashboard.accuracy.allEvaluations'),
                      {
                        total: metrics.expertScored.total.total + metrics.aiScored.total.total,
                        en: metrics.expertScored.total.en + metrics.aiScored.total.en,
                        fr: metrics.expertScored.total.fr + metrics.aiScored.total.fr
                      },
                      {
                        total: metrics.expertScored.hasError.total + metrics.aiScored.hasError.total,
                        en: metrics.expertScored.hasError.en + metrics.aiScored.hasError.en,
                        fr: metrics.expertScored.hasError.fr + metrics.aiScored.hasError.fr
                      }
                    ),
                    buildAccuracyRow(t('metrics.dashboard.accuracy.expertEvaluations'), metrics.expertScored.total, metrics.expertScored.hasError),
                    buildAccuracyRow(t('metrics.dashboard.accuracy.aiEvaluations'), metrics.aiScored.total, metrics.aiScored.hasError)
                  ]}
                  columns={[
                    { title: t('metrics.dashboard.metric'), data: 'metric' },
                    // type: 'num' on every column below, all backed by raw
                    // numbers (buildAccuracyRow above), not pre-formatted
                    // strings: DataTables only auto-detects a column's type
                    // (and thus its right-align class, dt-type-numeric) by
                    // guessing from string content when no type is
                    // declared — fragile for values like "93%"/"93 %" that
                    // depend on locale-specific formatting. Declaring the
                    // type explicitly skips that guesswork entirely, same
                    // fix as the reason-breakdown table below.
                    { title: t('metrics.dashboard.accuracy.totalEvaluated'), data: 'totalEvaluated', type: 'num', render: (d, type) => type === 'display' ? fmtN(d) : d },
                    { title: t('metrics.dashboard.accuracy.totalEvaluatedEn'), data: 'totalEvaluatedEn', type: 'num', render: (d, type) => type === 'display' ? fmtN(d) : d },
                    { title: t('metrics.dashboard.accuracy.totalEvaluatedFr'), data: 'totalEvaluatedFr', type: 'num', render: (d, type) => type === 'display' ? fmtN(d) : d },
                    // pctOfQuestions is the one nullable column (buildAccuracyRow
                    // returns null when totalQuestions is 0, no evaluations to
                    // divide by) — '-' is display-only, non-display types get a
                    // real number so DataTables' manual type never has to look
                    // at the raw value at all.
                    { title: t('metrics.dashboard.accuracy.pctOfQuestions'), data: 'pctOfQuestions', type: 'num', render: (d, type) => type === 'display' ? (d === null ? '-' : fmtPct(d)) : (d ?? 0) },
                    { title: t('metrics.dashboard.accuracy.hasAnswerError'), data: 'hasAnswerError', type: 'num', render: (d, type) => type === 'display' ? fmtN(d) : d },
                    { title: t('metrics.dashboard.accuracy.accuracyPct'), data: 'accuracyPct', type: 'num', render: (d, type) => type === 'display' ? fmtPct(d) : d },
                    { title: t('metrics.dashboard.accuracy.accuracyPctEn'), data: 'accuracyPctEn', type: 'num', render: (d, type) => type === 'display' ? fmtPct(d) : d },
                    { title: t('metrics.dashboard.accuracy.accuracyPctFr'), data: 'accuracyPctFr', type: 'num', render: (d, type) => type === 'display' ? fmtPct(d) : d }
                  ]}
                  options={{ paging: false, searching: false, ordering: false, info: false, stripe: true, initComplete: function () { setColumnHeaderScope(this.api()); }, className: 'display zebra-stable-on-hover', language: dataTableLanguage(lang) }}
                >
                  <caption className="sr-only">{t('metrics.dashboard.accuracy.title')}</caption>
                </DataTable>
              </div>
            </SectionWrapper>

            {/* Table 3: Sessions */}
            <SectionWrapper isLoading={loadingState.session} title={t('metrics.dashboard.sessions.title')} error={errorState.session}>
              <div>
                <DataTable
                  data={[
                    // percentage: 100 override — see the identical comment on
                    // Table 1's "Total questions" row above.
                    { ...buildCountPctRow(t('metrics.dashboard.totalSessions'), { total: metrics.totalConversations, en: metrics.totalConversationsEn, fr: metrics.totalConversationsFr }, metrics.totalConversations), percentage: 100 }
                  ]}
                  columns={getCountPctColumns(t, fmtN, fmtPct)}
                  options={{ paging: false, searching: false, ordering: false, info: false, stripe: true, initComplete: function () { setColumnHeaderScope(this.api()); }, className: 'display zebra-stable-on-hover', language: dataTableLanguage(lang) }}
                >
                  <caption className="sr-only">{t('metrics.dashboard.sessions.title')}</caption>
                </DataTable>
              </div>
            </SectionWrapper>

            {/* Table 4: Question types */}
            <SectionWrapper isLoading={loadingState.usage} title={t('metrics.dashboard.questionTypes.title')} error={errorState.usage}>
              <div>
                <DataTable
                  data={[
                    buildCountPctRow(t('metrics.dashboard.answerTypes.normal'), metrics.answerTypes.normal, metrics.totalQuestions),
                    buildCountPctRow(t('metrics.dashboard.answerTypes.clarifyingQuestion'), metrics.answerTypes['clarifying-question'], metrics.totalQuestions),
                    buildCountPctRow(t('metrics.dashboard.answerTypes.ptMuni'), metrics.answerTypes['pt-muni'], metrics.totalQuestions),
                    buildCountPctRow(t('metrics.dashboard.answerTypes.notGc'), metrics.answerTypes['not-gc'], metrics.totalQuestions)
                  ]}
                  columns={getCountPctColumns(t, fmtN, fmtPct)}
                  options={{ paging: false, searching: false, ordering: false, info: false, stripe: true, initComplete: function () { setColumnHeaderScope(this.api()); }, className: 'display zebra-stable-on-hover', language: dataTableLanguage(lang) }}
                >
                  <caption className="sr-only">{t('metrics.dashboard.questionTypes.title')}</caption>
                </DataTable>
              </div>
            </SectionWrapper>

            {/* Expert Scored Section */}
            <SectionWrapper isLoading={loadingState.expert} title={t('metrics.dashboard.expertScored.title')} error={errorState.expert}>
              <GcdsText className="font-size-text-xsm-nr mb-300">{t('metrics.dashboard.expertScored.description')}</GcdsText>
              <div>
                {/* TODO: "Has answer error" below can undercount - see the
                    long comment above the $group stage in
                    api/metrics/metrics-expert-feedback.js that computes
                    hasError/hasCitationError. An evaluation with both a
                    sentence error and a citation issue only counts under
                    Citation issue, never here. Same open "should these
                    stack instead of being mutually exclusive" question as
                    EvalDashboardPage.js's Partner/AI Eval pills - not yet
                    decided. */}
                <DataTable
                  data={[
                    // percentage: 100 override — see the comment on Table 1's
                    // "Total questions" row further up.
                    { ...buildCountPctRow(t('metrics.dashboard.expertScored.total'), metrics.expertScored.total, metrics.expertScored.total.total), percentage: 100 },
                    buildCountPctRow(t('metrics.dashboard.expertScored.hasError'), metrics.expertScored.hasError, metrics.expertScored.total),
                    buildCountPctRow(t('metrics.dashboard.expertScored.harmful'), metrics.expertScored.harmful, metrics.expertScored.total),
                    buildCountPctRow(t('metrics.dashboard.expertScored.hasContentIssue'), metrics.expertScored.hasContentIssue, metrics.expertScored.total),
                    buildCountPctRow(t('metrics.dashboard.expertScored.correct'), metrics.expertScored.correct, metrics.expertScored.total),
                    buildCountPctRow(t('metrics.dashboard.expertScored.needsImprovement'), metrics.expertScored.needsImprovement, metrics.expertScored.total),
                    buildCountPctRow(t('metrics.dashboard.expertScored.hasCitationError'), metrics.expertScored.hasCitationError, metrics.expertScored.total)
                  ]}
                  columns={getCountPctColumns(t, fmtN, fmtPct)}
                  options={{
                    paging: false,
                    searching: false,
                    initComplete: function () { setColumnHeaderScope(this.api()); },
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display zebra-stable-on-hover',
                    language: dataTableLanguage(lang)
                  }}
                >
                  <caption className="sr-only">{t('metrics.dashboard.expertScored.title')}</caption>
                </DataTable>
              </div>
            </SectionWrapper>

            {/* AI Scored Section */}
            <SectionWrapper isLoading={loadingState.ai} title={t('metrics.dashboard.aiScored.title')} error={errorState.ai}>
              <GcdsText className="font-size-text-xsm-nr mb-300">{t('metrics.dashboard.aiScored.description')}</GcdsText>
              <div>
                <DataTable
                  data={[
                    // percentage: 100 override — see the comment on Table 1's
                    // "Total questions" row further up.
                    { ...buildCountPctRow(t('metrics.dashboard.aiScored.total'), metrics.aiScored.total, metrics.aiScored.total.total), percentage: 100 },
                    buildCountPctRow(t('metrics.dashboard.aiScored.hasError'), metrics.aiScored.hasError, metrics.aiScored.total),
                    buildCountPctRow(t('metrics.dashboard.aiScored.correct'), metrics.aiScored.correct, metrics.aiScored.total),
                    buildCountPctRow(t('metrics.dashboard.aiScored.needsImprovement'), metrics.aiScored.needsImprovement, metrics.aiScored.total),
                    buildCountPctRow(t('metrics.dashboard.aiScored.hasCitationError'), metrics.aiScored.hasCitationError, metrics.aiScored.total)
                  ]}
                  columns={getCountPctColumns(t, fmtN, fmtPct)}
                  options={{
                    paging: false,
                    searching: false,
                    initComplete: function () { setColumnHeaderScope(this.api()); },
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display zebra-stable-on-hover',
                    language: dataTableLanguage(lang)
                  }}
                >
                  <caption className="sr-only">{t('metrics.dashboard.aiScored.title')}</caption>
                </DataTable>
              </div>
            </SectionWrapper>


            <SectionWrapper isLoading={loadingState.publicFb} title={null} error={errorState.publicFb}>
              <EndUserFeedbackSection t={t} metrics={metrics} lang={lang} />
            </SectionWrapper>

            <SectionWrapper isLoading={loadingState.dept} title={null} error={errorState.dept}>
              <div className="mb-600">
                <h2 className="mb-0">{t('metrics.dashboard.byDepartment.title')}</h2>
                {/* metrics-table-container (admin.css): same styled search
                    box as ChatDashboardPage.js/EvalDashboardPage.js's
                    .dashboard-table-container, minus its 90vw breakout width
                    — this table stays in the page's normal container. The
                    sort-header icons come from the "dashboard-table"
                    className on <DataTable> below, not this wrapper. */}
                <div className="metrics-table-container">
                <DataTable
                  className="display dashboard-table zebra-stable-on-hover"
                  data={byDepartmentRows}
                  columns={[
                    { title: t('metrics.dashboard.byDepartment.department'), data: 'department' },
                    { title: t('metrics.dashboard.totalQuestions'), data: 'totalQuestions', render: (d, type) => type === 'display' ? fmtN(d) : d },
                    { title: t('metrics.dashboard.expertScored.total'), data: 'expertScoredTotal', render: (d, type) => type === 'display' ? fmtN(d) : d },
                    // type: 'num' below: both were pre-formatted percent
                    // strings with no declared type, so DataTables had to
                    // guess the column type (and thus its right-align
                    // class) from string content — same fragile pattern
                    // fixed on the Accuracy summary and reason-breakdown
                    // tables above. This table also has ordering: true, so
                    // it was silently sorting these two columns as strings
                    // ("100%" < "9%" lexicographically) rather than numbers.
                    { title: t('metrics.dashboard.byDepartment.pctEvaluated'), data: 'expertScoredPct', type: 'num', render: (d, type) => type === 'display' ? fmtPct(d) : d },
                    { title: t('metrics.dashboard.expertScored.hasError'), data: 'expertScoredHasError', render: (d, type) => type === 'display' ? fmtN(d) : d },
                    { title: t('metrics.dashboard.accuracy.accuracyPct'), data: 'expertScoredAccuracyPct', type: 'num', render: (d, type) => type === 'display' ? (d === null ? '-' : fmtPct(d)) : (d ?? 0) }
                  ]}
                  options={{
                    paging: true,
                    searching: true,
                    ordering: true,
                    info: true,
                    // 10 matches DataTables' default lengthMenu ([10, 25, 50,
                    // 100]) - picking a value not in that list leaves the
                    // "entries per page" <select> with no matching <option>,
                    // rendering blank until the user manually picks one.
                    pageLength: 10,
                    stripe: true,
                    // Search top-left, entries+count bottom-left — matches
                    // ChatDashboardPage.js (EvalDashboardPage.js puts search
                    // top-right instead).
                    layout: {
                      topStart: 'search',
                      topEnd: {},
                      bottomStart: { features: ['pageLength', 'info'] },
                      bottomEnd: { paging: { firstLast: false } }
                    },
                    language: {
                      ...dataTableLanguage(lang),
                      // Filter-style box like the batch list / log entries:
                      // sr-only <label> text, "Filter" placeholder, native x
                      // to clear (no search-term pill).
                      search: `<span class="sr-only">${escapeHtml(t('metrics.dashboard.byDepartment.filterLabel'))}</span>`,
                      searchPlaceholder: t('admin.common.filterPlaceholder'),
                    },
                    initComplete: function () {
                      const api = this.api();
                      setColumnHeaderScope(api);
                      api.on('search.dt', () => {
                        noteSearchResult(api.search(), api.rows({ search: 'applied' }).count());
                      });
                    }
                  }}
                >
                  <caption className="sr-only">{t('metrics.dashboard.byDepartment.title')}</caption>
                </DataTable>
                </div>
              </div>
            </SectionWrapper>
          </div>
              </GcdsContainer>
            )}
          </>
        );
      })()}
    </GcdsContainer>
  );
};

export default MetricsDashboard;
