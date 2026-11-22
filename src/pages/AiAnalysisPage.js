import React, { useState } from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer, GcdsText, GcdsLink } from '@gcds-core/components-react';
import { RoleProtectedRoute } from '../components/RoleProtectedRoute.js';
import FilterPanel from '../components/admin/FilterPanel.js';
import EvalAnalysisSection from '../components/aiAnalysis/EvalAnalysisSection.js';

// AI-assisted analysis: one filter panel feeding each analysis section. Every
// analysis needs an institution, so the page says so before the filters (and
// each section repeats it beside its disabled Run button).
const AiAnalysisPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [appliedDepartment, setAppliedDepartment] = useState('');
  const [appliedFilters, setAppliedFilters] = useState(null);

  // Applying or clearing only records the filters; each section runs its own
  // analysis against them. No result count is passed to FilterPanel, so it
  // stays open — the filters are this page's main control.
  const applyFilters = (filters) => {
    setAppliedDepartment(filters?.department || '');
    setAppliedFilters(filters || null);
  };

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">{t('admin.aiAnalysis.title')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      <GcdsText>{t('admin.aiAnalysis.intro')}</GcdsText>
      <GcdsText>
        <strong>{t('admin.aiAnalysis.selectInstitution')}</strong>
      </GcdsText>

      <h2 className="sr-only">{t('admin.filters.sectionHeading')}</h2>
      <div className="mb-400">
        <FilterPanel
          lang={lang}
          onApplyFilters={applyFilters}
          onClearFilters={applyFilters}
          isVisible={true}
          autoApply={true}
          defaultUserType="all"
          defaultOpen={true}
          // Same as the partner dashboard: URL lookup only, no category
          // filters (see PartnerDashboard.js).
          showCategoryFilters={false}
        />
      </div>

      <EvalAnalysisSection
        lang={lang}
        appliedDepartment={appliedDepartment}
        appliedFilters={appliedFilters}
      />

      <h2 className="dashboard-section-title">{t('admin.aiAnalysis.questionAnalysis.title')}</h2>
      <div className="dashboard-section">
        <p className="font-size-text-xsm-nr">{t('admin.aiAnalysis.questionAnalysis.comingSoon')}</p>
      </div>
    </GcdsContainer>
  );
};

export default function ProtectedAiAnalysisPage(props) {
  return (
    <RoleProtectedRoute roles={['admin', 'partner']} lang={props.lang}>
      <AiAnalysisPage {...props} />
    </RoleProtectedRoute>
  );
}
