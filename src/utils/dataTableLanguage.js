/**
 * Returns a DataTables `language` config object for the given lang.
 * English is the DataTables default so an empty object is returned.
 * French uses the official DataTables CDN translation file.
 *
 * Usage:
 *   options={{ ...otherOptions, language: dataTableLanguage(lang) }}
 *
 * To preserve page-specific search labels, spread and override:
 *   language: { ...dataTableLanguage(lang), search: t('my.searchLabel') }
 */
export function dataTableLanguage(lang) {
  if (lang === 'fr') {
    return {
      url: 'https://cdn.datatables.net/plug-ins/2.2.1/i18n/fr-FR.json'
    };
  }
  return {};
}
