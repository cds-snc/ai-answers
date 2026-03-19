import React from 'react';
import { GcdsText } from '@cdssnc/gcds-components-react';
import DataTable from 'datatables.net-react';
import { SCORE_TO_KEY, FEEDBACK_OPTIONS } from '../../constants/UserFeedbackOptions.js';
import enLocale from '../../locales/en.json';
import frLocale from '../../locales/fr.json';

// Reverse map: known label string (EN or FR) → score
const LABEL_TO_SCORE = (() => {
  const map = {};
  ['YES', 'NO'].forEach(type => {
    const feedbackType = type.toLowerCase();
    FEEDBACK_OPTIONS[type].forEach(opt => {
      const enLabel = enLocale.homepage?.publicFeedback?.[feedbackType]?.options?.[opt.id];
      const frLabel = frLocale.homepage?.publicFeedback?.[feedbackType]?.options?.[opt.id];
      if (enLabel) map[enLabel] = opt.score;
      if (frLabel) map[frLabel] = opt.score;
    });
  });
  return map;
})();


// Translate a score key to the current language label.
// scoreKey is a numeric string (e.g. "1") or "legacy".
const getReasonLabel = (scoreKey, t, isPositive) => {
  const id = SCORE_TO_KEY[parseInt(scoreKey, 10)];
  if (!id) return scoreKey;
  if (id === 'other') {
    return isPositive
      ? t('metrics.dashboard.userScored.otherYes', 'Other (yes)')
      : t('metrics.dashboard.userScored.otherNo', 'Other (no)');
  }
  const translationKey = isPositive
    ? `homepage.publicFeedback.yes.options.${id}`
    : `homepage.publicFeedback.no.options.${id}`;
  const translation = t(translationKey);
  return translation !== translationKey ? translation : id;
};

// Merge raw backend reasons (score strings or legacy label strings) into score-keyed buckets.
// otherScore: the score for "Other" in this feedback direction (4 for yes, 6 for no).
const groupByScore = (reasons, otherScore) => {
  const grouped = {};
  Object.entries(reasons).forEach(([key, counts]) => {
    const numericScore = parseInt(key, 10);
    let scoreKey;
    if (!isNaN(numericScore) && SCORE_TO_KEY[numericScore]) {
      // Modern record: key is already a numeric score string
      scoreKey = String(numericScore);
    } else if (/^(other|autre)\b/i.test(key)) {
      // "Other" / "Autre" / "Other - [typed text]" — checked before LABEL_TO_SCORE because
      // both YES and NO have an "Other" option with different scores; context (otherScore) wins
      scoreKey = String(otherScore);
    } else if (LABEL_TO_SCORE[key]) {
      // Legacy record: exact label match for all other options
      scoreKey = String(LABEL_TO_SCORE[key]);
    } else {
      scoreKey = 'unknown';
    }
    if (!grouped[scoreKey]) grouped[scoreKey] = { en: 0, fr: 0, total: 0 };
    grouped[scoreKey].en += counts.en;
    grouped[scoreKey].fr += counts.fr;
    grouped[scoreKey].total += counts.total;
  });
  return grouped;
};

const EndUserFeedbackSection = ({ t, metrics }) => {
  const rawYesReasons = metrics.publicFeedbackReasons?.yes || {};
  const rawNoReasons = metrics.publicFeedbackReasons?.no || {};

  const yesReasons = groupByScore(rawYesReasons, 4);
  const noReasons = groupByScore(rawNoReasons, 6);

  const allKeys = Array.from(new Set([
    ...Object.keys(yesReasons),
    ...Object.keys(noReasons)
  ]));

  // Table rows: one row per score key with yes EN/FR and no EN/FR counts.
  // YES scores (1–4) and NO scores (5–10) are non-overlapping, so a key
  // only ever appears in one direction — isPositive is unambiguous.
  const tableData = allKeys.map((key) => {
    const yes = yesReasons[key] || { en: 0, fr: 0, total: 0 };
    const no = noReasons[key] || { en: 0, fr: 0, total: 0 };
    const isPositive = yes.total > 0;
    return {
      label: getReasonLabel(key, t, isPositive),
      yesEn: yes.en,
      yesFr: yes.fr,
      noEn: no.en,
      noFr: no.fr,
      total: yes.total + no.total,
    };
  }).filter(row => row.total > 0);

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
        {/* Table for public feedback reasons breakdown by language */}
        <div style={{ marginTop: '2rem' }}>
          <h4>{t('metrics.dashboard.userScored.reasonTableTitle')}</h4>
          <DataTable
            data={tableData}
            columns={[
              { title: t('metrics.dashboard.userScored.reason'), data: 'label' },
              { title: `${t('metrics.dashboard.userScored.helpful')} ${t('metrics.dashboard.enCount')}`, data: 'yesEn' },
              { title: `${t('metrics.dashboard.userScored.helpful')} ${t('metrics.dashboard.frCount')}`, data: 'yesFr' },
              { title: `${t('metrics.dashboard.userScored.unhelpful')} ${t('metrics.dashboard.enCount')}`, data: 'noEn' },
              { title: `${t('metrics.dashboard.userScored.unhelpful')} ${t('metrics.dashboard.frCount')}`, data: 'noFr' },
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
