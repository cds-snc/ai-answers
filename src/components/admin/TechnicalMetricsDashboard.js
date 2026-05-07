import React from 'react';
import { GcdsContainer } from '@cdssnc/gcds-components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../../hooks/useTranslations.js';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';
import FilterPanel from './FilterPanel.js';
import { useTechnicalMetrics } from '../../hooks/admin/useTechnicalMetrics.js';

DataTable.use(DT);

const TechnicalMetricsDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const {
    data,
    errorState,
    handleApplyFilters,
    handleClearFilters,
    hasStartedLoading,
    loadingState,
  } = useTechnicalMetrics();

  const fmtNum = (n) => (n ?? 0).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA');
  const fmtMs = (n) => (n == null ? '–' : fmtNum(n));
  const fmtTokens = (n) => fmtNum(Math.round((n ?? 0) / 1000)) + 'K';
  const fmtPct = (num, denom) => (denom ? `${Math.round((num / denom) * 100)}%` : '0%');

  const SectionWrapper = ({ children, isLoading, title, error, note }) => (
    <div className="mb-600 relative">
      <div>
        {title && <h3 className="mb-300">{title}</h3>}
        {note && <p className="font-size-text-small mb-300">{note}</p>}
        {isLoading && (
          <div className="section-loading-indicator" role="status" aria-live="polite">
            <div className="loading-animation" aria-hidden="true"></div>
            <span>{t('common.loading')}</span>
          </div>
        )}
        {error && !isLoading && (
          <div className="flex items-center gap-2 mb-2 text-sm text-red-600 bg-red-50 p-2 rounded">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </div>
        )}
        <div className={`transition-opacity duration-200 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );

  const renderMaxChatId = (chatId) => {
    if (!chatId) return '–';
    const href = `/${lang}?chat=${encodeURIComponent(chatId)}&review=1`;
    return `<a href="${href}">${chatId}</a>`;
  };

  return (
    <GcdsContainer size="xl" className="space-y-6">
      <FilterPanel
        lang={lang}
        onApplyFilters={handleApplyFilters}
        onClearFilters={handleClearFilters}
        isVisible={true}
        defaultUserType="public"
      />

      {hasStartedLoading && (
        <GcdsContainer size="xl" className="bg-white shadow rounded-lg mb-600">
          <div className="p-4">
            <h2 className="mt-400 mb-400">{t('technicalMetrics.dashboard.title')}</h2>

            <SectionWrapper
              isLoading={loadingState.technical}
              error={errorState.technical}
              title={t('technicalMetrics.dashboard.responseTime.title')}
              note={t('technicalMetrics.dashboard.responseTime.note')}
            >
              <div className="bg-gray-50 p-4 rounded-lg">
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
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display',
                    language: dataTableLanguage(lang),
                  }}
                />
              </div>
            </SectionWrapper>

            <SectionWrapper
              isLoading={loadingState.technical}
              error={errorState.technical}
              title={t('technicalMetrics.dashboard.tools.title')}
              note={t('technicalMetrics.dashboard.tools.note')}
            >
              <div className="bg-gray-50 p-4 rounded-lg">
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
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display',
                    language: dataTableLanguage(lang),
                  }}
                />
              </div>
            </SectionWrapper>

            <SectionWrapper
              isLoading={loadingState.usage}
              error={errorState.usage}
              title={t('metrics.dashboard.tokens.title')}
              note={t('metrics.dashboard.tokens.note')}
            >
              <div className="bg-gray-50 p-4 rounded-lg">
                <DataTable
                  data={[
                    {
                      metric: t('metrics.dashboard.tokens.totalInput'),
                      count: fmtTokens(data.totalInputTokens),
                      percentage: '100%',
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
                      percentage: '100%',
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
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display',
                    language: dataTableLanguage(lang),
                  }}
                />
              </div>
            </SectionWrapper>
          </div>
        </GcdsContainer>
      )}
    </GcdsContainer>
  );
};

export default TechnicalMetricsDashboard;
