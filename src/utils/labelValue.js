// "Label: value" joined at runtime, where the label is data (a chart category,
// a filter value) rather than a locale string that could carry its own colon.
// Canadian French puts a space before ':'; English doesn't.
export const formatLabelValue = (label, value, lang) =>
  lang === 'fr' ? `${label} : ${value}` : `${label}: ${value}`;
