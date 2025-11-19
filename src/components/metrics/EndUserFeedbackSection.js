import React from 'react';
import { GcdsText } from '@cdssnc/gcds-components-react';
import DataTable from 'datatables.net-react';
import { Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';



// --- Reverse lookup for public feedback reason keys ---
// These should match the ids used in PublicFeedbackComponent.js
// Removed unused YES_REASON_KEYS and NO_REASON_KEYS

// English and French translations for each key (from en.json and fr.json)
const YES_REASON_LABELS = {
  noCall: [
    "I don't need to call the government",
    "Je n'ai pas besoin d'appeler le gouvernement"
  ],
  noVisit: [
    "I don't need to visit an office",
    "Je n'ai pas besoin de me rendre dans un bureau"
  ],
  savedTime: [
    "Saved me time searching and reading",
    "J'ai gagné du temps en cherchant et en lisant"
  ],
  other: [
    "Other - please fill out the survey",
    "Autre - veuillez remplir l'enquête"
  ]
};
const NO_REASON_LABELS = {
  irrelevant: [
    "Irrelevant or off topic",
    "Non pertinent ou hors sujet"
  ],
  confusing: [
    "Too complex or confusing",
    "Trop complexe ou déroutant"
  ],
  notDetailed: [
    "Not detailed enough",
    "Pas assez détaillé"
  ],
  notWanted: [
    "Answer is clear, but is not what I wanted to hear",
    "La réponse est claire, mais ce n'est pas ce que je voulais entendre"
  ],
  other: [
    "Other - please fill out the survey",
    "Autre - veuillez remplir l'enquête"
  ]
};

// Build a map from label (in any language) to key
const buildLabelToKeyMap = (labelsObj) => {
  const map = {};
  Object.entries(labelsObj).forEach(([key, arr]) => {
    arr.forEach(label => {
      map[label] = key;
    });
  });
  return map;
};
const YES_LABEL_TO_KEY = buildLabelToKeyMap(YES_REASON_LABELS);
const NO_LABEL_TO_KEY = buildLabelToKeyMap(NO_REASON_LABELS);

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


  // Helper to group counts by translation key
  const groupByKey = (reasons, isPositive) => {
    const labelToKey = isPositive ? YES_LABEL_TO_KEY : NO_LABEL_TO_KEY;
    const grouped = {};
    Object.entries(reasons).forEach(([reason, count]) => {
      // Try to map reason to a key (if it's already a key, use it; else, try to map from label)
      let key = reason;
      if (!(key in (isPositive ? YES_REASON_LABELS : NO_REASON_LABELS))) {
        // Try to map from label
        key = labelToKey[reason] || reason;
      }
      if (!grouped[key]) grouped[key] = 0;
      grouped[key] += count;
    });
    return grouped;
  };

  // Grouped counts for table and pie charts (by translation key)
  const yesGrouped = groupByKey(yesReasons, true);
  const noGrouped = groupByKey(noReasons, false);

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
      <h3 className="mb-300">{t('metrics.dashboard.userScored.title')} / Public Feedback</h3>
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
            <h4>Helpful (Yes) - Reason Breakdown</h4>
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
                    <Cell key={`cell-yes-${idx}`} fill={["#0088FE", "#00C49F", "#FFBB28", "#FF8042"][idx % 4]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Pie chart for NO (unhelpful) reasons */}
          <div style={{ flex: 1, minWidth: 300, height: 300 }}>
            <h4>{t('metrics.dashboard.userScored.unhelpful')} - Reason Breakdown</h4>
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
                    <Cell key={`cell-no-${idx}`} fill={["#8884d8", "#FF8042", "#FFBB28", "#00C49F"][idx % 4]} />
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
