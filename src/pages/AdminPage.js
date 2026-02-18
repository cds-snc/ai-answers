import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer, GcdsLink, GcdsButton } from '@cdssnc/gcds-components-react';
import { useAuth } from '../contexts/AuthContext.js';
import ChatLogsDashboard from '../components/admin/ChatLogsDashboard.js';
import DeleteChatSection from '../components/admin/DeleteChatSection.js';
import DeleteExpertEval from '../components/DeleteExpertEval.js';
import { RoleBasedContent } from '../components/RoleBasedUI.js';
import AdminNotifications from '../components/admin/AdminNotifications.js';

const AdminPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  const [lookupChatId, setLookupChatId] = useState('');

  const handleLogout = (e) => {
    e.preventDefault();
    logout();
    // Force a full page reload to the signin page so the app's
    // fingerprint initialization runs again and a new session is created.
    try {
      const prefix = lang === 'fr' ? '/fr' : '/en';
      window.location.href = `${prefix}/signin`;
    } catch (e) {
      // Fallback: reload the current page
      try { window.location.reload(); } catch (err) { /* ignore */ }
    }
  };

  // Determine if user is partner only
  const isPartner = currentUser?.role === 'partner';

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
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
              <GcdsLink href={`/${lang}`}>
                {t('admin.navigation.aiAnswers', 'AI Answers')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={`/${lang}/eval-dashboard`}>
                {t('admin.navigation.evalDashboard', 'Evaluation dashboard')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={`/${lang}/chat-dashboard`}>
                {t('admin.navigation.chatDashboard', 'Chat dashboard')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={`/${lang}/metrics`}>
                {t('admin.navigation.metrics', 'View performance metrics')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={`/${lang}/scenario-overrides`}>
                {t('admin.navigation.scenarioOverrides', 'Scenario overrides')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={`/${lang}/chat-viewer`}>
                {t('admin.navigation.chatViewer')}
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
                <GcdsLink href={`/${lang}/batch`}>
                  {t('admin.navigation.batches', 'View and Manage Batches')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={`/${lang}/users`}>
                  {t('admin.navigation.users', 'Manage User Accounts')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={`/${lang}/database`}>
                  {t('admin.navigation.database', 'Manage the database')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={`/${lang}/eval`}>
                  {t('admin.navigation.eval', 'Evaluation Administration')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={`/${lang}/auto-eval-dashboard`}>
                  {t('admin.navigation.autoEvalDashboard', 'Auto-Evaluation dashboard')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={`/${lang}/vector`}>
                  {t('admin.navigation.vector', 'Vector Administration')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={`/${lang}/settings`}>
                  {t('settings.title', 'Settings')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={`/${lang}/sessions`}>
                  {t('admin.navigation.sessions', 'Active Sessions')}
                </GcdsLink>
              </li>
              <li>
                <GcdsLink href={`/${lang}/connectivity`}>
                  {t('admin.navigation.connectivity', 'Service Connectivity')}
                </GcdsLink>
              </li>

              {/* Experimental Features */}
              <li className="mt-400">
                <strong>{t('admin.navigation.experimental', 'Experimental')}</strong>
                <ul className="list-none pl-400">
                  <li>
                    <GcdsLink href={`/${lang}/experimental/analysis`}>
                      {t('admin.navigation.experimentalAnalysis', 'Analysis Batches')}
                    </GcdsLink>
                  </li>
                </ul>
              </li>
            </ul>
          </section>
        </RoleBasedContent>
        {/* Logout Link */}
        <section className="mt-400">
          <ul className="list-none p-0">
            <li>
              <GcdsLink href="#" onClick={handleLogout}>
                {t('admin.navigation.logout', 'Logout')}
              </GcdsLink>
            </li>
          </ul>
        </section>
      </nav>

      {/* Quick chat lookup for admins and partners */}
      <RoleBasedContent roles={["admin", "partner"]}>
        <section className="mb-400">
          <h2 className="mt-400 mb-200">{t('admin.viewChat.title', 'View chat by ID')}</h2>
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
