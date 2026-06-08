import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer } from '@gcds-core/components-react';
import { usePageContext } from '../hooks/usePageParam.js';
import { RoleProtectedRoute } from '../components/RoleProtectedRoute.js';
import MetricsDashboard from '../components/admin/MetricsDashboard.js';

const MetricsPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { language } = usePageContext();

  return (
    <GcdsContainer layout="page" tag="main" className="mb-600">
      <h1 className="mb-400">{t('metrics.title')}</h1>
      


      <section id="metrics-dashboard" className="mb-600">
        <h2 className="mt-400 mb-400">{t('metrics.timeRangeTitle')}</h2>
        <MetricsDashboard lang={lang} />
      </section>
    </GcdsContainer>
  );
};

// Wrap the component with RoleProtectedRoute for admin and partner protection
export default function ProtectedMetricsPage(props) {
  return (
    <RoleProtectedRoute roles={["admin", "partner"]} lang={props.lang}>
      <MetricsPage {...props} />
    </RoleProtectedRoute>
  );
}
