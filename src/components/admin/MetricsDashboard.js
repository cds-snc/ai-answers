import React, { useState } from 'react';
import { GcdsButton, GcdsContainer, GcdsText } from '@cdssnc/gcds-components-react';
import '../../styles/App.css';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../../hooks/useTranslations.js';
// Removed unused Recharts imports
import EndUserFeedbackSection from '../metrics/EndUserFeedbackSection.js';
import FilterPanelV2 from './FilterPanelV2.js';
import MetricsService from '../../services/MetricsService.js';

DataTable.use(DT);

const MetricsDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const fetchMetrics = async (filters = null) => {
    setLoading(true);
    setMetrics([]);
    setTotalCount(0);
    let allLogs = [];
    let lastId = null;
    const limit = 500;
    try {
      do {
        const data = await MetricsService.getChatLogs(filters || {}, limit, lastId);
        if (data.success) {
          const logsChunk = data.logs || [];
          allLogs = allLogs.concat(logsChunk);
          setTotalCount(allLogs.length);
          lastId = data.lastId || null; 
        } else {
          throw new Error(data.error || 'Failed to fetch metrics');
        }
      } while (lastId);
      const metricsResult = MetricsService.calculateMetrics(allLogs);
      setMetrics(metricsResult || []);
      setHasLoadedData(true);
    } catch (error) {
      console.error('Error fetching metrics:', error);
      alert(`Failed to fetch metrics: ${error.message}`);
    }
    setLoading(false);
  };

  const handleApplyFilters = (filters) => {
    fetchMetrics(filters);
  };

  const handleClearFilters = () => {
    const today = new Date();
    const todayFilters = {
      startDate: today,
      endDate: today
    };
    fetchMetrics(todayFilters);
  };

  return (
    <GcdsContainer size="xl" className="space-y-6">
      {loading && (
        <div className="loading-indicator">
          Loading metrics: {totalCount} total records
        </div>
      )}

      <FilterPanelV2
        onApplyFilters={handleApplyFilters}
        onClearFilters={handleClearFilters}
        isVisible={true}
        storageKey="metricsDashboard_filters_v2"
      />

      {hasLoadedData && (
        <GcdsContainer size="xl" className="bg-white shadow rounded-lg mb-600">
          {loading ? (
            <div className="p-4">
              <GcdsText>Loading metrics...</GcdsText>
            </div>
          ) : metrics.totalSessions > 0 ? (
            <div className="p-4">
              <h2 className="mt-400 mb-400">{t('metrics.dashboard.title')}</h2>
              <div>
                <h3 className="mb-300">{t('metrics.dashboard.usageMetrics')}</h3>
                <div className="bg-gray-50 p-4 rounded-lg mb-600">
                  {/* TODO: Add a department filter */}
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
              </div>
              <div>
                <div className="mb-600">
                  <h3 className="mb-300">{t('metrics.dashboard.expertScored.title')}</h3>
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
                </div>
                <div className="mb-600">
                  <h3 className="mb-300">{t('metrics.dashboard.aiScored.title')}</h3>
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
                </div>
              </div>
          

              <EndUserFeedbackSection t={t} metrics={metrics} />
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
            </div>
          ) : (
            <div className="p-4">
              <GcdsText>No metrics found for the selected time range.</GcdsText>
            </div>
          )}
        </GcdsContainer>
      )}
    </GcdsContainer>
  );
};

export default MetricsDashboard;
