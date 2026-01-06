import React from 'react';
import ReactMarkdown from 'react-markdown';
import {
  GcdsContainer,
  GcdsDetails,
  GcdsText,
  GcdsLink,
} from '@cdssnc/gcds-components-react';
import { useAboutContent } from '../hooks/useAboutContent.js';

const AboutPage = ({ lang = 'en' }) => {
  const { sections, loading, error } = useAboutContent(lang);

  // Loading state
  if (loading) {
    return (
      <div className="mb-600 container-custom">
        <GcdsContainer size="xl" mainContainer centered tag="main">
          <GcdsText>{lang === 'fr' ? 'Chargement...' : 'Loading...'}</GcdsText>
        </GcdsContainer>
      </div>
    );
  }

  // Error state - fall back to basic message
  if (error) {
    return (
      <div className="mb-600 container-custom">
        <GcdsContainer size="xl" mainContainer centered tag="main">
          <h1>{lang === 'fr' ? 'À propos' : 'About'}</h1>
          <GcdsText>
            {lang === 'fr'
              ? 'Impossible de charger le contenu.'
              : 'Unable to load content.'}
          </GcdsText>
        </GcdsContainer>
      </div>
    );
  }

  // Section keys based on language
  const sectionKeys = {
    overview: lang === 'fr' ? 'aperu' : 'overview',
    accessibility: lang === 'fr' ? 'accessibilit-et-convivialit' : 'accessibility-and-usability',
    privacy: lang === 'fr' ? 'confidentialit-et-conditions-dutilisation-de-lia' : 'privacy-and-ai-terms-of-use',
    systemCard: lang === 'fr' ? 'documentation-de-la-fiche-systme' : 'system-card-documentation',
    contact: lang === 'fr' ? 'contactez-nous' : 'contact-us',
  };

  return (
    <div className="mb-600 container-custom">
      <GcdsContainer size="xl" mainContainer centered tag="main">
        <h1 className="mb-400">{sections.title}</h1>

        {/* Overview Section - Not collapsible */}
        {sections[sectionKeys.overview] && (
          <section className="mb-400">
            <h2 className="mb-300">{sections[sectionKeys.overview].heading}</h2>
            <div className="about-content">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <GcdsText className="mb-200">{children}</GcdsText>,
                  a: ({ href, children }) => <GcdsLink href={href}>{children}</GcdsLink>,
                }}
              >
                {sections[sectionKeys.overview].content}
              </ReactMarkdown>
            </div>
          </section>
        )}

        {/* Accessibility and Usability Section */}
        {sections[sectionKeys.accessibility] && (
          <GcdsDetails
            detailsTitle={sections[sectionKeys.accessibility].heading}
            className="mb-400"
            tabIndex={0}
          >
            <ReactMarkdown
              components={{
                p: ({ children }) => <GcdsText>{children}</GcdsText>,
                a: ({ href, children }) => <GcdsLink href={href}>{children}</GcdsLink>,
              }}
            >
              {sections[sectionKeys.accessibility].content}
            </ReactMarkdown>
          </GcdsDetails>
        )}

        {/* Privacy & Terms Section */}
        {sections[sectionKeys.privacy] && (
          <GcdsDetails
            detailsTitle={sections[sectionKeys.privacy].heading}
            className="mb-400"
            tabIndex={0}
          >
            <ReactMarkdown
              components={{
                p: ({ children }) => <GcdsText>{children}</GcdsText>,
                a: ({ href, children }) => <GcdsLink href={href}>{children}</GcdsLink>,
                h3: ({ children }) => <h3 className="mt-300 mb-200">{children}</h3>,
              }}
            >
              {sections[sectionKeys.privacy].content}
            </ReactMarkdown>
          </GcdsDetails>
        )}

        {/* System Card Documentation Section */}
        {sections[sectionKeys.systemCard] && (
          <section className="mb-400">
            <h2 className="mb-300">{sections[sectionKeys.systemCard].heading}</h2>
            <ReactMarkdown
              components={{
                p: ({ children }) => <GcdsText className="mb-300">{children}</GcdsText>,
                a: ({ href, children }) => <GcdsLink href={href}>{children}</GcdsLink>,
                h3: ({ children }) => <h3 className="mb-200">{children}</h3>,
                ul: ({ children }) => <ul className="mb-400">{children}</ul>,
                li: ({ children }) => <li>{children}</li>,
              }}
            >
              {sections[sectionKeys.systemCard].content}
            </ReactMarkdown>
          </section>
        )}

        {/* Contact Section */}
        {sections[sectionKeys.contact] && (
          <section className="mb-400">
            <h2 className="mb-300">{sections[sectionKeys.contact].heading}</h2>
            <ReactMarkdown
              components={{
                p: ({ children }) => <GcdsText>{children}</GcdsText>,
                a: ({ href, children }) => <GcdsLink href={href}>{children}</GcdsLink>,
              }}
            >
              {sections[sectionKeys.contact].content}
            </ReactMarkdown>
          </section>
        )}
      </GcdsContainer>
    </div>
  );
};

export default AboutPage;
