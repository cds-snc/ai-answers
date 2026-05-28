const formatters = {};

export function formatNumber(n, lang) {
  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  if (!formatters[locale]) {
    formatters[locale] = new Intl.NumberFormat(locale);
  }
  return formatters[locale].format(n ?? 0);
}

export function formatPercent(n, lang) {
  const sep = lang === 'fr' ? ' ' : '';
  return `${n ?? 0}${sep}%`;
}
