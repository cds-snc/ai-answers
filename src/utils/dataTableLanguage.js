/**
 * Returns a DataTables `language` config object for the given lang.
 * English is the DataTables default so an empty object is returned.
 * French translations are inlined (from the official DataTables fr-FR locale)
 * to avoid an async CDN fetch that can race with component unmounting and
 * cause a `parentNode` crash.
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
      decimal: ',',
      thousands: '\u00a0',
      emptyTable: 'Aucune donnée disponible dans le tableau',
      info: 'Affichage de _START_ à _END_ sur _TOTAL_ entrées',
      infoEmpty: 'Affichage de 0 à 0 sur 0 entrées',
      infoFiltered: '(filtré depuis _MAX_ entrées au total)',
      infoPostFix: '',
      lengthMenu: 'Afficher _MENU_ entrées',
      loadingRecords: 'Chargement\u2026',
      processing: 'Traitement\u2026',
      search: 'Rechercher\u00a0:',
      zeroRecords: 'Aucun enregistrement correspondant trouvé',
      paginate: {
        first: 'Premier',
        last: 'Dernier',
        next: 'Suivant',
        previous: 'Précédent',
      },
      aria: {
        sortAscending: '\u00a0: activer pour trier la colonne par ordre croissant',
        sortDescending: '\u00a0: activer pour trier la colonne par ordre décroissant',
      },
    };
  }
  return {};
}
