/**
 * How-to guide page
 *
 * Renders a markdown guide from public/content/admin/ so admin and partner
 * users can read it in the app instead of going to GitHub.
 *
 * The guide to render is identified by `howToId`, which must match an entry in
 * src/config/howTos.js. Content is edited in the markdown files, not here.
 */

import React, { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GcdsContainer, GcdsText, GcdsLink } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { useMarkdownWithFrontmatter } from '../hooks/useMarkdownWithFrontmatter.js';
import { getHowTo, HOW_TO_CONTENT_DIR } from '../config/howTos.js';

const HowToPage = ({ lang = 'en', howToId }) => {
  const { t } = useTranslations(lang);
  const howTo = getHowTo(howToId);
  const filename = howTo ? howTo.files[lang] || howTo.files.en : null;

  const { frontmatter, content, loading, error } = useMarkdownWithFrontmatter(
    filename,
    HOW_TO_CONTENT_DIR
  );

  useEffect(() => {
    if (!loading && frontmatter.title) {
      document.title = frontmatter.title;

      const descMeta = document.querySelector('meta[name="description"]');
      if (descMeta && frontmatter.description) {
        descMeta.setAttribute('content', frontmatter.description);
      }
    }
  }, [frontmatter, loading]);

  // Same back-to-admin placement as every other admin page: directly under the h1.
  const backToAdminNav = (
    <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
      <GcdsText>
        <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
      </GcdsText>
    </nav>
  );

  if (!howTo) {
    return (
      <GcdsContainer layout="page" className="mb-600">
        <h1 className="mb-400">{t('admin.howTo.notFoundTitle')}</h1>
        {backToAdminNav}
        <p>{t('admin.howTo.notFound')}</p>
      </GcdsContainer>
    );
  }

  if (loading) {
    return (
      <GcdsContainer layout="page" className="mb-600">
        <p>{t('admin.howTo.loading')}</p>
      </GcdsContainer>
    );
  }

  if (error) {
    return (
      <GcdsContainer layout="page" className="mb-600">
        <h1 className="mb-400">{t(howTo.titleKey)}</h1>
        {backToAdminNav}
        <p>{t('admin.howTo.loadError')}</p>
      </GcdsContainer>
    );
  }

  return (
    <GcdsContainer layout="page" className="mb-600">
      <div className="how-to-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // The guide's h1 comes from the markdown, so the back link is emitted
            // right after it to match the other admin pages. Each guide has one h1.
            h1: ({ children }) => (
              <>
                <h1 className="mb-400">{children}</h1>
                {backToAdminNav}
              </>
            ),
            h2: ({ children }) => <h2 className="mt-400 mb-300">{children}</h2>,
            p: ({ children }) => <p className="mb-300">{children}</p>,
            // GCDS's reset applies `ol,ul{list-style:none}`, so markers have to be
            // asked for explicitly. `text-measure` matches the readable line length
            // GCDS already gives <p>, so list text wraps like body copy.
            ul: ({ children }) => (
              <ul className="list-disc mb-400 text-measure canada-ca-list-spcd-2">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal mb-400 text-measure canada-ca-list-spcd-2">{children}</ol>
            ),
            a: ({ href, children }) => <a href={href}>{children}</a>,
            img: ({ src, alt }) => (
              <img src={src} alt={alt} className="how-to-screenshot" />
            ),
            // Wide tables scroll in their own container so the page body never
            // scrolls sideways. tabIndex makes the scroll region keyboard-reachable.
            table: ({ children }) => (
              <div className="how-to-table-scroll" tabIndex={0}>
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </GcdsContainer>
  );
};

export default HowToPage;
