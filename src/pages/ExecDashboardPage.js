import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import { RoleProtectedRoute } from '../components/RoleProtectedRoute.js';
import ExecDashboard from '../components/admin/ExecDashboard.js';

const ExecDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('execDashboard.title')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      <ExecDashboard lang={lang} />
    </GcdsContainer>
  );
};

export default function ProtectedExecDashboardPage(props) {
  return (
    <RoleProtectedRoute roles={['admin']} lang={props.lang}>
      <ExecDashboardPage {...props} />
    </RoleProtectedRoute>
  );
}
