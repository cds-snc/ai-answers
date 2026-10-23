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

// Picks the singular locale key: French treats 0 and 1 as singular, English only 1.
// Usage: t(isSingular(n, lang) ? 'x.one' : 'x.other')
const pluralRules = {};
export function isSingular(n, lang) {
  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  if (!pluralRules[locale]) {
    pluralRules[locale] = new Intl.PluralRules(locale);
  }
  return pluralRules[locale].select(n ?? 0) === 'one';
}
