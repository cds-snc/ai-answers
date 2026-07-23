import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer, GcdsText, GcdsLink } from '@gcds-core/components-react';
import { RoleProtectedRoute } from '../components/RoleProtectedRoute.js';
import PublicDashboard from '../components/admin/PublicDashboard.js';

const PublicDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">
        {t('publicDashboard.title')}
        {/* WET-BOEW's standard footnote-reference pattern (GCWeb's
            wb-fnote/fn-lnk, not shipped by GC DS — reproduced in admin.css).
            Scoped to the h1 rather than a section heading since the caveat
            it links to (public-users-only data) applies to the whole page,
            not just one section below it. */}
        <sup id="public-dashboard-fnref">
          <a className="fn-lnk" href="#public-dashboard-footnote">
            <span className="wb-inv">{t('dashboardFilter.footnoteRefSrPrefix')}</span>1
          </a>
        </sup>
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
