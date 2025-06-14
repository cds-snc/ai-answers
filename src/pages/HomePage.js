// src/pages/HomePage.js
import React, { useState, useEffect } from 'react';
import ChatAppContainer from '../components/chat/ChatAppContainer.js';
import { GcdsContainer, GcdsDetails, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import DataStoreService from '../services/DataStoreService.js';
import OutageComponent from '../components/OutageComponent.js';
import { useHasAnyRole } from '../components/RoleBasedUI.js';

// Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <GcdsContainer size="xl" mainContainer centered>
          <h2>{t('homepage.errors.timeout.title')}</h2>
          <GcdsText>{t('homepage.errors.timeout.message')}</GcdsText>
          <button
            onClick={() => window.location.reload()}
            className="gcds-button gcds-button--primary"
          >
            {t('homepage.errors.timeout.button')}
          </button> {/* Corrected: Ensure button is properly closed */}
        </GcdsContainer>
      );
    }
    return this.props.children;
  }
}

const HomePage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const isPrivileged = useHasAnyRole(['admin', 'partner']);
  const [serviceStatus, setServiceStatus] = useState({ isAvailable: false, message: '' });
  const [chatId, setChatId] = useState(null);
  const [isLoadingSiteStatus, setIsLoadingSiteStatus] = useState(true);

  // By default, show outage until DB check completes
  useEffect(() => {
    DataStoreService.getSiteStatus().then(status => {
      if (status === 'available') {
        setServiceStatus({ isAvailable: true, message: '' });
      } else {
        setServiceStatus({ isAvailable: false, message: t('homepage.errors.serviceUnavailable') });
      }
      setIsLoadingSiteStatus(false);
    }).catch(() => {
      setServiceStatus({ isAvailable: false, message: t('homepage.errors.serviceUnavailable') });
      setIsLoadingSiteStatus(false);
    });
  }, [t]);

  async function fetchSession() {
    try {
      const data = await DataStoreService.getChatSession();
      setChatId(data.chatId);
      localStorage.setItem('chatId', data.chatId);
    } catch (error) {
      // If chat session fails, just leave chatId null, outage will already be shown if site is unavailable
      console.error('Failed to get chat session:', error);
    }
  }

  useEffect(() => {
    if (serviceStatus.isAvailable === true || isPrivileged) {
      fetchSession();
    }
  }, [serviceStatus.isAvailable, isPrivileged]);

  const WrappedErrorBoundary = ({ children }) => <ErrorBoundary t={t}>{children}</ErrorBoundary>;

  // Show outage by default, and if DB check fails, unless privileged
  if ((isLoadingSiteStatus || serviceStatus.isAvailable === false) && !isPrivileged) {
    return <OutageComponent />;
  }

  // Show chat if DB check passes or user is privileged
  if (serviceStatus.isAvailable === true || isPrivileged) {
    return (
      <WrappedErrorBoundary>
        <GcdsContainer
          size="xl"
          mainContainer
          centered
          tag="main"
          className="mb-600"
        >
          <h1 className="mb-400">{t('homepage.title')}</h1>
          <h2 className="mt-400 mb-400" aria-label={t('homepage.subtitle.ariaLabel')}>
            <span className="aria-hidden">{t('homepage.subtitle.text')}</span>
          </h2>
          <GcdsText className="mb-200">{t('homepage.intro.researchOnly')}</GcdsText>
          <GcdsDetails detailsTitle={t('homepage.privacy.title')} className="mb-400" tabIndex={0}>
            <GcdsText>{t('homepage.privacy.storage')}</GcdsText>
            <GcdsText>{t('homepage.privacy.disclaimer')}</GcdsText>
            <GcdsText>
              {t('homepage.privacy.terms')}{' '}
              <GcdsLink href={lang === 'fr' ? 'https://www.canada.ca/fr/transparence/avis.html' : 'https://www.canada.ca/en/transparency/terms.html'}>
                {t('homepage.privacy.termsLink')}
              </GcdsLink>
            </GcdsText>
          </GcdsDetails>
          <ChatAppContainer lang={lang} chatId={chatId} />
        </GcdsContainer>
        <GcdsContainer size="xl" mainContainer centered tag="below" className="mb-600" tabIndex={0}>
          <GcdsText>
            <a
              href={t('homepage.publicFeedback.surveyUrl')}
              className="feedback-survey-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('homepage.publicFeedback.surveyLink')}
            </a>
          </GcdsText>
          <GcdsDetails detailsTitle={t('homepage.about.title')} className="mb-400" tabIndex={0}>
            <GcdsText>{t('homepage.about.builtBy')}</GcdsText>
            <GcdsText>{t('homepage.about.aiServices.azure')}</GcdsText>
            <GcdsText>{t('homepage.about.contact')}</GcdsText>
            <GcdsText>
              <GcdsLink href={lang === 'fr' ? 'https://numerique.canada.ca/' : 'https://digital.canada.ca/'}>
                {t('homepage.about.cdslink')}
              </GcdsLink>
            </GcdsText>
          </GcdsDetails>
        </GcdsContainer>
      </WrappedErrorBoundary>
    );
  }

  // Fallback: show outage if status is unknown
  return <OutageComponent />;
};

export default HomePage;
