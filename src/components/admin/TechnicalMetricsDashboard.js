import React, { useEffect, useRef } from 'react';
import { GcdsContainer } from '@gcds-core/components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../../hooks/useTranslations.js';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';
import { setColumnHeaderScope } from '../../utils/admin/dataTableAccessibility.js';
import { formatNumber, formatPercent } from '../../utils/numberFormat.js';
import FilterPanel from './FilterPanel.js';
import { useTechnicalMetrics } from '../../hooks/admin/useTechnicalMetrics.js';
import StatusMessage from './StatusMessage.js';
import LoadingOverlay from './LoadingOverlay.js';
import SectionLoadingIndicator from './SectionLoadingIndicator.js';
import { useSearchAnnouncement } from '../../hooks/admin/useSearchAnnouncement.js';

DataTable.use(DT);

const TechnicalMetricsDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const {
    data,
    errorState,
    handleApplyFilters,
    handleClearFilters,
    hasStartedLoading,
    hasAnySectionSettled,
    loadingState,
  } = useTechnicalMetrics();

  // sr-only "loaded" completion announcement, counterpart to the
  // LoadingOverlay shown until the first section settles (see render
  // below) — same shared-persistent-region pattern as
  // MetricsDashboard.js/ChatDashboardPage.js's Clear-all.
  const { searchAnnouncement, searchAnnounceNonce, announce } = useSearchAnnouncement({ t, fmtN: (n) => formatNumber(n, lang) });
  const announcedCompletionRef = useRef(false);
  const allSettled = hasStartedLoading && !Object.values(loadingState).some(Boolean);
  // hasAnySectionSettled resets to false at the top of every fetchAll (see
  // useTechnicalMetrics.js) - use that same transition to rearm this ref for
  // the new cycle's own completion announcement, rather than only ever
  // firing once across the page's lifetime.
  useEffect(() => {
    if (!hasAnySectionSettled) {
      announcedCompletionRef.current = false;
    }
  }, [hasAnySectionSettled]);
  useEffect(() => {
    if (allSettled && !announcedCompletionRef.current) {
      announcedCompletionRef.current = true;
      announce(t('technicalMetrics.dashboard.loadedAnnouncement'));
    }
  }, [allSettled, announce, t]);

  const fmtNum = (n) => formatNumber(n, lang);
  const fmtMs = (n) => (n == null ? '–' : fmtNum(n));
  const fmtTokens = (n) => fmtNum(Math.round((n ?? 0) / 1000)) + 'K';
  const fmtPct = (num, denom) => denom ? formatPercent(Math.round((num / denom) * 100), lang) : formatPercent(0, lang);
  // err.message is raw, untranslated exception text — wrap it in its own
  // lang="en" span in SectionWrapper below rather than rendering it inside a
  // translated StatusMessage, same pattern as DeleteChatSection.js.
  // admin.common.fetchError: shared with MetricsDashboard.js's identical
  // fetch-error template (was two duplicate page-scoped keys).
  // TODO (Official Languages): still just a pronunciation fix, not a
  // translation — needs the metrics-* API routes to return a stable error
  // code instead of free text before this can be properly localized.
  const [fetchErrorPrefix, fetchErrorSuffix] = t('admin.common.fetchError').split('{message}');

  const SectionWrapper = ({ children, isLoading, title, error, note }) => (
    <div className="mb-600">
      <div>
        {title && <h2 className="mb-0">{title}</h2>}
        {note && <p className="font-size-text-small mb-300">{note}</p>}
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
            real CSS in this project. Same gap in MetricsDashboard.js's
            identical SectionWrapper. */}
        {children}
      </div>
    </div>
  );

  const renderMaxChatId = (chatId) => {
    if (!chatId) return '–';
    const href = `/${lang}?chat=${encodeURIComponent(chatId)}&review=1`;
    return `<a href="${href}">${chatId}</a>`;
  };

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
          filterResultCount={data.totalQuestions || 0}
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
          showEvalLogic={false}
          // "More filters" is hidden — answerType/partnerEval/aiEval are each
          // a hard pre-aggregation $match (computed from the shared usage/
          // expert-feedback metrics, not this page's own charts), so
          // filtering by one collapses its own breakdown table to a 100%/0%
          // tautology. urlEn/urlFr don't have this problem — if wanted later,
          // re-enable via showAdvancedSection={true} showCategoryFilters={false}
          // (both already in FilterPanel.js) rather than exposing the other
          // three columns too.
          showAdvancedSection={false}
        />
      </div>

      {/* Always mounted (not inside the loading-gated blocks below) — see
          MetricsDashboard.js's matching comment on why `persistent` needs a
          pre-existing empty live region. */}
      <StatusMessage persistent message={searchAnnouncement} nonce={searchAnnounceNonce} className="sr-only" />

      {/* Blocks the whole results area until the first section settles
          (success or error) — see MetricsDashboard.js's matching comment. */}
      {hasStartedLoading && !hasAnySectionSettled && (
        <LoadingOverlay message={t('technicalMetrics.dashboard.loading')} />
      )}

      {/* isEmptyPeriod also gates the tables block below — see the matching
          comment in MetricsDashboard.js. Requires no errors anywhere:
          totalQuestions comes from the 'usage' fetch specifically, so a
          failed 'usage' fetch alone would also read as "0 questions". */}
      {(() => {
        const isEmptyPeriod = allSettled
          && !Object.values(errorState).some(Boolean)
          && data.totalQuestions === 0;
        return (
          <>
            {isEmptyPeriod && (
              <StatusMessage variant="info" message={t('common.noDataForFilters')} />
            )}

            {hasAnySectionSettled && !isEmptyPeriod && (
              <GcdsContainer size="xl" className="mb-600">
          <div>
            <SectionWrapper
              isLoading={loadingState.technical}
              error={errorState.technical}
              title={t('technicalMetrics.dashboard.responseTime.title')}
              note={t('technicalMetrics.dashboard.responseTime.note')}
            >
              <div>
                <DataTable
                  data={[
                    {
                      metric: t('technicalMetrics.dashboard.responseTime.totalLabel'),
                      count: fmtNum(data.responseTime.count),
                      median: fmtMs(data.responseTime.median),
                      p90: fmtMs(data.responseTime.p90),
                      p95: fmtMs(data.responseTime.p95),
                      max: fmtMs(data.responseTime.max),
                      maxChatId: data.responseTime.maxChatId,
                    },
                  ]}
                  columns={[
                    { title: t('technicalMetrics.dashboard.metric'), data: 'metric' },
                    { title: t('technicalMetrics.dashboard.responseTime.count'), data: 'count' },
                    { title: t('technicalMetrics.dashboard.responseTime.median'), data: 'median' },
                    { title: t('technicalMetrics.dashboard.responseTime.p90'), data: 'p90' },
                    { title: t('technicalMetrics.dashboard.responseTime.p95'), data: 'p95' },
                    { title: t('technicalMetrics.dashboard.responseTime.max'), data: 'max' },
                    { title: t('technicalMetrics.dashboard.responseTime.maxChatId'), data: 'maxChatId', render: renderMaxChatId },
                  ]}
                  options={{
                    paging: false,
                    searching: false,
                    // scope="col" on headers (WCAG 1.3.1) - DataTables doesn't set it.
                    initComplete: function () { setColumnHeaderScope(this.api()); },
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display zebra-stable-on-hover',
                    language: dataTableLanguage(lang),
                  }}
                >
                  <caption className="sr-only">{t('technicalMetrics.dashboard.responseTime.title')}</caption>
                </DataTable>
              </div>
            </SectionWrapper>

            <SectionWrapper
              isLoading={loadingState.technical}
              error={errorState.technical}
              title={t('technicalMetrics.dashboard.tools.title')}
              note={t('technicalMetrics.dashboard.tools.note')}
            >
              <div>
                <DataTable
                  data={data.downloadWebPage.map((row) => ({
                    callNumber: row.callNumber,
                    totalCount: fmtNum(row.totalCount),
                    completedCount: fmtNum(row.completedCount),
                    errorCount: fmtNum(row.errorCount),
                    errorPercent: fmtPct(row.errorCount, row.totalCount),
                    median: fmtMs(row.median),
                    p95: fmtMs(row.p95),
                  }))}
                  columns={[
                    { title: t('technicalMetrics.dashboard.tools.callNumber'), data: 'callNumber' },
                    { title: t('technicalMetrics.dashboard.tools.totalCount'), data: 'totalCount' },
                    { title: t('technicalMetrics.dashboard.tools.completedCount'), data: 'completedCount' },
                    { title: t('technicalMetrics.dashboard.tools.errorCount'), data: 'errorCount' },
                    { title: t('technicalMetrics.dashboard.tools.errorPercent'), data: 'errorPercent' },
                    { title: t('technicalMetrics.dashboard.tools.median'), data: 'median' },
                    { title: t('technicalMetrics.dashboard.tools.p95'), data: 'p95' },
                  ]}
                  options={{
                    paging: false,
                    searching: false,
                    // scope="col" on headers (WCAG 1.3.1) - DataTables doesn't set it.
                    initComplete: function () { setColumnHeaderScope(this.api()); },
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display zebra-stable-on-hover',
                    language: dataTableLanguage(lang),
                  }}
                >
                  <caption className="sr-only">{t('technicalMetrics.dashboard.tools.title')}</caption>
                </DataTable>
              </div>
            </SectionWrapper>

            {/* Search/AI-call errors aren't part of the Chat aggregation other
                tables use — a hard failure aborts the graph before an
                interaction is persisted, so they're recorded independently
                (see ServiceCallMetricsService). Fixed rows (known providers/
                call types) so a healthy "0 errors" period is visible too.
                Error-rate columns divide by data.totalQuestions (the 'usage'
                fetch, not 'technical'), so both gate on
                loadingState.technical || loadingState.usage — same idiom as
                MetricsDashboard.js's "Accuracy summary" table — to avoid a
                misleading rate mid-fetch and to surface a 'usage' failure. */}
            <SectionWrapper
              isLoading={loadingState.technical || loadingState.usage}
              error={errorState.technical || errorState.usage}
              title={t('technicalMetrics.dashboard.searchCalls.title')}
              note={t('technicalMetrics.dashboard.searchCalls.note')}
            >
              <div>
                <DataTable
                  data={['canadaca', 'google'].map((provider) => {
                    const row = data.searchCalls?.[provider] || { errors: 0, retries: 0 };
                    return {
                      provider: t(`technicalMetrics.dashboard.searchCalls.provider.${provider}`),
                      errorCount: fmtNum(row.errors),
                      errorPercent: fmtPct(row.errors, data.totalQuestions),
                      // Raw count, not a rate: one question's search can
                      // retry more than once, so a % here could exceed 100%.
                      retryCount: fmtNum(row.retries),
                    };
                  })}
                  columns={[
                    { title: t('technicalMetrics.dashboard.searchCalls.provider.title'), data: 'provider' },
                    { title: t('technicalMetrics.dashboard.tools.errorCount'), data: 'errorCount' },
                    { title: t('technicalMetrics.dashboard.tools.errorPercent'), data: 'errorPercent' },
                    { title: t('technicalMetrics.dashboard.searchCalls.retryCount'), data: 'retryCount' },
                  ]}
                  options={{
                    paging: false,
                    searching: false,
                    // scope="col" on headers (WCAG 1.3.1) - DataTables doesn't set it.
                    initComplete: function () { setColumnHeaderScope(this.api()); },
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display zebra-stable-on-hover',
                    language: dataTableLanguage(lang),
                  }}
                >
                  <caption className="sr-only">{t('technicalMetrics.dashboard.searchCalls.title')}</caption>
                </DataTable>
              </div>
            </SectionWrapper>

            <SectionWrapper
              isLoading={loadingState.technical || loadingState.usage}
              error={errorState.technical || errorState.usage}
              title={t('technicalMetrics.dashboard.aiServiceCalls.title')}
              note={t('technicalMetrics.dashboard.aiServiceCalls.note')}
            >
              <div>
                <DataTable
                  data={['context', 'answer'].map((callType) => {
                    const row = data.aiServiceCalls?.[callType] || { errors: 0 };
                    return {
                      callType: t(`technicalMetrics.dashboard.aiServiceCalls.type.${callType}`),
                      errorCount: fmtNum(row.errors),
                      errorPercent: fmtPct(row.errors, data.totalQuestions),
                    };
                  })}
                  columns={[
                    { title: t('technicalMetrics.dashboard.aiServiceCalls.type.title'), data: 'callType' },
                    { title: t('technicalMetrics.dashboard.tools.errorCount'), data: 'errorCount' },
                    { title: t('technicalMetrics.dashboard.tools.errorPercent'), data: 'errorPercent' },
                  ]}
                  options={{
                    paging: false,
                    searching: false,
                    // scope="col" on headers (WCAG 1.3.1) - DataTables doesn't set it.
                    initComplete: function () { setColumnHeaderScope(this.api()); },
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display zebra-stable-on-hover',
                    language: dataTableLanguage(lang),
                  }}
                >
                  <caption className="sr-only">{t('technicalMetrics.dashboard.aiServiceCalls.title')}</caption>
                </DataTable>
              </div>
            </SectionWrapper>

            <SectionWrapper
              isLoading={loadingState.usage}
              error={errorState.usage}
              title={t('metrics.dashboard.tokens.title')}
              note={t('metrics.dashboard.tokens.note')}
            >
              <div>
                <DataTable
                  data={[
                    {
                      metric: t('metrics.dashboard.tokens.totalInput'),
                      count: fmtTokens(data.totalInputTokens),
                      percentage: formatPercent(100, lang),
                      enCount: fmtTokens(data.totalInputTokensEn),
                      enPercentage: fmtPct(data.totalInputTokensEn, data.totalInputTokens),
                      frCount: fmtTokens(data.totalInputTokensFr),
                      frPercentage: fmtPct(data.totalInputTokensFr, data.totalInputTokens),
                    },
                    {
                      metric: t('metrics.dashboard.tokens.contextInput'),
                      count: fmtTokens(data.totalContextInputTokens),
                      percentage: fmtPct(data.totalContextInputTokens, data.totalInputTokens),
                      enCount: fmtTokens(data.totalContextInputTokensEn),
                      enPercentage: fmtPct(data.totalContextInputTokensEn, data.totalInputTokensEn),
                      frCount: fmtTokens(data.totalContextInputTokensFr),
                      frPercentage: fmtPct(data.totalContextInputTokensFr, data.totalInputTokensFr),
                    },
                    {
                      metric: t('metrics.dashboard.tokens.answerInput'),
                      count: fmtTokens(data.totalAnswerInputTokens),
                      percentage: fmtPct(data.totalAnswerInputTokens, data.totalInputTokens),
                      enCount: fmtTokens(data.totalAnswerInputTokensEn),
                      enPercentage: fmtPct(data.totalAnswerInputTokensEn, data.totalInputTokensEn),
                      frCount: fmtTokens(data.totalAnswerInputTokensFr),
                      frPercentage: fmtPct(data.totalAnswerInputTokensFr, data.totalInputTokensFr),
                    },
                    {
                      metric: t('metrics.dashboard.tokens.totalOutput'),
                      count: fmtTokens(data.totalOutputTokens),
                      percentage: formatPercent(100, lang),
                      enCount: fmtTokens(data.totalOutputTokensEn),
                      enPercentage: fmtPct(data.totalOutputTokensEn, data.totalOutputTokens),
                      frCount: fmtTokens(data.totalOutputTokensFr),
                      frPercentage: fmtPct(data.totalOutputTokensFr, data.totalOutputTokens),
                    },
                    {
                      metric: t('metrics.dashboard.tokens.contextOutput'),
                      count: fmtTokens(data.totalContextOutputTokens),
                      percentage: fmtPct(data.totalContextOutputTokens, data.totalOutputTokens),
                      enCount: fmtTokens(data.totalContextOutputTokensEn),
                      enPercentage: fmtPct(data.totalContextOutputTokensEn, data.totalOutputTokensEn),
                      frCount: fmtTokens(data.totalContextOutputTokensFr),
                      frPercentage: fmtPct(data.totalContextOutputTokensFr, data.totalOutputTokensFr),
                    },
                    {
                      metric: t('metrics.dashboard.tokens.answerOutput'),
                      count: fmtTokens(data.totalAnswerOutputTokens),
                      percentage: fmtPct(data.totalAnswerOutputTokens, data.totalOutputTokens),
                      enCount: fmtTokens(data.totalAnswerOutputTokensEn),
                      enPercentage: fmtPct(data.totalAnswerOutputTokensEn, data.totalOutputTokensEn),
                      frCount: fmtTokens(data.totalAnswerOutputTokensFr),
                      frPercentage: fmtPct(data.totalAnswerOutputTokensFr, data.totalOutputTokensFr),
                    },
                    {
                      metric: t('metrics.dashboard.tokens.googleSearches'),
                      count: fmtNum(data.totalGoogleSearches),
                      percentage: fmtPct(data.totalGoogleSearches, data.totalQuestions),
                      enCount: '-',
                      enPercentage: '-',
                      frCount: '-',
                      frPercentage: '-',
                    },
                  ]}
                  columns={[
                    { title: t('metrics.dashboard.metric'), data: 'metric' },
                    { title: `${t('metrics.dashboard.count')} (K)`, data: 'count' },
                    { title: t('metrics.dashboard.percentage'), data: 'percentage' },
                    { title: `${t('metrics.dashboard.enCount')} (K)`, data: 'enCount' },
                    { title: t('metrics.dashboard.enPercentage'), data: 'enPercentage' },
                    { title: `${t('metrics.dashboard.frCount')} (K)`, data: 'frCount' },
                    { title: t('metrics.dashboard.frPercentage'), data: 'frPercentage' },
                  ]}
                  options={{
                    paging: false,
                    searching: false,
                    // scope="col" on headers (WCAG 1.3.1) - DataTables doesn't set it.
                    initComplete: function () { setColumnHeaderScope(this.api()); },
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display zebra-stable-on-hover',
                    language: dataTableLanguage(lang),
                  }}
                >
                  <caption className="sr-only">{t('metrics.dashboard.tokens.title')}</caption>
                </DataTable>
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

export default TechnicalMetricsDashboard;
