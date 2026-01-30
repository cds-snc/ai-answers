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
 * The markdown files support YAML frontmatter at the top for metadata
 * (title, description, breadcrumbs, ogImage, keywords) and use h2 headings (##)
 * to define sections. Each section is automatically parsed and rendered
 * in the appropriate place on this page.
 *
 * To edit content, simply modify the markdown files. Changes will appear
 * after rebuilding or restarting the dev server.
 */

import React, { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useMarkdownWithFrontmatter } from '../hooks/useMarkdownWithFrontmatter.js';
import { DCTERMS } from '../config/metadata.js';

const AboutPage = ({ lang = 'en' }) => {
  const filename = lang === 'fr' ? 'about-fr.md' : 'about-en.md';
  const { frontmatter, sections, loading, error } = useMarkdownWithFrontmatter(filename);

  // Update page metadata from frontmatter
  useEffect(() => {
    if (!loading && frontmatter.title) {
      // Update page title
      document.title = frontmatter.title;

      // Update dcterms.title
      const dctermsTitleMeta = document.querySelector('meta[name="dcterms.title"]');
      if (dctermsTitleMeta) {
        dctermsTitleMeta.setAttribute('content', frontmatter.title);
      }

      // Update meta description
      const descMeta = document.querySelector('meta[name="description"]');
      if (descMeta && frontmatter.description) {
        descMeta.setAttribute('content', frontmatter.description);
      }

      // Update dcterms.description
      const dctermsDescMeta = document.querySelector('meta[name="dcterms.description"]');
      if (dctermsDescMeta && frontmatter.description) {
        dctermsDescMeta.setAttribute('content', frontmatter.description);
      }

      // Update og:title
      const ogTitleMeta = document.querySelector('meta[property="og:title"]');
      if (ogTitleMeta) {
        ogTitleMeta.setAttribute('content', frontmatter.title);
      }

      // Update og:description
      const ogDescMeta = document.querySelector('meta[property="og:description"]');
      if (ogDescMeta && frontmatter.description) {
        ogDescMeta.setAttribute('content', frontmatter.description);
      }

      // Update twitter:title
      const twitterTitleMeta = document.querySelector('meta[property="twitter:title"]');
      if (twitterTitleMeta) {
        twitterTitleMeta.setAttribute('content', frontmatter.title);
      }

      // Update twitter:description
      const twitterDescMeta = document.querySelector('meta[property="twitter:description"]');
      if (twitterDescMeta && frontmatter.description) {
        twitterDescMeta.setAttribute('content', frontmatter.description);
      }

      // Update og:image if provided
      if (frontmatter.ogImage) {
        const ogImageMeta = document.querySelector('meta[property="og:image"]');
        if (ogImageMeta) {
          const imagePath =
            frontmatter.ogImage.startsWith('http://') ||
            frontmatter.ogImage.startsWith('https://') ||
            frontmatter.ogImage.startsWith('/')
              ? frontmatter.ogImage
              : `/content/${frontmatter.ogImage}`;
          ogImageMeta.setAttribute('content', imagePath);
        }

        // Update twitter:image
        const twitterImageMeta = document.querySelector('meta[property="twitter:image"]');
        if (twitterImageMeta) {
          const imagePath =
            frontmatter.ogImage.startsWith('http://') ||
            frontmatter.ogImage.startsWith('https://') ||
            frontmatter.ogImage.startsWith('/')
              ? frontmatter.ogImage
              : `/content/${frontmatter.ogImage}`;
          twitterImageMeta.setAttribute('content', imagePath);
        }
      }

      // Update dcterms.creator for both languages
      const creatorMetaTag = document.querySelector('meta[name="dcterms.creator"]');
      if (creatorMetaTag) {
        const creatorContent = lang === 'fr' ? DCTERMS.CREATOR.FR : DCTERMS.CREATOR.EN;
        creatorMetaTag.setAttribute('content', creatorContent);
      }
    }
  }, [frontmatter, loading, lang]);

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
        <p>
          {lang === 'fr'
            ? 'Impossible de charger le contenu.'
            : 'Unable to load content.'}
        </p>
      </div>
    );
  }

  // Section keys based on language
  const sectionKeys = {
    overview: lang === 'fr' ? 'aperu' : 'overview',
    accessibility: lang === 'fr' ? 'accessibilit-et-convivialit' : 'accessibility-and-usability',
    privacy: lang === 'fr' ? 'confidentialit-et-conditions-dutilisation-de-lia' : 'privacy-and-ai-terms-of-use',
    systemCard: lang === 'fr' ? 'documentation-de-la-fiche-systme' : 'system-card-documentation',
    blogPosts: lang === 'fr' ? 'billets-de-blogue-sur-rponses-ia' : 'ai-answers-blog-posts',
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
      <details tabIndex={0}>
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
    {sections[sectionKeys.blogPosts] && (
      <section className="mb-400">
        <h2 className="mb-300">{sections[sectionKeys.blogPosts].heading}</h2>
        <ReactMarkdown
          components={{
            p: ({ children }) => <p className="mb-300">{children}</p>,
            a: ({ href, children }) => <a href={href}>{children}</a>,
            ul: ({ children }) => <ul className="mb-400">{children}</ul>,
            li: ({ children }) => <li>{children}</li>,
          }}
        >
          {sections[sectionKeys.blogPosts].content}
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
