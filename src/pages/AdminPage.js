import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import { usePageContext } from '../hooks/usePageParam.js';
import ChatLogsDashboard from '../components/admin/ChatLogsDashboard.js';

const AdminPage = () => {
  const { t } = useTranslations();
  const { lang } = usePageContext();

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('admin.title', 'Admin')}</h1>
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', 'On this page')}>
        <h2 className="mt-400 mb-400">{t('admin.navigation.title', 'On this page')}</h2>
        <ul>
          <li className="mb-400">
            <GcdsText>
              <GcdsLink href={`/${lang}/logs`}>
                {t('admin.navigation.viewLogs', 'View Logs')}
              </GcdsLink>
            </GcdsText>
          </li>
          <li className="mb-400">
            <GcdsText>
              <GcdsLink href={`/${lang}`}>{t('admin.navigation.useApp', 'Use the app')}</GcdsLink>
            </GcdsText>
          </li>
        </ul>
      </nav>
      <section id="chat-logs" className="mb-600">
        <h2 className="mt-400 mb-400">{t('admin.chatLogs.title', 'Chat interaction logs')}</h2>
        <ChatLogsDashboard />
      </section>
    </GcdsContainer>
  );
};

export default AdminPage;
