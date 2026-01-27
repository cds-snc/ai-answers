/**
 * About Page
 *
 * CONTENT EDITING:
 * The text content for this page is stored in markdown files that can be
 * easily edited without touching this code:
 *
 *   - English: public/content/about-en.md
 *   - French:  public/content/about-fr.md
 *
 * The markdown files use h2 headings (##) to define sections. Each section
 * is automatically parsed and rendered in the appropriate place on this page.
 *
 * To edit content, simply modify the markdown files. Changes will appear
 * after rebuilding or restarting the dev server.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
// GCDS components removed - using standard HTML for AA
import { useAboutContent } from '../hooks/useAboutContent.js';

const AboutPage = ({ lang = 'en' }) => {
  const { sections, loading, error } = useAboutContent(lang);

  // Loading state
  if (loading) {
    return (
      <div className="mb-600 container-custom">
          <p>{lang === 'fr' ? 'Chargement...' : 'Loading...'}</p>
      </div>
    );
  }

  // Error state - fall back to basic message
  if (error) {
    return (
      <div className="mb-600 container-custom">
          <h1>{lang === 'fr' ? 'À propos' : 'About'}</h1>
            {lang === 'fr'
              ? 'Impossible de charger le contenu.'
              : 'Unable to load content.'}
      </div>
    );
  }

  // Section keys based on language
  const sectionKeys = {
    overview: lang === 'fr' ? 'aperu' : 'overview',
    accessibility: lang === 'fr' ? 'accessibilit-et-convivialit' : 'accessibility-and-usability',
    privacy: lang === 'fr' ? 'confidentialit-et-conditions-dutilisation-de-lia' : 'privacy-and-ai-terms-of-use',
    blog: lang === 'fr' ? 'billets-de-blogue-sur-rponses-ia' : 'ai-answers-blog-posts',
    systemCard: lang === 'fr' ? 'documentation-de-la-fiche-systme' : 'system-card-documentation',
    contact: lang === 'fr' ? 'contactez-nous' : 'contact-us',
  };

  return (
    <div className="mb-600 container-custom">
        <h1 className="mb-400">{sections.title}</h1>

        {/* Overview Section - Not collapsible */}
        {sections[sectionKeys.overview] && (
          <section className="mb-400">
            <h2 className="mb-300">{sections[sectionKeys.overview].heading}</h2>
            <div className="about-content">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-200">{children}</p>,
                  a: ({ href, children }) => <a href={href}>{children}</a>,
                }}
              >
                {sections[sectionKeys.overview].content}
              </ReactMarkdown>
            </div>
          </section>
        )}

        {/* Accessibility and Usability Section */}
        {sections[sectionKeys.accessibility] && (
          <details tabIndex={0}>
          <summary>{sections[sectionKeys.accessibility].heading}</summary>
            <ReactMarkdown
              components={{
                p: ({ children }) => <p>{children}</p>,
                a: ({ href, children }) => <a href={href}>{children}</a>,
              }}
            >
              {sections[sectionKeys.accessibility].content}
            </ReactMarkdown>
            </details>
        )}

        {/* Privacy & Terms Section */}
        {sections[sectionKeys.privacy] && (
          <details className="mb-400" tabIndex={0}>
           <summary>{sections[sectionKeys.privacy].heading}</summary>
            <ReactMarkdown
              components={{
                p: ({ children }) => <p>{children}</p>,
                a: ({ href, children }) => <a href={href}>{children}</a>,
                h3: ({ children }) => <h3 className="mt-300 mb-200">{children}</h3>,
              }}
            >
              {sections[sectionKeys.privacy].content}
            </ReactMarkdown>
          </details>
        )}

        {/* Blog Posts Section */}
        {sections[sectionKeys.blog] && (
          <section className="mb-400">
            <h2 className="mb-300">{sections[sectionKeys.blog].heading}</h2>
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-300">{children}</p>,
                a: ({ href, children }) => <a href={href}>{children}</a>,
                ul: ({ children }) => <ul className="mb-400">{children}</ul>,
                li: ({ children }) => <li>{children}</li>,
              }}
            >
              {sections[sectionKeys.blog].content}
            </ReactMarkdown>
          </section>
        )}

        {/* System Card Documentation Section */}
        {sections[sectionKeys.systemCard] && (
          <section className="mb-400">
            <h2 className="mb-300">{sections[sectionKeys.systemCard].heading}</h2>
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-300">{children}</p>,
                a: ({ href, children }) => <a href={href}>{children}</a>,
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
                p: ({ children }) => <p>{children}</p>,
                a: ({ href, children }) => <a href={href}>{children}</a>,
              }}
            >
              {sections[sectionKeys.contact].content}
            </ReactMarkdown>
          </section>
        )}
    </div>
  );
};

export default AboutPage;
