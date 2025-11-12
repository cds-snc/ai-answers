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

        {/* Overview Section - Not collapsible */}
        <section className="mb-400">
          <h2 className="mb-300">{t('aboutPage.overview.title')}</h2>
          <GcdsText className="mb-200">{t('aboutPage.overview.descriptionPart1')}</GcdsText>
          <GcdsText className="mb-200">{t('aboutPage.overview.descriptionPart2')}</GcdsText>
          <GcdsText className="mb-200">{t('homepage.about.builtBy')}</GcdsText>
          <GcdsText className="mb-200">{t('homepage.about.status')}</GcdsText>
          <GcdsText className="mb-200">{t('homepage.about.aiServices.azure')}</GcdsText>
        </section>

        {/* Accessibility and Usability Section */}
        <GcdsDetails
          detailsTitle={t('aboutPage.accessibilityUsability.title')}
          className="mb-400"
          tabIndex={0}
        >
          <GcdsText>{t('aboutPage.accessibilityUsability.designRationale')}</GcdsText>
          <GcdsText>{t('aboutPage.accessibilityUsability.testing')}</GcdsText>
          <GcdsText>{t('aboutPage.accessibilityUsability.wcag')}</GcdsText>
        </GcdsDetails>

        {/* Privacy & Terms Section */}
        <GcdsDetails
          detailsTitle={t('homepage.privacy.title')}
          className="mb-400"
          tabIndex={0}
        >
          <GcdsText>{t('homepage.privacy.storage')}</GcdsText>
          <GcdsText>{t('homepage.privacy.disclaimer')}</GcdsText>
          <GcdsText>
            {t('homepage.privacy.terms')}{' '}
            <GcdsLink
              href={
                lang === 'fr'
                  ? 'https://www.canada.ca/fr/transparence/avis.html'
                  : 'https://www.canada.ca/en/transparency/terms.html'
              }
            >
              {t('homepage.privacy.termsLink')}
            </GcdsLink>
          </GcdsText>
        </GcdsDetails>

        {/* System Card Documentation Section */}
        <section className="mb-400">
          <h2 className="mb-300">{t('aboutPage.systemCard.title')}</h2>
          <GcdsText className="mb-300">
            {t('aboutPage.systemCard.description')}
            {' '}
            <GcdsLink
              href={lang === 'fr' ? 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD_FR.md' : 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md'}
            >
              {lang === 'fr' ? 'Fiche système complète' : 'Complete System Card'}
            </GcdsLink>
          </GcdsText>

          <h3 className="mb-200">{t('aboutPage.systemCard.onThisPageTitle')}</h3>
          {/* Note: Anchor links (#section-name) will work once documentation is hosted on GitHub Pages or similar.
              For now, they link to the top of the document. Users can search within the page using Ctrl+F / Cmd+F. */}
          <ul className="mb-400">
            <li><GcdsLink href={lang === 'fr' ? 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD_FR.md#état-actuel' : 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md#current-status'}>{t('aboutPage.systemCard.currentStatus')}</GcdsLink></li>
            <li><GcdsLink href={lang === 'fr' ? 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD_FR.md#objectif-et-portée-du-système' : 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md#system-purpose-and-scope'}>{t('aboutPage.systemCard.purposeScope')}</GcdsLink></li>
            <li><GcdsLink href={lang === 'fr' ? 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD_FR.md#architecture-technique' : 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md#technical-architecture'}>{t('aboutPage.systemCard.architecture')}</GcdsLink></li>
            <li><GcdsLink href={lang === 'fr' ? 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD_FR.md#évaluation-des-risques-et-mesures-de-sécurité' : 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md#risk-assessment-and-safety-measures'}>{t('aboutPage.systemCard.riskAssessment')}</GcdsLink></li>
            <li><GcdsLink href={lang === 'fr' ? 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD_FR.md#performance-et-évaluation' : 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md#performance-and-evaluation'}>{t('aboutPage.systemCard.performance')}</GcdsLink></li>
            <li><GcdsLink href={lang === 'fr' ? 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD_FR.md#limitations-et-contraintes' : 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md#limitations-and-constraints'}>{t('aboutPage.systemCard.limitations')}</GcdsLink></li>
            <li><GcdsLink href={lang === 'fr' ? 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD_FR.md#principes-dia-responsable-et-gouvernance' : 'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md#responsible-ai-principles-and-governance'}>{t('aboutPage.systemCard.responsibleAI')}</GcdsLink></li>
          </ul>
        </section>

        {/* Contact Section */}
        <section className="mb-400">
          <h2 className="mb-300">{t('homepage.about.contactTitle')}</h2>
          <GcdsText>
            <GcdsLink
              href={t('homepage.about.contactUrl')}
            >
              {t('homepage.about.contactFormLink')}
            </GcdsLink>
          </GcdsText>
        </section>
      </GcdsContainer>
    </div>
  );
};

export default AboutPage;
