import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { getPath } from '../utils/routes.js';
import { GcdsContainer, GcdsLink } from '@gcds-core/components-react';
import { useAuth } from '../contexts/AuthContext.js';
import ChatLogsDashboard from '../components/admin/ChatLogsDashboard.js';
import ViewChatByIdSection from '../components/admin/ViewChatByIdSection.js';
import DeleteChatSection from '../components/admin/DeleteChatSection.js';
import DeleteExpertEval from '../components/DeleteExpertEval.js';
import { RoleBasedContent } from '../components/RoleBasedUI.js';
import AdminNotifications from '../components/admin/AdminNotifications.js';
import { HOW_TOS } from '../config/howTos.js';

const AdminPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { logout, currentUser } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  // Determine if user is partner only
  const isPartner = currentUser?.role === 'partner';

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">
        {isPartner ? t('admin.partnerTitle') : t('admin.title')}
      </h1>

      {/* Admin notifications panel - only visible to admins */}
      <RoleBasedContent roles={["admin"]}>
        <AdminNotifications lang={lang} />
      </RoleBasedContent>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', isPartner ? 'Partner Navigation' : 'Admin Navigation')}>

        {/* Partner Menu - Visible to everyone (Partner & Admin) */}
        <section className="mb-400">
          <h2 className="mt-400 mb-400">
            {t('admin.navigation.partnerMenu')}
          </h2>
          <ul className="list-none p-0">
            <li>
              <GcdsLink href={`/${lang}`} target="_blank" rel="noopener noreferrer">
                {t('admin.navigation.aiAnswers')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('eval-dashboard', lang)}>
                {t('admin.navigation.evalDashboard')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('chat-dashboard', lang)}>
                {t('admin.navigation.chatDashboard')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('metrics', lang)}>
                {t('admin.navigation.metrics')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('partner-dashboard', lang)}>
                {t('admin.navigation.partnerDashboard')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('scenario-overrides', lang)}>
                {t('admin.navigation.scenarioOverrides')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('chat-viewer', lang)}>
                {t('admin.navigation.chatViewer')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('batch', lang)}>
                {t('admin.navigation.batches')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('public-dashboard', lang)}>
                {t('admin.navigation.publicDashboard')}
              </GcdsLink>
            </li>
          </ul>
        </section>

        {/* Admin Menu - Visible only to Admins */}
        <RoleBasedContent roles={["admin"]}>
          <section className="mb-400">
            <h2 className="mt-400 mb-400">
              {t('admin.navigation.title')}
            </h2>
            <ul className="list-none p-0">
              <li>
                <GcdsLink href={getPath('users', lang)}>
                  {t('admin.navigation.users')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('database', lang)}>
                  {t('admin.navigation.database')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('eval', lang)}>
                  {t('admin.navigation.eval')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('auto-eval-dashboard', lang)}>
                  {t('admin.navigation.autoEvalDashboard')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('technical-metrics', lang)}>
                  {t('admin.navigation.technicalMetrics')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('vector', lang)}>
                  {t('admin.navigation.vector')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('settings', lang)}>
                  {t('settings.title')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('sessions', lang)}>
                  {t('admin.navigation.sessions')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('connectivity', lang)}>
                  {t('admin.navigation.connectivity')}
                </GcdsLink>
              </li>
              {/* Experimental Features */}
              <li className="mt-400">
                <strong>{t('admin.navigation.experimental')}</strong>
                <ul className="list-none pl-400">
                  <li>
                    <GcdsLink href={getPath('experimental-datasets', lang)}>
                      {t('admin.navigation.dataAnalysis')}
                    </GcdsLink>
                  </li>
                </ul>
              </li>

            </ul>
          </section>
        </RoleBasedContent>
        {/* Logout performs an action, not navigation, so it's a real button.
            TODO: give sign-out its own slot once this app has local nav. */}
        <section className="mt-400">
          <ul className="list-none p-0">
            <li>
              <button
                type="button"
                className="filter-button-secondary filter-button-secondary--inline"
                onClick={handleLogout}
              >
                {t('admin.navigation.logout')}
              </button>
            </li>
          </ul>
        </section>
      </nav>

      {/* How-to guides, rendered in-app from public/content/admin/ */}
      <RoleBasedContent roles={["admin", "partner"]}>
        <section className="mb-400">
          <h2 className="mt-400 mb-200">{t('admin.howTo.title')}</h2>
          <details>
            <summary>{t('admin.howTo.trigger')}</summary>
            <ul className="list-disc canada-ca-list-spcd-1 mt-200">
              {HOW_TOS.map((howTo) => (
                <li key={howTo.id}>
                  {/* New tab so the guide stays open alongside the page it describes */}
                  <GcdsLink href={getPath(howTo.route, lang)} target="_blank" rel="noopener noreferrer">
                    {t(howTo.titleKey)}
                  </GcdsLink>
                </li>
              ))}
            </ul>
          </details>
        </section>
      </RoleBasedContent>

      {/* Chat ID utilities for admins and partners: one real heading (not
          repeated per row - see SettingsPage.js's own accordion for the
          "one visible label per row, no separate heading" look this
          matches), three collapsed-by-default <details> rows underneath it,
          each row's own <summary> text the row's only label. ViewChatByIdSection.js/
          DeleteChatSection.js/DeleteExpertEval.js each render their own
          <details> row the same way, as standalone reusable components. */}
      <RoleBasedContent roles={["admin", "partner"]}>
        <section className="mb-400">
          <h2 className="mt-400 mb-200">{t('admin.chatTools.title')}</h2>
          <ViewChatByIdSection lang={lang} />
          <DeleteChatSection lang={lang} />
          <DeleteExpertEval lang={lang} />
        </section>
      </RoleBasedContent>

      <section id="chat-logs" className="mb-600">
        <h2 className="mt-400 mb-400">{t('admin.chatLogs.title')}</h2>
        <ChatLogsDashboard lang={lang} />
      </section>
    </GcdsContainer >
  );
};

export default AdminPage;
