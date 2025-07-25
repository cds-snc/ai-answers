import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer, GcdsLink } from '@cdssnc/gcds-components-react';
import { useAuth } from '../contexts/AuthContext.js';
import ChatLogsDashboard from '../components/admin/ChatLogsDashboard.js';
import DeleteChatSection from '../components/admin/DeleteChatSection.js';

const AdminPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { logout } = useAuth();

  const handleLogout = (e) => {
    e.preventDefault();
    logout();
  };

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('admin.title', 'Admin Dashboard')}</h1>
      
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', 'Admin Navigation')}>
        <h2 className="mt-400 mb-400">{t('admin.navigation.title', 'Admin Menu')}</h2>
        <ul className="list-none p-0">
          <li>
            <GcdsLink href={`/${lang}`}>
              {t('admin.navigation.aiAnswers', 'AI Answers')}
            </GcdsLink>
          </li>
          <li>
            <GcdsLink href={`/${lang}/batch`}>
              {t('admin.navigation.batches', 'Batches')}
            </GcdsLink>
          </li>
          <li>
            <GcdsLink href={`/${lang}/users`}>
              {t('admin.navigation.users', 'User Management')}
            </GcdsLink>
          </li>
          <li>
            <GcdsLink href={`/${lang}/chat-viewer`}>
              {t('admin.navigation.chatViewer')}
            </GcdsLink>
          </li>
          <li>
            <GcdsLink href={`/${lang}/database`}>
              {t('admin.navigation.database', 'Database Management')}
            </GcdsLink>
          </li>
          <li>
            <GcdsLink href={`/${lang}/eval`}>
              {t('admin.navigation.eval', 'Evaluation Tools')}
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
            <GcdsLink href={`/${lang}/settings`}>
              {t('settings.title', 'Settings')}
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

      <section id="chat-logs" className="mb-600">
        <h2 className="mt-400 mb-400">{t('admin.chatLogs.title', 'Recent Chat Interactions')}</h2>
        <ChatLogsDashboard lang={lang} />
      </section>
    </GcdsContainer>
  );
};

export default AdminPage;