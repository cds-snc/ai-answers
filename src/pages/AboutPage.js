import React from 'react';
import {
  GcdsContainer,
  GcdsDetails,
  GcdsText,
  GcdsLink,
} from '@cdssnc/gcds-components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';

const AboutPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { language } = usePageContext();

  return (
    <div className="mb-600 container-custom">
      <GcdsContainer size="xl" mainContainer centered tag="main">
        <h1 className="mb-400">{t('aboutPage.title')}</h1>

        {/* Overview Section */}
        <GcdsDetails
          detailsTitle={t('aboutPage.overview.title')}
          className="mb-400"
          tabIndex={0}
        >
          <GcdsText>{t('aboutPage.overview.builtBy')}</GcdsText>
          <GcdsText>{t('aboutPage.overview.aiServices')}</GcdsText>
          <GcdsText>
            {t('aboutPage.overview.contact')}
          </GcdsText>
          <GcdsText>
            <GcdsLink
              href={
                lang === 'fr'
                  ? 'https://numerique.canada.ca/'
                  : 'https://digital.canada.ca/'
              }
            >
              {t('aboutPage.overview.cdslink')}
            </GcdsLink>
          </GcdsText>
        </GcdsDetails>

        {/* Privacy & Terms Section */}
        <GcdsDetails
          detailsTitle={t('aboutPage.privacy.title')}
          className="mb-400"
          tabIndex={0}
        >
          <GcdsText>{t('aboutPage.privacy.storage')}</GcdsText>
          <GcdsText>{t('aboutPage.privacy.disclaimer')}</GcdsText>
          <GcdsText>
            {t('aboutPage.privacy.terms')}{' '}
            <GcdsLink
              href={
                lang === 'fr'
                  ? 'https://www.canada.ca/fr/transparence/avis.html'
                  : 'https://www.canada.ca/en/transparency/terms.html'
              }
            >
              {t('aboutPage.privacy.termsLink')}
            </GcdsLink>
          </GcdsText>
        </GcdsDetails>

        {/* How It Works Section */}
        <GcdsDetails
          detailsTitle={t('aboutPage.howItWorks.title')}
          className="mb-400"
          tabIndex={0}
        >
          <GcdsText>{t('aboutPage.howItWorks.description')}</GcdsText>
          <h3 className="mb-200">{t('aboutPage.howItWorks.architecture')}</h3>
          <GcdsText>{t('aboutPage.howItWorks.architectureDescription')}</GcdsText>
          <h3 className="mb-200 mt-300">{t('aboutPage.howItWorks.agentic')}</h3>
          <GcdsText>{t('aboutPage.howItWorks.agenticDescription')}</GcdsText>
          <h3 className="mb-200 mt-300">{t('aboutPage.howItWorks.contentFreshness')}</h3>
          <GcdsText>{t('aboutPage.howItWorks.contentFreshnessDescription')}</GcdsText>
        </GcdsDetails>

        {/* Safety & Accuracy Section */}
        <GcdsDetails
          detailsTitle={t('aboutPage.safetyAccuracy.title')}
          className="mb-400"
          tabIndex={0}
        >
          <GcdsText>{t('aboutPage.safetyAccuracy.privacy')}</GcdsText>
          <GcdsText>{t('aboutPage.safetyAccuracy.evaluation')}</GcdsText>
          <GcdsText>{t('aboutPage.safetyAccuracy.contentFiltering')}</GcdsText>
        </GcdsDetails>

        {/* Scope & Limitations Section */}
        <GcdsDetails
          detailsTitle={t('aboutPage.scopeLimitations.title')}
          className="mb-400"
          tabIndex={0}
        >
          <h3 className="mb-200">{t('aboutPage.scopeLimitations.inScope')}</h3>
          <GcdsText>{t('aboutPage.scopeLimitations.inScopeDescription')}</GcdsText>
          <h3 className="mb-200 mt-300">{t('aboutPage.scopeLimitations.outOfScope')}</h3>
          <GcdsText>{t('aboutPage.scopeLimitations.outOfScopeDescription')}</GcdsText>
          <h3 className="mb-200 mt-300">{t('aboutPage.scopeLimitations.languages')}</h3>
          <GcdsText>{t('aboutPage.scopeLimitations.languagesDescription')}</GcdsText>
        </GcdsDetails>

        {/* Accessibility Section */}
        <GcdsDetails
          detailsTitle={t('aboutPage.accessibility.title')}
          className="mb-400"
          tabIndex={0}
        >
          <GcdsText>{t('aboutPage.accessibility.description')}</GcdsText>
          <GcdsText>{t('aboutPage.accessibility.screenReaders')}</GcdsText>
          <GcdsText>{t('aboutPage.accessibility.wcag')}</GcdsText>
        </GcdsDetails>
      </GcdsContainer>
    </div>
  );
};

export default AboutPage;
