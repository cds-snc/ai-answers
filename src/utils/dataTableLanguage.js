/**
 * Returns a DataTables `language` config object for the given lang.
 * English is the DataTables default so an empty object is returned.
 * French translations are inlined to avoid async CDN fetches, which
 * can cause "parentNode" crashes when a component unmounts mid-fetch.
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
      search: 'Rechercher :',
      lengthMenu: 'Afficher _MENU_ entrées',
      info: 'Affichage de _START_ à _END_ sur _TOTAL_ entrées',
      infoEmpty: 'Affichage de 0 à 0 sur 0 entrées',
      infoFiltered: '(filtrées depuis un total de _MAX_ entrées)',
      zeroRecords: 'Aucune entrée correspondante trouvée',
      emptyTable: 'Aucune donnée disponible dans le tableau',
      processing: 'Traitement...',
      loadingRecords: 'Chargement...',
      paginate: {
        first: 'Première',
        last: 'Dernière',
        next: 'Suivante',
        previous: 'Précédente',
      },
    };
  }
  return {};
}
