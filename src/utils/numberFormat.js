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

export function formatDecimal(n, lang, fractionDigits = 3) {
  if (n === null || typeof n === 'undefined' || n === '') return n;
  const num = Number(n);
  if (Number.isNaN(num)) return n;
  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  const key = `${locale}-${fractionDigits}`;
  if (!formatters[key]) {
    formatters[key] = new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }
  return formatters[key].format(num);
}
