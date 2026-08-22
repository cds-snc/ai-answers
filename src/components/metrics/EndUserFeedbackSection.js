import React, { useMemo } from 'react';
import { GcdsText } from '@gcds-core/components-react';
import DataTable from 'datatables.net-react';
import { SCORE_TO_KEY, FEEDBACK_OPTIONS, isPositiveScore } from '../../constants/UserFeedbackOptions.js';
import { splitPublicFeedbackTotals } from '../../utils/dashboard/feedbackBreakdown.js';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';
import { formatNumber, formatPercent } from '../../utils/numberFormat.js';
import { buildCountPctRow, getCountPctColumns } from '../../utils/metrics/countPctTable.js';
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
      <h3 className="mb-0">{t('metrics.dashboard.userScored.title')}</h3>
      <GcdsText className="font-size-text-xsm-nr mb-300">{t('metrics.dashboard.userScored.description')}</GcdsText>
      <div>
        {/* Totals Table */}
        <DataTable
          data={(() => {
            const total = metrics.publicFeedbackTotals.totalQuestionsWithFeedback;
            return [
              // Total row's percentages are literal 100 (not computed via
              // pctOf below) even when total is 0 — matches this table's
              // original behaviour exactly; see buildCountPctRow's own
              // comment for why that's not the same as self-dividing.
              {
                metric: t('metrics.dashboard.userScored.total'),
                count: total,
                percentage: 100,
                enCount: metrics.publicFeedbackTotals.enYes + metrics.publicFeedbackTotals.enNo,
                enPercentage: 100,
                frCount: metrics.publicFeedbackTotals.frYes + metrics.publicFeedbackTotals.frNo,
                frPercentage: 100
              },
              buildCountPctRow(t('metrics.dashboard.userScored.helpful'), totalsSplit.positive, total),
              buildCountPctRow(t('metrics.dashboard.userScored.unhelpful'), totalsSplit.negative, total)
            ];
          })()}
          columns={getCountPctColumns(t, fmtN, fmtPct)}
          options={{
            paging: false,
            searching: false,
            ordering: false,
            info: false,
            language: dataTableLanguage(lang)
          }}
        >
          <caption className="wb-inv">{t('metrics.dashboard.userScored.title')}</caption>
        </DataTable>
        {/* One row per distinct feedback reason — a set that grows over
            time, same shape as MetricsDashboard.js's Institution breakdown
            table. Carries its CSS hooks (metrics-table-container,
            dashboard-table) so search/sort styling is ready when
            paging/searching/ordering are turned on; not active yet, so no
            layout/initComplete wiring either. Note: dashboard-table already
            applies zebra/hover regardless, so this table currently looks
            slightly different from the plain Totals table above it. */}
        <div style={{ marginTop: '2rem' }}>
          <h4>{t('metrics.dashboard.userScored.reasonTableTitle')}</h4>
          <div className="metrics-table-container">
          <DataTable
            className="display dashboard-table"
            data={tableData}
            columns={[
              { title: t('metrics.dashboard.userScored.reason'), data: 'label' },
              // type: 'num' on every count column below: this table's rows
              // are the only ones on this page that can be genuinely empty
              // at first mount (tableData is filtered to row.total > 0,
              // and metrics still equals initialMetricsState pre-fetch) —
              // DataTables only auto-detects column type once, from
              // whichever data is present at mount (datatables.net-react
              // just does clear()+rows.add() on every later data change, no
              // re-detection), so an empty-at-mount column would otherwise
              // default to type 'string' forever, including its alignment
              // (DataTables right-aligns dt-type-numeric by default) even
              // once real rows arrive. Declaring the type explicitly
              // sidesteps detection entirely instead of depending on mount
              // timing.
              { title: `${t('metrics.dashboard.userScored.helpful')} ${t('metrics.dashboard.enCount')}`, data: 'yesEn', type: 'num', render: (d, type) => type === 'display' ? fmtN(d) : d },
              { title: `${t('metrics.dashboard.userScored.helpful')} ${t('metrics.dashboard.frCount')}`, data: 'yesFr', type: 'num', render: (d, type) => type === 'display' ? fmtN(d) : d },
              { title: `${t('metrics.dashboard.userScored.unhelpful')} ${t('metrics.dashboard.enCount')}`, data: 'noEn', type: 'num', render: (d, type) => type === 'display' ? fmtN(d) : d },
              { title: `${t('metrics.dashboard.userScored.unhelpful')} ${t('metrics.dashboard.frCount')}`, data: 'noFr', type: 'num', render: (d, type) => type === 'display' ? fmtN(d) : d },
              { title: t('metrics.dashboard.count'), data: 'total', type: 'num', render: (d, type) => type === 'display' ? fmtN(d) : d }
            ]}
            options={{
              paging: false,
              searching: false,
              ordering: false,
              info: false,
              stripe: true,
              language: dataTableLanguage(lang)
            }}
          >
            <caption className="wb-inv">{t('metrics.dashboard.userScored.reasonTableTitle')}</caption>
          </DataTable>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EndUserFeedbackSection;
