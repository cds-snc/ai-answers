import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '../hooks/useTranslations.js';
import { getPath } from '../utils/routes.js';
import { GcdsContainer, GcdsLink, GcdsButton } from '@gcds-core/components-react';
import { useAuth } from '../contexts/AuthContext.js';
import ChatLogsDashboard from '../components/admin/ChatLogsDashboard.js';
import DeleteChatSection from '../components/admin/DeleteChatSection.js';
import DeleteExpertEval from '../components/DeleteExpertEval.js';
import { RoleBasedContent } from '../components/RoleBasedUI.js';
import AdminNotifications from '../components/admin/AdminNotifications.js';
import { HOW_TOS } from '../config/howTos.js';

const AdminPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  const [lookupChatId, setLookupChatId] = useState('');

  const handleLogout = () => {
    logout();
    // Force a full page reload to the signin page so the app's
    // fingerprint initialization runs again and a new session is created.
    try {
      window.location.href = getPath('signin', lang);
    } catch (e) {
      // Fallback: reload the current page
      try { window.location.reload(); } catch (err) { /* ignore */ }
    }
  };

  // Determine if user is partner only
  const isPartner = currentUser?.role === 'partner';

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">
        {isPartner
          ? t('admin.partnerTitle', 'AI Answers Partner Dashboard')
          : t('admin.title', 'Admin Dashboard')}
      </h1>

      {/* Admin notifications panel - only visible to admins */}
      <RoleBasedContent roles={["admin"]}>
        <AdminNotifications lang={lang} />
      </RoleBasedContent>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', isPartner ? 'Partner Navigation' : 'Admin Navigation')}>

        {/* Partner Menu - Visible to everyone (Partner & Admin) */}
        <section className="mb-400">
          <h2 className="mt-400 mb-400">
            {t('admin.navigation.partnerMenu', 'Partner Menu')}
          </h2>
          <ul className="list-none p-0">
            <li>
              <GcdsLink href={`/${lang}`} target="_blank" rel="noopener noreferrer">
                {t('admin.navigation.aiAnswers', 'AI Answers')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('eval-dashboard', lang)}>
                {t('admin.navigation.evalDashboard', 'Evaluation dashboard')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('chat-dashboard', lang)}>
                {t('admin.navigation.chatDashboard', 'Chat dashboard')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('metrics', lang)}>
                {t('admin.navigation.metrics', 'View performance metrics')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('partner-dashboard', lang)}>
                {t('admin.navigation.partnerDashboard')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('technical-metrics', lang)}>
                {t('admin.navigation.technicalMetrics')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('scenario-overrides', lang)}>
                {t('admin.navigation.scenarioOverrides', 'Scenario overrides')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('chat-viewer', lang)}>
                {t('admin.navigation.chatViewer')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={getPath('batch', lang)}>
                {t('admin.navigation.batches', 'View and manage batches')}
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
              {t('admin.navigation.title', 'Admin Menu')}
            </h2>
            <ul className="list-none p-0">
              <li>
                <GcdsLink href={getPath('users', lang)}>
                  {t('admin.navigation.users', 'Manage User Accounts')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('database', lang)}>
                  {t('admin.navigation.database', 'Manage the database')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('eval', lang)}>
                  {t('admin.navigation.eval', 'Evaluation Administration')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('auto-eval-dashboard', lang)}>
                  {t('admin.navigation.autoEvalDashboard', 'Auto-Evaluation dashboard')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('vector', lang)}>
                  {t('admin.navigation.vector', 'Vector Administration')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('settings', lang)}>
                  {t('settings.title', 'Settings')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('sessions', lang)}>
                  {t('admin.navigation.sessions', 'Active Sessions')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={getPath('connectivity', lang)}>
                  {t('admin.navigation.connectivity', 'Service Connectivity')}
                </GcdsLink>
              </li>
              {/* Experimental Features */}
              <li className="mt-400">
                <strong>{t('admin.navigation.experimental', 'Experimental')}</strong>
                <ul className="list-none pl-400">
                  <li>
                    <GcdsLink href={getPath('experimental-datasets', lang)}>
                      {t('admin.navigation.dataAnalysis', 'Data Analysis')}
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
                {t('admin.navigation.logout', 'Logout')}
              </button>
            </li>
          </ul>
        </section>
      </nav>

      {/* How-to guides, rendered in-app from public/content/admin/ */}
      <RoleBasedContent roles={["admin", "partner"]}>
        <section className="mb-400">
          <details>
            <summary>{t('admin.howTo.title')}</summary>
            <ul className="list-none p-0">
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

      {/* Quick chat lookup for admins and partners */}
      <RoleBasedContent roles={["admin", "partner"]}>
        <section className="mb-400">
          <h2 className="mt-400 mb-200">{t('admin.common.viewChatById')}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!lookupChatId) return;
              navigate(`/${lang}?chat=${encodeURIComponent(lookupChatId)}&review=1`);
            }}
          >
            <label htmlFor="view-chat-id" className="sr-only">
              {t('admin.viewChat.label', 'Chat ID')}
            </label>
            <div className="flex gap-400">
              <input
                id="view-chat-id"
                name="view-chat-id"
                type="text"
                className="form-control"
                value={lookupChatId}
                onChange={(e) => setLookupChatId(e.target.value)}
                placeholder={t('admin.viewChat.placeholder', 'Enter chat id')}
              />
              <GcdsButton type="submit" disabled={!lookupChatId.trim()}>
                {t('admin.viewChat.button', 'View chat')}
              </GcdsButton>
            </div>
          </form>
        </section>
      </RoleBasedContent>

      <DeleteChatSection lang={lang} />

      <DeleteExpertEval lang={lang} />

      <section id="chat-logs" className="mb-600">
        <h2 className="mt-400 mb-400">{t('admin.chatLogs.title', 'Recent Chat Interactions')}</h2>
        <ChatLogsDashboard lang={lang} />
      </section>
    </GcdsContainer >
  );
};

export default AdminPage;
