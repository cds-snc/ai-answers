// TODO: every server-side DataTable in this app imports this helper, but most
// still duplicate their own columns/options/ajax wiring rather than sharing
// one component. components/admin/ServerDataTable.js (used by SettingsPage.js)
// is meant to become that shared component for production pages — see its
// own comment for the migration plan and why it's a separate, more stable
// thing than components/experimental/ExperimentalServerDataTable.js.
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
      // Word labels like GC DS pagination (the chevrons are CSS, see
      // .dt-paging-button in admin.css). first/last are turned off per table
      // in the app's own tables; kept translated for any table still on
      // DataTables' default layout (the experimental pages).
      paginate: {
        first: 'Premier',
        previous: 'Précédent',
        next: 'Suivant',
        last: 'Dernier',
      },
      aria: {
        paginate: {
          first: 'Premier',
          previous: 'Précédent',
          next: 'Suivant',
          last: 'Dernier',
        },
        sortAscending: '\u00a0: activer pour trier la colonne par ordre croissant',
        sortDescending: '\u00a0: activer pour trier la colonne par ordre décroissant',
      },
    };
  }
  return {
    paginate: {
      first: 'First',
      previous: 'Previous',
      next: 'Next',
      last: 'Last',
    },
  };
}
