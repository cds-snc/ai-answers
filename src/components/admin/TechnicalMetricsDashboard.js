import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GcdsContainer } from '@cdssnc/gcds-components-react';
import '../../styles/App.css';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../../hooks/useTranslations.js';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';
import FilterPanel from './FilterPanel.js';
import MetricsService from '../../services/MetricsService.js';
import { getPath } from '../../utils/routes.js';

DataTable.use(DT);

const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString()
  };
};

const initialState = {
  // From metrics-technical
  responseTime: { count: 0, median: 0, p90: 0, p95: 0, max: 0, maxChatId: '' },
  downloadWebPage: [],
  // From metrics-usage (tokens only)
  totalInputTokens: 0,
  totalInputTokensEn: 0,
  totalInputTokensFr: 0,
  totalOutputTokens: 0,
  totalOutputTokensEn: 0,
  totalOutputTokensFr: 0,
  totalContextInputTokens: 0,
  totalContextInputTokensEn: 0,
  totalContextInputTokensFr: 0,
  totalAnswerInputTokens: 0,
  totalAnswerInputTokensEn: 0,
  totalAnswerInputTokensFr: 0,
  totalContextOutputTokens: 0,
  totalContextOutputTokensEn: 0,
  totalContextOutputTokensFr: 0,
  totalAnswerOutputTokens: 0,
  totalAnswerOutputTokensEn: 0,
  totalAnswerOutputTokensFr: 0,
  totalGoogleSearches: 0,
  totalQuestions: 0
};

const TechnicalMetricsDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [data, setData] = useState(initialState);
  const [loadingState, setLoadingState] = useState({ technical: false, usage: false });
  const [errorState, setErrorState] = useState({ technical: null, usage: null });

  const abortControllerRef = useRef(null);
  const [hasStartedLoading, setHasStartedLoading] = useState(false);

  const updateLoading = useCallback((key, isLoading) => {
    setLoadingState(prev => ({ ...prev, [key]: isLoading }));
  }, []);

  const updateError = useCallback((key, error) => {
    setErrorState(prev => ({ ...prev, [key]: error }));
  }, []);

  const fetchAll = useCallback(async (filters = null) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    const f = filters || getDefaultDateRange();
    setHasStartedLoading(true);

    setErrorState({ technical: null, usage: null });

    const fetchSection = async (key, fetchFn) => {
      updateLoading(key, true);
      updateError(key, null);
      try {
        const result = await fetchFn(f, signal);
        if (!signal.aborted) {
          setData(prev => ({ ...prev, ...result }));
        }
      } catch (err) {
        if (!signal.aborted) {
          console.error(`${key} fetch error`, err);
          updateError(key, err.message || 'Failed to load data');
        }
      } finally {
        if (!signal.aborted) {
          updateLoading(key, false);
        }
      }
    };

    fetchSection('technical', MetricsService.getTechnicalMetrics.bind(MetricsService));
    fetchSection('usage', MetricsService.getUsageMetrics.bind(MetricsService));
  }, [updateLoading, updateError]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleApplyFilters = (filters) => fetchAll(filters);
  const handleClearFilters = (defaultFilters) => fetchAll(defaultFilters || { ...getDefaultDateRange(), userType: 'public' });

  const fmtNum = (n) => (n ?? 0).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA');
  const fmtMs = (n) => (n == null ? '–' : fmtNum(n));
  const fmtTokens = (n) => fmtNum(Math.round((n ?? 0) / 1000)) + 'K';
  const fmtPct = (num, denom) => denom ? Math.round((num / denom) * 100) + '%' : '0%';

  const SectionWrapper = ({ children, isLoading, title, error, note }) => (
    <div className="mb-600 relative">
      <div>
        {title && <h3 className="mb-300">{title}</h3>}
        {note && <p className="font-size-text-small mb-300">{note}</p>}
        {isLoading && (
          <div className="section-loading-indicator" role="status" aria-live="polite">
            <div className="loading-animation" aria-hidden="true"></div>
            <span>{t('common.loading', 'Loading...')}</span>
          </div>
        )}
        {error && !isLoading && (
          <div className="flex items-center gap-2 mb-2 text-sm text-red-600 bg-red-50 p-2 rounded">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
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

  const renderMaxChatId = (data) => {
    if (!data) return '–';
    const href = `${getPath('chat-viewer', lang)}?chatId=${encodeURIComponent(data)}`;
    return `<a href="${href}">${data}</a>`;
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

            {/* Response time */}
            <SectionWrapper
              isLoading={loadingState.technical}
              error={errorState.technical}
              title={t('technicalMetrics.dashboard.responseTime.title')}
              note={t('technicalMetrics.dashboard.responseTime.note')}
            >
              <div className="bg-gray-50 p-4 rounded-lg">
                <DataTable
                  data={[{
                    metric: t('technicalMetrics.dashboard.responseTime.totalLabel'),
                    count: fmtNum(data.responseTime.count),
                    median: fmtMs(data.responseTime.median),
                    p90: fmtMs(data.responseTime.p90),
                    p95: fmtMs(data.responseTime.p95),
                    max: fmtMs(data.responseTime.max),
                    maxChatId: data.responseTime.maxChatId
                  }]}
                  columns={[
                    { title: t('technicalMetrics.dashboard.metric'), data: 'metric' },
                    { title: t('technicalMetrics.dashboard.responseTime.count'), data: 'count' },
                    { title: t('technicalMetrics.dashboard.responseTime.median'), data: 'median' },
                    { title: t('technicalMetrics.dashboard.responseTime.p90'), data: 'p90' },
                    { title: t('technicalMetrics.dashboard.responseTime.p95'), data: 'p95' },
                    { title: t('technicalMetrics.dashboard.responseTime.max'), data: 'max' },
                    { title: t('technicalMetrics.dashboard.responseTime.maxChatId'), data: 'maxChatId', render: renderMaxChatId }
                  ]}
                  options={{ paging: false, searching: false, ordering: false, info: false, stripe: true, className: 'display', language: dataTableLanguage(lang) }}
                />
              </div>
            </SectionWrapper>

            {/* downloadWebPage by call position */}
            <SectionWrapper
              isLoading={loadingState.technical}
              error={errorState.technical}
              title={t('technicalMetrics.dashboard.tools.title')}
              note={t('technicalMetrics.dashboard.tools.note')}
            >
              <div className="bg-gray-50 p-4 rounded-lg">
                <DataTable
                  data={data.downloadWebPage.map(row => ({
                    callNumber: row.callNumber,
                    totalCount: fmtNum(row.totalCount),
                    completedCount: fmtNum(row.completedCount),
                    errorCount: fmtNum(row.errorCount),
                    errorPercent: fmtPct(row.errorCount, row.totalCount),
                    median: fmtMs(row.median),
                    p95: fmtMs(row.p95)
                  }))}
                  columns={[
                    { title: t('technicalMetrics.dashboard.tools.callNumber'), data: 'callNumber' },
                    { title: t('technicalMetrics.dashboard.tools.totalCount'), data: 'totalCount' },
                    { title: t('technicalMetrics.dashboard.tools.completedCount'), data: 'completedCount' },
                    { title: t('technicalMetrics.dashboard.tools.errorCount'), data: 'errorCount' },
                    { title: t('technicalMetrics.dashboard.tools.errorPercent'), data: 'errorPercent' },
                    { title: t('technicalMetrics.dashboard.tools.median'), data: 'median' },
                    { title: t('technicalMetrics.dashboard.tools.p95'), data: 'p95' }
                  ]}
                  options={{ paging: false, searching: false, ordering: false, info: false, stripe: true, className: 'display', language: dataTableLanguage(lang) }}
                />
              </div>
            </SectionWrapper>

            {/* Tokens (moved from Performance metrics) */}
            <SectionWrapper
              isLoading={loadingState.usage}
              error={errorState.usage}
              title={t('metrics.dashboard.tokens.title')}
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
                      frPercentage: fmtPct(data.totalInputTokensFr, data.totalInputTokens)
                    },
                    {
                      metric: t('metrics.dashboard.tokens.contextInput'),
                      count: fmtTokens(data.totalContextInputTokens),
                      percentage: fmtPct(data.totalContextInputTokens, data.totalInputTokens),
                      enCount: fmtTokens(data.totalContextInputTokensEn),
                      enPercentage: fmtPct(data.totalContextInputTokensEn, data.totalInputTokensEn),
                      frCount: fmtTokens(data.totalContextInputTokensFr),
                      frPercentage: fmtPct(data.totalContextInputTokensFr, data.totalInputTokensFr)
                    },
                    {
                      metric: t('metrics.dashboard.tokens.answerInput'),
                      count: fmtTokens(data.totalAnswerInputTokens),
                      percentage: fmtPct(data.totalAnswerInputTokens, data.totalInputTokens),
                      enCount: fmtTokens(data.totalAnswerInputTokensEn),
                      enPercentage: fmtPct(data.totalAnswerInputTokensEn, data.totalInputTokensEn),
                      frCount: fmtTokens(data.totalAnswerInputTokensFr),
                      frPercentage: fmtPct(data.totalAnswerInputTokensFr, data.totalInputTokensFr)
                    },
                    {
                      metric: t('metrics.dashboard.tokens.totalOutput'),
                      count: fmtTokens(data.totalOutputTokens),
                      percentage: '100%',
                      enCount: fmtTokens(data.totalOutputTokensEn),
                      enPercentage: fmtPct(data.totalOutputTokensEn, data.totalOutputTokens),
                      frCount: fmtTokens(data.totalOutputTokensFr),
                      frPercentage: fmtPct(data.totalOutputTokensFr, data.totalOutputTokens)
                    },
                    {
                      metric: t('metrics.dashboard.tokens.contextOutput'),
                      count: fmtTokens(data.totalContextOutputTokens),
                      percentage: fmtPct(data.totalContextOutputTokens, data.totalOutputTokens),
                      enCount: fmtTokens(data.totalContextOutputTokensEn),
                      enPercentage: fmtPct(data.totalContextOutputTokensEn, data.totalOutputTokensEn),
                      frCount: fmtTokens(data.totalContextOutputTokensFr),
                      frPercentage: fmtPct(data.totalContextOutputTokensFr, data.totalOutputTokensFr)
                    },
                    {
                      metric: t('metrics.dashboard.tokens.answerOutput'),
                      count: fmtTokens(data.totalAnswerOutputTokens),
                      percentage: fmtPct(data.totalAnswerOutputTokens, data.totalOutputTokens),
                      enCount: fmtTokens(data.totalAnswerOutputTokensEn),
                      enPercentage: fmtPct(data.totalAnswerOutputTokensEn, data.totalOutputTokensEn),
                      frCount: fmtTokens(data.totalAnswerOutputTokensFr),
                      frPercentage: fmtPct(data.totalAnswerOutputTokensFr, data.totalOutputTokensFr)
                    },
                    {
                      metric: t('metrics.dashboard.tokens.googleSearches'),
                      count: fmtNum(data.totalGoogleSearches),
                      percentage: fmtPct(data.totalGoogleSearches, data.totalQuestions),
                      enCount: '-',
                      enPercentage: '-',
                      frCount: '-',
                      frPercentage: '-'
                    }
                  ]}
                  columns={[
                    { title: t('metrics.dashboard.metric'), data: 'metric' },
                    { title: t('metrics.dashboard.count') + ' (K)', data: 'count' },
                    { title: t('metrics.dashboard.percentage'), data: 'percentage' },
                    { title: t('metrics.dashboard.enCount') + ' (K)', data: 'enCount' },
                    { title: t('metrics.dashboard.enPercentage'), data: 'enPercentage' },
                    { title: t('metrics.dashboard.frCount') + ' (K)', data: 'frCount' },
                    { title: t('metrics.dashboard.frPercentage'), data: 'frPercentage' }
                  ]}
                  options={{ paging: false, searching: false, ordering: false, info: false, stripe: true, className: 'display', language: dataTableLanguage(lang) }}
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
