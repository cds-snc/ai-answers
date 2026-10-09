import { getPath } from '../routes.js';

export const AI_ANSWERS_TEAM_EMAIL = 'RIA-AIA@servicecanada.gc.ca';

const howToGuidesHref = (lang) => `${getPath('admin', lang)}#how-to-guides`;

// Footer links that open in a new tab (see useFooterNewTabLinks).
export const getAdminFooterNewTabHrefs = (lang) => [howToGuidesHref(lang)];

// GcdsFooter subLinks for admin/partner pages ({ label: href }, max 5).
// Signed-in admins/partners only (How to guides, team email): never on a public page.
export function getAdminFooterLinks(lang, t) {
  const fr = lang === 'fr';
  return {
    [t('admin.footer.aboutAiAnswers')]: getPath('about', lang),
    [t('admin.howTo.title')]: howToGuidesHref(lang),
    [t('admin.footer.contactCeo')]: `mailto:${AI_ANSWERS_TEAM_EMAIL}`,
    [t('admin.footer.termsAndConditions')]: fr
      ? 'https://www.canada.ca/fr/transparence/avis.html'
      : 'https://www.canada.ca/en/transparency/terms.html',
    [t('admin.footer.privacy')]: fr
      ? 'https://www.canada.ca/fr/transparence/confidentialite.html'
      : 'https://www.canada.ca/en/transparency/privacy.html',
  };
}
