import React from 'react';
import { GcdsText } from '@cdssnc/gcds-components-react';
import DataTable from 'datatables.net-react';
import { Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// Accessible color palette for pie charts (WCAG AA compliant)
const CHART_COLORS = [
  "#1976D2", // Medium blue
  "#AD1457", // Magenta
  "#26A69A", // Medium teal
  "#E65100", // Dark orange
  "#7B1FA2", // Dark purple
  "#F9A825", // Dark amber
  "#388E3C"  // Green
];

// Score-to-key mapping (matches PublicFeedbackComponent.js)
const SCORE_TO_KEY = {
  1: 'noCall',
  2: 'noVisit',
  3: 'savedTime',
  4: 'other',
  5: 'notWanted',
  6: 'other',
  7: 'notDetailed',
  8: 'confusing',
  9: 'irrelevant'
};

// Helper to get translation label for a reason key in the current language
const getReasonLabel = (reasonKey, t, isPositive) => {
  if (isPositive) {
    return t(`homepage.publicFeedback.yes.options.${reasonKey}`) || reasonKey;
  } else {
    return t(`homepage.publicFeedback.no.options.${reasonKey}`) || reasonKey;
  }
};

const EndUserFeedbackSection = ({ t, metrics }) => {
  // --- First table (en/fr counts) remains unchanged ---

  // Pie charts and lower table use already-combined counts and translations
  const yesReasons = metrics.publicFeedbackReasons?.yes || {};
  const noReasons = metrics.publicFeedbackReasons?.no || {};


  // Helper to group counts by key (handles scores from backend)
 const groupByKey = (reasons) => {
  const grouped = {};
  
  Object.entries(reasons).forEach(([reason, count]) => {
    const score = parseInt(reason, 10);
    const key = SCORE_TO_KEY[score];
    
    // Only process valid scores
    if (key) {
      if (!grouped[key]) grouped[key] = 0;
      grouped[key] += count;
    }
  });
    return grouped;  
};  
  // Grouped counts for table and pie charts (by translation key)
  const yesGrouped = groupByKey(yesReasons);
  const noGrouped = groupByKey(noReasons);

  // Prepare data for pie charts (grouped by translation key, label in current language)
  const yesPieData = Object.entries(yesGrouped).map(([key, count]) => ({
    label: getReasonLabel(key, t, true),
    count,
  }));
  const noPieData = Object.entries(noGrouped).map(([key, count]) => ({
    label: getReasonLabel(key, t, false),
    count,
  }));

  // For the lower table, get all unique keys from both yes and no
  const allKeys = Array.from(new Set([
    ...Object.keys(yesGrouped),
    ...Object.keys(noGrouped)
  ]));

  // Table data: show label (in current language) and combined counts for yes/no
  const tableData = allKeys.map((key) => {
    const yesCount = yesGrouped[key] || 0;
    const noCount = noGrouped[key] || 0;
    return {
      label: getReasonLabel(key, t, yesCount >= noCount),
      helpful: yesCount,
      unhelpful: noCount,
      total: yesCount + noCount,
    };
  });

 
  return (
    <div className="mb-600">
      <h3 className="mb-300">{t('metrics.dashboard.userScored.title')}</h3>
      <GcdsText className="mb-300">{t('metrics.dashboard.userScored.description')}</GcdsText>
      <div className="bg-gray-50 p-4 rounded-lg">
        {/* Totals Table (unchanged) */}
        <DataTable
          data={[
            {
              metric: t('metrics.dashboard.userScored.total'),
              count: metrics.publicFeedbackTotals.totalQuestionsWithFeedback,
              percentage: '100%',
              enCount: metrics.publicFeedbackTotals.enYes + metrics.publicFeedbackTotals.enNo,
              enPercentage: '100%',
              frCount: metrics.publicFeedbackTotals.frYes + metrics.publicFeedbackTotals.frNo,
              frPercentage: '100%'
            },
            {
              metric: t('metrics.dashboard.userScored.helpful'),
              count: metrics.publicFeedbackTotals.yes,
              percentage: metrics.publicFeedbackTotals.totalQuestionsWithFeedback ? Math.round((metrics.publicFeedbackTotals.yes / metrics.publicFeedbackTotals.totalQuestionsWithFeedback) * 100) + '%' : '0%',
              enCount: metrics.publicFeedbackTotals.enYes,
              enPercentage: metrics.publicFeedbackTotals.totalQuestionsWithFeedback ? Math.round((metrics.publicFeedbackTotals.enYes / metrics.publicFeedbackTotals.totalQuestionsWithFeedback) * 100) + '%' : '0%',
              frCount: metrics.publicFeedbackTotals.frYes,
              frPercentage: metrics.publicFeedbackTotals.totalQuestionsWithFeedback ? Math.round((metrics.publicFeedbackTotals.frYes / metrics.publicFeedbackTotals.totalQuestionsWithFeedback) * 100) + '%' : '0%'
            },
            {
              metric: t('metrics.dashboard.userScored.unhelpful'),
              count: metrics.publicFeedbackTotals.no,
              percentage: metrics.publicFeedbackTotals.totalQuestionsWithFeedback ? Math.round((metrics.publicFeedbackTotals.no / metrics.publicFeedbackTotals.totalQuestionsWithFeedback) * 100) + '%' : '0%',
              enCount: metrics.publicFeedbackTotals.enNo,
              enPercentage: metrics.publicFeedbackTotals.totalQuestionsWithFeedback ? Math.round((metrics.publicFeedbackTotals.enNo / metrics.publicFeedbackTotals.totalQuestionsWithFeedback) * 100) + '%' : '0%',
              frCount: metrics.publicFeedbackTotals.frNo,
              frPercentage: metrics.publicFeedbackTotals.totalQuestionsWithFeedback ? Math.round((metrics.publicFeedbackTotals.frNo / metrics.publicFeedbackTotals.totalQuestionsWithFeedback) * 100) + '%' : '0%'
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
            info: false
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginTop: '2rem' }}>
          {/* Pie chart for YES (helpful) reasons */}
          <div style={{ flex: 1, minWidth: 300, height: 300 }}>
          <h4>{t('metrics.dashboard.userScored.helpful')} - {t('metrics.dashboard.userScored.reasonBreakdown')}</h4>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={yesPieData.map(({ label, count }) => ({ name: label, value: count }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {yesPieData.map((entry, idx) => (
                    <Cell key={`cell-yes-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Pie chart for NO (unhelpful) reasons */}
          <div style={{ flex: 1, minWidth: 300, height: 300 }}>
            <h4>{t('metrics.dashboard.userScored.unhelpful')} - {t('metrics.dashboard.userScored.reasonBreakdown')}</h4>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={noPieData.map(({ label, count }) => ({ name: label, value: count }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {noPieData.map((entry, idx) => (
                    <Cell key={`cell-no-${idx}`} fill={CHART_COLORS[(idx + 3) % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/* Add margin below pie charts to separate from the next section */}
        <div style={{ height: '2rem' }} />
        {/* Table for public feedback reasons breakdown by language */}
        <div style={{ marginTop: '2rem' }}>
          <h4>{t('metrics.dashboard.userScored.reasonTableTitle') || 'Public Feedback Reasons Breakdown'}</h4>
          <DataTable
            data={tableData.filter(row => row.total > 0)}
            columns={[
              { title: t('metrics.dashboard.userScored.reason'), data: 'label' },
              { title: t('metrics.dashboard.userScored.helpful'), data: 'helpful' },
              { title: t('metrics.dashboard.userScored.unhelpful'), data: 'unhelpful' },
              { title: t('metrics.dashboard.count'), data: 'total' }
            ]}
            options={{
              paging: false,
              searching: false,
              ordering: false,
              info: false
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default EndUserFeedbackSection;
