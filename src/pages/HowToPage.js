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
import { GcdsContainer } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { useMarkdownWithFrontmatter } from '../hooks/useMarkdownWithFrontmatter.js';
import { getHowTo, HOW_TO_CONTENT_DIR } from '../config/howTos.js';
import { getPath } from '../utils/routes.js';

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

  const backLink = (
    <p className="mt-400">
      <a href={getPath('admin', lang)}>{t('admin.howTo.backToAdmin')}</a>
    </p>
  );

  if (!howTo) {
    return (
      <GcdsContainer layout="page" className="mb-600">
        <h1 className="mb-400">{t('admin.howTo.notFoundTitle')}</h1>
        <p>{t('admin.howTo.notFound')}</p>
        {backLink}
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
        <p>{t('admin.howTo.loadError')}</p>
        {backLink}
      </GcdsContainer>
    );
  }

  return (
    <GcdsContainer layout="page" className="mb-600">
      <div className="how-to-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="mb-400">{children}</h1>,
            h2: ({ children }) => <h2 className="mt-400 mb-300">{children}</h2>,
            p: ({ children }) => <p className="mb-300">{children}</p>,
            ul: ({ children }) => <ul className="mb-400">{children}</ul>,
            ol: ({ children }) => <ol className="mb-400">{children}</ol>,
            a: ({ href, children }) => <a href={href}>{children}</a>,
            img: ({ src, alt }) => (
              <img src={src} alt={alt} className="how-to-screenshot" />
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      {backLink}
    </GcdsContainer>
  );
};

export default HowToPage;
