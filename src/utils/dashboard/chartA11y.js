// Shared `a11y` prop shape for HBarCard.js/DivergingBarCard.js's "As raw data
// table" toggle (see ChartDataToggle.js) — column labels + caption template,
// all translated. Identical across PartnerDashboard.js and PublicDashboard.js;
// factored out here so the two stay in sync instead of drifting copies.
export const buildChartA11y = (t) => ({
  categoryLabel: t('common.chartCategoryColumn'),
  valueLabel: t('common.chartValueColumn'),
  percentLabel: t('common.chartPercentColumn'),
  captionTemplate: t('common.chartDataTableCaption'),
  rawDataTableLabel: t('common.chartDataTableSummary'),
});

export default buildChartA11y;
