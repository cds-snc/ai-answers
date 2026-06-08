import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer } from '@gcds-core/components-react';
import { RoleProtectedRoute } from '../components/RoleProtectedRoute.js';
import PartnerDashboard from '../components/admin/PartnerDashboard.js';

const PartnerDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);

  return (
    <GcdsContainer layout="page" tag="main" className="mb-600">
      <h1 className="mb-400">{t('partnerDashboard.title')}</h1>


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
