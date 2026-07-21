import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer, GcdsText, GcdsLink } from '@gcds-core/components-react';
import { RoleProtectedRoute } from '../components/RoleProtectedRoute.js';
import PublicDashboard from '../components/admin/PublicDashboard.js';

const PublicDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-200">{t('publicDashboard.title')}</h1>

      <GcdsText className="mb-400">{t('publicDashboard.description')}</GcdsText>

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
