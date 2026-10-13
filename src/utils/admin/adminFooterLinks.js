import { getPath } from '../routes.js';
import { AI_ANSWERS_TEAM_EMAIL } from '../../config/teamContact.js';

// TODO: point at a how-to guides page once there is one. Until then this is
// the admin page's How-to section, which AdminPage.js focuses on arrival.
const howToGuidesHref = (lang) => `${getPath('admin', lang)}#how-to-guides`;

// GcdsFooter props for admin/partner pages. Team links go in the contextual
// band (own heading, max 3 links); subLinks sit under GcdsFooter's fixed
// "Government of Canada Corporate" heading, so only Canada.ca links go there.
// Signed-in admins/partners only (How to guides, team email): never on a public page.
export function getAdminFooterProps(lang, t) {
  const fr = lang === 'fr';
  return {
    contextualHeading: t('admin.footer.heading'),
    contextualLinks: {
      [t('admin.footer.contactTeam')]: `mailto:${AI_ANSWERS_TEAM_EMAIL}`,
      [t('admin.footer.aboutAiAnswers')]: getPath('about', lang),
      [t('admin.howTo.title')]: howToGuidesHref(lang),
    },
    subLinks: {
      [t('admin.footer.termsAndConditions')]: fr
        ? 'https://www.canada.ca/fr/transparence/avis.html'
        : 'https://www.canada.ca/en/transparency/terms.html',
      [t('admin.footer.privacy')]: fr
        ? 'https://www.canada.ca/fr/transparence/confidentialite.html'
        : 'https://www.canada.ca/en/transparency/privacy.html',
    },
  };
}
