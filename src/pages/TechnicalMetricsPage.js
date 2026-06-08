import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer } from '@gcds-core/components-react';
import { RoleProtectedRoute } from '../components/RoleProtectedRoute.js';
import TechnicalMetricsDashboard from '../components/admin/TechnicalMetricsDashboard.js';

const TechnicalMetricsPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);

  return (
    <GcdsContainer layout="page" tag="main" className="mb-600">
      <h1 className="mb-400">{t('technicalMetrics.title')}</h1>



      <section id="technical-metrics-dashboard" className="mb-600">
        <h2 className="mt-400 mb-400">{t('technicalMetrics.timeRangeTitle')}</h2>
        <TechnicalMetricsDashboard lang={lang} />
      </section>
    </GcdsContainer>
  );
};

export default function ProtectedTechnicalMetricsPage(props) {
  return (
    <RoleProtectedRoute roles={["admin", "partner"]} lang={props.lang}>
      <TechnicalMetricsPage {...props} />
    </RoleProtectedRoute>
  );
}
