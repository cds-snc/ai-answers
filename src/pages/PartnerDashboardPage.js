import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import { RoleProtectedRoute } from '../components/RoleProtectedRoute.js';
import PartnerDashboard from '../components/admin/PartnerDashboard.js';

const PartnerDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('partnerDashboard.title')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      <PartnerDashboard lang={lang} />
    </GcdsContainer>
  );
};

export default function ProtectedPartnerDashboardPage(props) {
  return (
    <RoleProtectedRoute roles={['admin', 'partner']} lang={props.lang}>
      <PartnerDashboardPage {...props} />
    </RoleProtectedRoute>
  );
}
