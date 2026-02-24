import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GcdsContainer, GcdsText } from '@cdssnc/gcds-components-react';
import '../../styles/App.css';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../../hooks/useTranslations.js';
import EndUserFeedbackSection from '../metrics/EndUserFeedbackSection.js';
import FilterPanel from './FilterPanel.js';
import MetricsService from '../../services/MetricsService.js';

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
  totalInputTokens: 0,
  totalInputTokensEn: 0,
  totalInputTokensFr: 0,
  totalOutputTokens: 0,
  totalOutputTokensEn: 0,
  totalOutputTokensFr: 0,
  totalGoogleSearches: 0,
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
    harmful: { total: 0, en: 0, fr: 0 }
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
          updateError(key, err.message || 'Failed to load data');
        }
      } finally {
        if (!signal.aborted) {
          updateLoading(key, false);
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

  const handleApplyFilters = (filters) => {
    fetchMetrics(filters);
  };

  const handleClearFilters = () => {
    fetchMetrics(getDefaultDateRange());
  };



  // Helper for Section Wrapper to handle relative positioning for overlay
  const SectionWrapper = ({ children, isLoading, title, error }) => (
    <div className="mb-600 relative">
      <div>
        {title && <h3 className="mb-300">{title}</h3>}
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

  return (
    <GcdsContainer size="xl" className="space-y-6">
      <FilterPanel
        lang={lang}
        onApplyFilters={handleApplyFilters}
        onClearFilters={handleClearFilters}
        isVisible={true}
      />

      {hasStartedLoading && (
        <GcdsContainer size="xl" className="bg-white shadow rounded-lg mb-600">

          <div className="p-4">
            <h2 className="mt-400 mb-400">{t('metrics.dashboard.title')}</h2>

            {/* Usage Metrics Section */}
            <SectionWrapper isLoading={loadingState.usage} title={t('metrics.dashboard.usageMetrics')} error={errorState.usage}>
              <div className="bg-gray-50 p-4 rounded-lg">
                <DataTable
                  data={[
                    {
                      metric: t('metrics.dashboard.totalSessions'),
                      count: metrics.totalConversations,
                      percentage: '100%',
                      enCount: metrics.totalConversationsEn,
                      enPercentage: metrics.totalConversations ? Math.round((metrics.totalConversationsEn / metrics.totalConversations) * 100) + '%' : '0%',
                      frCount: metrics.totalConversationsFr,
                      frPercentage: metrics.totalConversations ? Math.round((metrics.totalConversationsFr / metrics.totalConversations) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.sessionsByQuestionCount.singleQuestion'),
                      count: metrics.sessionsByQuestionCount.singleQuestion.total,
                      percentage: metrics.totalConversations ? Math.round((metrics.sessionsByQuestionCount.singleQuestion.total / metrics.totalConversations) * 100) + '%' : '0%',
                      enCount: metrics.sessionsByQuestionCount.singleQuestion.en,
                      enPercentage: metrics.totalConversations ? Math.round((metrics.sessionsByQuestionCount.singleQuestion.en / metrics.totalConversations) * 100) + '%' : '0%',
                      frCount: metrics.sessionsByQuestionCount.singleQuestion.fr,
                      frPercentage: metrics.totalConversations ? Math.round((metrics.sessionsByQuestionCount.singleQuestion.fr / metrics.totalConversations) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.sessionsByQuestionCount.twoQuestions'),
                      count: metrics.sessionsByQuestionCount.twoQuestions.total,
                      percentage: metrics.totalConversations ? Math.round((metrics.sessionsByQuestionCount.twoQuestions.total / metrics.totalConversations) * 100) + '%' : '0%',
                      enCount: metrics.sessionsByQuestionCount.twoQuestions.en,
                      enPercentage: metrics.totalConversations ? Math.round((metrics.sessionsByQuestionCount.twoQuestions.en / metrics.totalConversations) * 100) + '%' : '0%',
                      frCount: metrics.sessionsByQuestionCount.twoQuestions.fr,
                      frPercentage: metrics.totalConversations ? Math.round((metrics.sessionsByQuestionCount.twoQuestions.fr / metrics.totalConversations) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.sessionsByQuestionCount.threeQuestions'),
                      count: metrics.sessionsByQuestionCount.threeQuestions.total,
                      percentage: metrics.totalConversations ? Math.round((metrics.sessionsByQuestionCount.threeQuestions.total / metrics.totalConversations) * 100) + '%' : '0%',
                      enCount: metrics.sessionsByQuestionCount.threeQuestions.en,
                      enPercentage: metrics.totalConversations ? Math.round((metrics.sessionsByQuestionCount.threeQuestions.en / metrics.totalConversations) * 100) + '%' : '0%',
                      frCount: metrics.sessionsByQuestionCount.threeQuestions.fr,
                      frPercentage: metrics.totalConversations ? Math.round((metrics.sessionsByQuestionCount.threeQuestions.fr / metrics.totalConversations) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.totalQuestions'),
                      count: metrics.totalQuestions,
                      percentage: metrics.totalConversations ? Math.round((metrics.totalQuestions / metrics.totalConversations) * 100) + '%' : '0%',
                      enCount: metrics.totalQuestionsEn,
                      enPercentage: metrics.totalQuestions ? Math.round((metrics.totalQuestionsEn / metrics.totalQuestions) * 100) + '%' : '0%',
                      frCount: metrics.totalQuestionsFr,
                      frPercentage: metrics.totalQuestions ? Math.round((metrics.totalQuestionsFr / metrics.totalQuestions) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.answerTypes.normal'),
                      count: metrics.answerTypes.normal.total,
                      percentage: metrics.totalQuestions ? Math.round((metrics.answerTypes.normal.total / metrics.totalQuestions) * 100) + '%' : '0%',
                      enCount: metrics.answerTypes.normal.en,
                      enPercentage: metrics.totalQuestions ? Math.round((metrics.answerTypes.normal.en / metrics.totalQuestions) * 100) + '%' : '0%',
                      frCount: metrics.answerTypes.normal.fr,
                      frPercentage: metrics.totalQuestions ? Math.round((metrics.answerTypes.normal.fr / metrics.totalQuestions) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.answerTypes.clarifyingQuestion'),
                      count: metrics.answerTypes['clarifying-question'].total,
                      percentage: metrics.totalQuestions ? Math.round((metrics.answerTypes['clarifying-question'].total / metrics.totalQuestions) * 100) + '%' : '0%',
                      enCount: metrics.answerTypes['clarifying-question'].en,
                      enPercentage: metrics.totalQuestions ? Math.round((metrics.answerTypes['clarifying-question'].en / metrics.totalQuestions) * 100) + '%' : '0%',
                      frCount: metrics.answerTypes['clarifying-question'].fr,
                      frPercentage: metrics.totalQuestions ? Math.round((metrics.answerTypes['clarifying-question'].fr / metrics.totalQuestions) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.answerTypes.ptMuni'),
                      count: metrics.answerTypes['pt-muni'].total,
                      percentage: metrics.totalQuestions ? Math.round((metrics.answerTypes['pt-muni'].total / metrics.totalQuestions) * 100) + '%' : '0%',
                      enCount: metrics.answerTypes['pt-muni'].en,
                      enPercentage: metrics.totalQuestions ? Math.round((metrics.answerTypes['pt-muni'].en / metrics.totalQuestions) * 100) + '%' : '0%',
                      frCount: metrics.answerTypes['pt-muni'].fr,
                      frPercentage: metrics.totalQuestions ? Math.round((metrics.answerTypes['pt-muni'].fr / metrics.totalQuestions) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.answerTypes.notGc'),
                      count: metrics.answerTypes['not-gc'].total,
                      percentage: metrics.totalQuestions ? Math.round((metrics.answerTypes['not-gc'].total / metrics.totalQuestions) * 100) + '%' : '0%',
                      enCount: metrics.answerTypes['not-gc'].en,
                      enPercentage: metrics.totalQuestions ? Math.round((metrics.answerTypes['not-gc'].en / metrics.totalQuestions) * 100) + '%' : '0%',
                      frCount: metrics.answerTypes['not-gc'].fr,
                      frPercentage: metrics.totalQuestions ? Math.round((metrics.answerTypes['not-gc'].fr / metrics.totalQuestions) * 100) + '%' : '0%'
                    },
                    {
                      metric: 'Google searches',
                      count: metrics.totalGoogleSearches,
                      percentage: metrics.totalConversations ? Math.round((metrics.totalGoogleSearches / metrics.totalConversations) * 100) + '%' : '0%',
                      enCount: '-',
                      enPercentage: '-',
                      frCount: '-',
                      frPercentage: '-'
                    },
                    {
                      metric: t('metrics.dashboard.inputTokens'),
                      count: metrics.totalInputTokens,
                      percentage: '100%',
                      enCount: metrics.totalInputTokensEn,
                      enPercentage: metrics.totalInputTokens ? Math.round((metrics.totalInputTokensEn / metrics.totalInputTokens) * 100) + '%' : '0%',
                      frCount: metrics.totalInputTokensFr,
                      frPercentage: metrics.totalInputTokens ? Math.round((metrics.totalInputTokensFr / metrics.totalInputTokens) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.outputTokens'),
                      count: metrics.totalOutputTokens,
                      percentage: '100%',
                      enCount: metrics.totalOutputTokensEn,
                      enPercentage: metrics.totalOutputTokens ? Math.round((metrics.totalOutputTokensEn / metrics.totalOutputTokens) * 100) + '%' : '0%',
                      frCount: metrics.totalOutputTokensFr,
                      frPercentage: metrics.totalOutputTokens ? Math.round((metrics.totalOutputTokensFr / metrics.totalOutputTokens) * 100) + '%' : '0%'
                    }
                  ]}
                  columns={[
                    { title: t('metrics.dashboard.metric'), data: 'metric' },
                    { title: t('metrics.dashboard.count'), data: 'count' },
                    { title: t('metrics.dashboard.percentage'), data: 'percentage' },
                    { title: t('metrics.dashboard.enCount'), data: 'enCount' },
                    { title: t('metrics.dashboard.enPercentage'), data: 'enPercentage' },
                    { title: t('metrics.dashboard.frCount'), data: 'frCount' },
                    { title: t('metrics.dashboard.frPercentage'), data: 'frPercentage' }
                  ]}
                  options={{
                    paging: false,
                    searching: false,
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display'
                  }}
                />
              </div>
            </SectionWrapper>

            {/* Expert Scored Section */}
            <SectionWrapper isLoading={loadingState.expert} title={t('metrics.dashboard.expertScored.title')} error={errorState.expert}>
              <GcdsText className="mb-300">{t('metrics.dashboard.expertScored.description')}</GcdsText>
              <div className="bg-gray-50 p-4 rounded-lg">
                <DataTable
                  data={[
                    {
                      metric: t('metrics.dashboard.expertScored.total'),
                      count: metrics.expertScored.total.total,
                      percentage: '100%',
                      enCount: metrics.expertScored.total.en,
                      enPercentage: metrics.expertScored.total.total ? Math.round((metrics.expertScored.total.en / metrics.expertScored.total.total) * 100) + '%' : '0%',
                      frCount: metrics.expertScored.total.fr,
                      frPercentage: metrics.expertScored.total.total ? Math.round((metrics.expertScored.total.fr / metrics.expertScored.total.total) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.expertScored.correct'),
                      count: metrics.expertScored.correct.total,
                      percentage: metrics.expertScored.total.total ? Math.round((metrics.expertScored.correct.total / metrics.expertScored.total.total) * 100) + '%' : '0%',
                      enCount: metrics.expertScored.correct.en,
                      enPercentage: metrics.expertScored.total.en ? Math.round((metrics.expertScored.correct.en / metrics.expertScored.total.en) * 100) + '%' : '0%',
                      frCount: metrics.expertScored.correct.fr,
                      frPercentage: metrics.expertScored.total.fr ? Math.round((metrics.expertScored.correct.fr / metrics.expertScored.total.fr) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.expertScored.needsImprovement'),
                      count: metrics.expertScored.needsImprovement.total,
                      percentage: metrics.expertScored.total.total ? Math.round((metrics.expertScored.needsImprovement.total / metrics.expertScored.total.total) * 100) + '%' : '0%',
                      enCount: metrics.expertScored.needsImprovement.en,
                      enPercentage: metrics.expertScored.total.en ? Math.round((metrics.expertScored.needsImprovement.en / metrics.expertScored.total.en) * 100) + '%' : '0%',
                      frCount: metrics.expertScored.needsImprovement.fr,
                      frPercentage: metrics.expertScored.total.fr ? Math.round((metrics.expertScored.needsImprovement.fr / metrics.expertScored.total.fr) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.expertScored.hasError'),
                      count: metrics.expertScored.hasError.total,
                      percentage: metrics.expertScored.total.total ? Math.round((metrics.expertScored.hasError.total / metrics.expertScored.total.total) * 100) + '%' : '0%',
                      enCount: metrics.expertScored.hasError.en,
                      enPercentage: metrics.expertScored.total.en ? Math.round((metrics.expertScored.hasError.en / metrics.expertScored.total.en) * 100) + '%' : '0%',
                      frCount: metrics.expertScored.hasError.fr,
                      frPercentage: metrics.expertScored.total.fr ? Math.round((metrics.expertScored.hasError.fr / metrics.expertScored.total.fr) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.expertScored.hasCitationError'),
                      count: metrics.expertScored.hasCitationError.total,
                      percentage: metrics.expertScored.total.total ? Math.round((metrics.expertScored.hasCitationError.total / metrics.expertScored.total.total) * 100) + '%' : '0%',
                      enCount: metrics.expertScored.hasCitationError.en,
                      enPercentage: metrics.expertScored.total.en ? Math.round((metrics.expertScored.hasCitationError.en / metrics.expertScored.total.en) * 100) + '%' : '0%',
                      frCount: metrics.expertScored.hasCitationError.fr,
                      frPercentage: metrics.expertScored.total.fr ? Math.round((metrics.expertScored.hasCitationError.fr / metrics.expertScored.total.fr) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.expertScored.harmful'),
                      count: metrics.expertScored.harmful.total,
                      percentage: metrics.expertScored.total.total ? Math.round((metrics.expertScored.harmful.total / metrics.expertScored.total.total) * 100) + '%' : '0%',
                      enCount: metrics.expertScored.harmful.en,
                      enPercentage: metrics.expertScored.total.en ? Math.round((metrics.expertScored.harmful.en / metrics.expertScored.total.en) * 100) + '%' : '0%',
                      frCount: metrics.expertScored.harmful.fr,
                      frPercentage: metrics.expertScored.total.fr ? Math.round((metrics.expertScored.harmful.fr / metrics.expertScored.total.fr) * 100) + '%' : '0%'
                    }
                  ]}
                  columns={[
                    { title: t('metrics.dashboard.metric'), data: 'metric' },
                    { title: t('metrics.dashboard.count'), data: 'count' },
                    { title: t('metrics.dashboard.percentage'), data: 'percentage' },
                    { title: t('metrics.dashboard.enCount'), data: 'enCount' },
                    { title: t('metrics.dashboard.enPercentage'), data: 'enPercentage' },
                    { title: t('metrics.dashboard.frCount'), data: 'frCount' },
                    { title: t('metrics.dashboard.frPercentage'), data: 'frPercentage' }
                  ]}
                  options={{
                    paging: false,
                    searching: false,
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display'
                  }}
                />
              </div>
            </SectionWrapper>

            {/* AI Scored Section */}
            <SectionWrapper isLoading={loadingState.ai} title={t('metrics.dashboard.aiScored.title')} error={errorState.ai}>
              <GcdsText className="mb-300">{t('metrics.dashboard.aiScored.description')}</GcdsText>
              <div className="bg-gray-50 p-4 rounded-lg">
                <DataTable
                  data={[
                    {
                      metric: t('metrics.dashboard.aiScored.total'),
                      count: metrics.aiScored.total.total,
                      percentage: '100%',
                      enCount: metrics.aiScored.total.en,
                      enPercentage: metrics.aiScored.total.total ? Math.round((metrics.aiScored.total.en / metrics.aiScored.total.total) * 100) + '%' : '0%',
                      frCount: metrics.aiScored.total.fr,
                      frPercentage: metrics.aiScored.total.total ? Math.round((metrics.aiScored.total.fr / metrics.aiScored.total.total) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.aiScored.correct'),
                      count: metrics.aiScored.correct.total,
                      percentage: metrics.aiScored.total.total ? Math.round((metrics.aiScored.correct.total / metrics.aiScored.total.total) * 100) + '%' : '0%',
                      enCount: metrics.aiScored.correct.en,
                      enPercentage: metrics.aiScored.total.en ? Math.round((metrics.aiScored.correct.en / metrics.aiScored.total.en) * 100) + '%' : '0%',
                      frCount: metrics.aiScored.correct.fr,
                      frPercentage: metrics.aiScored.total.fr ? Math.round((metrics.aiScored.correct.fr / metrics.aiScored.total.fr) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.aiScored.needsImprovement'),
                      count: metrics.aiScored.needsImprovement.total,
                      percentage: metrics.aiScored.total.total ? Math.round((metrics.aiScored.needsImprovement.total / metrics.aiScored.total.total) * 100) + '%' : '0%',
                      enCount: metrics.aiScored.needsImprovement.en,
                      enPercentage: metrics.aiScored.total.en ? Math.round((metrics.aiScored.needsImprovement.en / metrics.aiScored.total.en) * 100) + '%' : '0%',
                      frCount: metrics.aiScored.needsImprovement.fr,
                      frPercentage: metrics.aiScored.total.fr ? Math.round((metrics.aiScored.needsImprovement.fr / metrics.aiScored.total.fr) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.aiScored.hasError'),
                      count: metrics.aiScored.hasError.total,
                      percentage: metrics.aiScored.total.total ? Math.round((metrics.aiScored.hasError.total / metrics.aiScored.total.total) * 100) + '%' : '0%',
                      enCount: metrics.aiScored.hasError.en,
                      enPercentage: metrics.aiScored.total.en ? Math.round((metrics.aiScored.hasError.en / metrics.aiScored.total.en) * 100) + '%' : '0%',
                      frCount: metrics.aiScored.hasError.fr,
                      frPercentage: metrics.aiScored.total.fr ? Math.round((metrics.aiScored.hasError.fr / metrics.aiScored.total.fr) * 100) + '%' : '0%'
                    },
                    {
                      metric: t('metrics.dashboard.aiScored.hasCitationError'),
                      count: metrics.aiScored.hasCitationError.total,
                      percentage: metrics.aiScored.total.total ? Math.round((metrics.aiScored.hasCitationError.total / metrics.aiScored.total.total) * 100) + '%' : '0%',
                      enCount: metrics.aiScored.hasCitationError.en,
                      enPercentage: metrics.aiScored.total.en ? Math.round((metrics.aiScored.hasCitationError.en / metrics.aiScored.total.en) * 100) + '%' : '0%',
                      frCount: metrics.aiScored.hasCitationError.fr,
                      frPercentage: metrics.aiScored.total.fr ? Math.round((metrics.aiScored.hasCitationError.fr / metrics.aiScored.total.fr) * 100) + '%' : '0%'
                    }
                  ]}
                  columns={[
                    { title: t('metrics.dashboard.metric'), data: 'metric' },
                    { title: t('metrics.dashboard.count'), data: 'count' },
                    { title: t('metrics.dashboard.percentage'), data: 'percentage' },
                    { title: t('metrics.dashboard.enCount'), data: 'enCount' },
                    { title: t('metrics.dashboard.enPercentage'), data: 'enPercentage' },
                    { title: t('metrics.dashboard.frCount'), data: 'frCount' },
                    { title: t('metrics.dashboard.frPercentage'), data: 'frPercentage' }
                  ]}
                  options={{
                    paging: false,
                    searching: false,
                    ordering: false,
                    info: false,
                    stripe: true,
                    className: 'display'
                  }}
                />
              </div>
            </SectionWrapper>


            <SectionWrapper isLoading={loadingState.publicFb} title={null} error={errorState.publicFb}>
              <EndUserFeedbackSection t={t} metrics={metrics} />
            </SectionWrapper>

            <SectionWrapper isLoading={loadingState.dept} title={null} error={errorState.dept}>
              <div className="bg-gray-50 p-4 rounded-lg mb-600">
                <h3 className="mb-300">{t('metrics.dashboard.byDepartment.title')}</h3>
                <DataTable
                  data={Object.entries(metrics.byDepartment).map(([department, data]) => ({
                    department,
                    totalQuestions: data.total,
                    expertScoredTotal: data.expertScored.total,
                    expertScoredCorrect: data.expertScored.correct,
                    expertScoredNeedsImprovement: data.expertScored.needsImprovement,
                    expertScoredHasError: data.expertScored.hasError,
                    expertScoredHasErrorPercent: data.expertScored.total ? Math.round((data.expertScored.hasError / data.expertScored.total) * 100) : 0
                  }))}
                  columns={[
                    { title: t('metrics.dashboard.byDepartment.department'), data: 'department' },
                    { title: t('metrics.dashboard.totalQuestions'), data: 'totalQuestions' },
                    { title: t('metrics.dashboard.expertScored.total'), data: 'expertScoredTotal' },
                    { title: t('metrics.dashboard.expertScored.correct'), data: 'expertScoredCorrect' },
                    { title: t('metrics.dashboard.expertScored.needsImprovement'), data: 'expertScoredNeedsImprovement' },
                    { title: t('metrics.dashboard.expertScored.hasError'), data: 'expertScoredHasError' },
                    { title: t('metrics.dashboard.expertScored.hasErrorPercent'), data: 'expertScoredHasErrorPercent' }
                  ]}
                  options={{
                    paging: true,
                    searching: true,
                    ordering: true,
                    info: true,
                    pageLength: 20,
                    stripe: true,
                    className: 'display'
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

export default MetricsDashboard;
