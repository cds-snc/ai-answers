import React, { useMemo } from 'react';
import { GcdsText } from '@gcds-core/components-react';
import DataTable from 'datatables.net-react';
import { SCORE_TO_KEY, FEEDBACK_OPTIONS, isPositiveScore } from '../../constants/UserFeedbackOptions.js';
import { splitPublicFeedbackTotals } from '../../utils/dashboard/feedbackBreakdown.js';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';
import { formatNumber, formatPercent } from '../../utils/numberFormat.js';
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

const YES_OTHER_SCORE = FEEDBACK_OPTIONS.YES.find(o => o.id === 'other').score;
const NO_OTHER_SCORE = FEEDBACK_OPTIONS.NO.find(o => o.id === 'other').score;

const EndUserFeedbackSection = ({ t, metrics, lang = 'en' }) => {
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const rawYesReasons = metrics.publicFeedbackReasons?.yes || {};
  const rawNoReasons = metrics.publicFeedbackReasons?.no || {};

  const yesReasons = useMemo(() => groupByScore(rawYesReasons, YES_OTHER_SCORE), [rawYesReasons]);
  const noReasons = useMemo(() => groupByScore(rawNoReasons, NO_OTHER_SCORE), [rawNoReasons]);

  // Helpful / unhelpful split, classified by score (not the raw yes/no click)
  // so notWanted ("answer is clear, but not what I wanted to hear") counts as
  // positive about AI. See splitPublicFeedbackTotals.
  const totalsSplit = useMemo(
    () => splitPublicFeedbackTotals(metrics.publicFeedbackTotals, noReasons),
    [metrics.publicFeedbackTotals, noReasons],
  );

  // Table rows: one row per score key with helpful EN/FR and unhelpful EN/FR
  // counts. YES scores (1–4) and NO scores (5–10) are non-overlapping, so a key
  // only ever appears in one direction. The label uses that natural direction,
  // but positive-about-AI 'no' reasons (notWanted) are shown in the helpful
  // columns so the column sums match the corrected totals above.
  const tableData = useMemo(() => {
    const allKeys = Array.from(new Set([...Object.keys(yesReasons), ...Object.keys(noReasons)]));
    return allKeys.map((key) => {
      const yes = yesReasons[key] || { en: 0, fr: 0, total: 0 };
      const no = noReasons[key] || { en: 0, fr: 0, total: 0 };
      const dataIsYes = yes.total > 0;
      const moveToHelpful = !dataIsYes && isPositiveScore(key);
      return {
        label: getReasonLabel(key, t, dataIsYes),
        yesEn: yes.en + (moveToHelpful ? no.en : 0),
        yesFr: yes.fr + (moveToHelpful ? no.fr : 0),
        noEn: moveToHelpful ? 0 : no.en,
        noFr: moveToHelpful ? 0 : no.fr,
        total: yes.total + no.total,
      };
    }).filter(row => row.total > 0);
  }, [yesReasons, noReasons, t]);

  return (
    <div className="mb-600">
      <h3 className="mb-300">{t('metrics.dashboard.userScored.title')}</h3>
      <GcdsText className="mb-300">{t('metrics.dashboard.userScored.description')}</GcdsText>
      <div className="bg-gray-50 p-4 rounded-lg">
        {/* Totals Table (unchanged) */}
        <DataTable
          data={(() => {
            const total = metrics.publicFeedbackTotals.totalQuestionsWithFeedback;
            const pctOf = (n) => (total ? fmtPct(Math.round((n / total) * 100)) : fmtPct(0));
            return [
              {
                metric: t('metrics.dashboard.userScored.total'),
                count: fmtN(total),
                percentage: fmtPct(100),
                enCount: fmtN(metrics.publicFeedbackTotals.enYes + metrics.publicFeedbackTotals.enNo),
                enPercentage: fmtPct(100),
                frCount: fmtN(metrics.publicFeedbackTotals.frYes + metrics.publicFeedbackTotals.frNo),
                frPercentage: fmtPct(100)
              },
              {
                metric: t('metrics.dashboard.userScored.helpful'),
                count: fmtN(totalsSplit.positive.total),
                percentage: pctOf(totalsSplit.positive.total),
                enCount: fmtN(totalsSplit.positive.en),
                enPercentage: pctOf(totalsSplit.positive.en),
                frCount: fmtN(totalsSplit.positive.fr),
                frPercentage: pctOf(totalsSplit.positive.fr)
              },
              {
                metric: t('metrics.dashboard.userScored.unhelpful'),
                count: fmtN(totalsSplit.negative.total),
                percentage: pctOf(totalsSplit.negative.total),
                enCount: fmtN(totalsSplit.negative.en),
                enPercentage: pctOf(totalsSplit.negative.en),
                frCount: fmtN(totalsSplit.negative.fr),
                frPercentage: pctOf(totalsSplit.negative.fr)
              }
            ];
          })()}
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
            language: dataTableLanguage(lang)
          }}
        />
        {/* Table for public feedback reasons breakdown by language */}
        <div style={{ marginTop: '2rem' }}>
          <h4>{t('metrics.dashboard.userScored.reasonTableTitle')}</h4>
          <DataTable
            data={tableData}
            columns={[
              { title: t('metrics.dashboard.userScored.reason'), data: 'label' },
              { title: `${t('metrics.dashboard.userScored.helpful')} ${t('metrics.dashboard.enCount')}`, data: 'yesEn', render: (d, type) => type === 'display' ? fmtN(d) : d },
              { title: `${t('metrics.dashboard.userScored.helpful')} ${t('metrics.dashboard.frCount')}`, data: 'yesFr', render: (d, type) => type === 'display' ? fmtN(d) : d },
              { title: `${t('metrics.dashboard.userScored.unhelpful')} ${t('metrics.dashboard.enCount')}`, data: 'noEn', render: (d, type) => type === 'display' ? fmtN(d) : d },
              { title: `${t('metrics.dashboard.userScored.unhelpful')} ${t('metrics.dashboard.frCount')}`, data: 'noFr', render: (d, type) => type === 'display' ? fmtN(d) : d },
              { title: t('metrics.dashboard.count'), data: 'total', render: (d, type) => type === 'display' ? fmtN(d) : d }
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
