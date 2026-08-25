import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer, GcdsText, GcdsLink } from '@gcds-core/components-react';
import { RoleProtectedRoute } from '../components/RoleProtectedRoute.js';
import PublicDashboard from '../components/admin/PublicDashboard.js';

const PublicDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);

  return (
    <GcdsContainer layout="page" className="mb-600">
      {/* Split/"stacked" title — see admin.css's .canada-ca-h1-stacked__eyebrow
          comment for the full explanation of this Canada.ca Specifications/
          GCWeb pattern. Reuses homepage.title (the site's own brand name)
          rather than a new key — publicDashboard.title used to repeat "AI
          Answers" itself, redundant once it's the eyebrow above it, so that
          key was trimmed down to just the page's own name. */}
      <h1 className="mb-400">
        <span className="canada-ca-h1-stacked__eyebrow">{t('homepage.title')}</span>
        <span className="canada-ca-h1-stacked__title">{t('publicDashboard.title')}</span>
      </h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      <PublicDashboard lang={lang} />
    </GcdsContainer>
  );
};

export default function ProtectedPublicDashboardPage(props) {
  return (
    <RoleProtectedRoute roles={['admin', 'partner']} lang={props.lang}>
      <PublicDashboardPage {...props} />
    </RoleProtectedRoute>
  );
}
