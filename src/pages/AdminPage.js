import React from 'react';
// import { useTranslations } from '../hooks/useTranslations';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import ChatLogsDashboard from '../components/admin/ChatLogsDashboard.js';

const AdminPage = ({ lang = 'en' }) => {
  // const { t } = useTranslations(lang);  //TODO: uncomment this when we have translations for this page

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">Admin</h1>
      <nav className="mb-400" aria-label="On this page">
        <h2 className="mt-400 mb-400">On this page</h2>
        <ul>
          <li className="mb-400">
            <GcdsText>
              <GcdsLink href="#chat-logs">Download chat logs</GcdsLink>
            </GcdsText>
          </li>
          <li className="mb-400">
            <GcdsText>
              <GcdsLink href={`/${lang}`}>Use the app</GcdsLink>
            </GcdsText>
          </li>
        </ul>
      </nav>

      <section id="chat-logs" className="mb-600">
        <h2 className="mt-400 mb-400">Chat interaction logs</h2>
        <ChatLogsDashboard />
      </section>
    </GcdsContainer>
  );
};

export default AdminPage;
