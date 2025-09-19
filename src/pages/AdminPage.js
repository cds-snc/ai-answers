import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer, GcdsLink } from '@cdssnc/gcds-components-react';
import { useAuth } from '../contexts/AuthContext.js';
import ChatLogsDashboard from '../components/admin/ChatLogsDashboard.js';
import DeleteChatSection from '../components/admin/DeleteChatSection.js';
import DeleteExpertEval from '../components/DeleteExpertEval.js';
import { RoleBasedContent } from '../components/RoleBasedUI.js';


const AdminPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { logout, currentUser } = useAuth();

  const handleLogout = (e) => {
    e.preventDefault();
    logout();
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

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', isPartner ? 'Partner Navigation' : 'Admin Navigation')}>
        <h2 className="mt-400 mb-400">
          {isPartner
            ? t('admin.navigation.partnerMenu', 'Partner Menu')
            : t('admin.navigation.title', 'Admin Menu')}
        </h2>
        <ul className="list-none p-0">
          <li>
            <GcdsLink href={`/${lang}`}>
              {t('admin.navigation.aiAnswers', 'AI Answers')}
            </GcdsLink>
          </li>

          {/* Admin-only links */}
          <RoleBasedContent roles={["admin"]}>
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
              <GcdsLink href={`/${lang}/vector`}>
                {t('admin.navigation.vector', 'Vector Administration')}
              </GcdsLink>
            </li>
            <li>
              <GcdsLink href={`/${lang}/settings`}>
                {t('settings.title', 'Settings')}
              </GcdsLink>
            </li>
          </RoleBasedContent>

          {/* Links for both roles */}
          <li>
            <GcdsLink href={`/${lang}/chat-viewer`}>
              {t('admin.navigation.chatViewer')}
            </GcdsLink>
          </li>
          <li>
            <GcdsLink href={`/${lang}/public-eval`}>
              {t('admin.navigation.publicEval', 'Public Evaluation')}
            </GcdsLink>
          </li>
          <li>
            <GcdsLink href={`/${lang}/metrics`}>
              {t('admin.navigation.metrics', 'View performance metrics')}
            </GcdsLink>
          </li>
          <li>
            <GcdsLink href={`/${lang}/chat-dashboard`}>
              {t('admin.navigation.chatDashboard', 'Chat dashboard')}
            </GcdsLink>
          </li>
          <li>
            <GcdsLink href="#" onClick={handleLogout}>
              {t('admin.navigation.logout', 'Logout')}
            </GcdsLink>
          </li>
        </ul>
      </nav>

      <DeleteChatSection lang={lang} />

      <DeleteExpertEval lang={lang} />

      <section id="chat-logs" className="mb-600">
        <h2 className="mt-400 mb-400">{t('admin.chatLogs.title', 'Recent Chat Interactions')}</h2>
        <ChatLogsDashboard lang={lang} />
      </section>
    </GcdsContainer>
  );
};

export default AdminPage;

