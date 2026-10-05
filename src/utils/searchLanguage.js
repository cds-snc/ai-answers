// Search queries and results use French if either the page or question is French.
export function getSearchLanguage(pageLanguage = '', originalLanguage = '') {
  return (pageLanguage.toLowerCase().includes('fr') || String(originalLanguage).toLowerCase().includes('fr')) ? 'fr' : 'en';
}
