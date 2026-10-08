/**
 * System card page
 *
 * CONTENT EDITING:
 * Edit the system card at the repo root - SYSTEM_CARD.md (English) and
 * SYSTEM_CARD_FR.md (French) - not this file. See src/config/systemCard.js
 * for how those files become this page's content.
 */

import React, { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import { useTranslations } from '../hooks/useTranslations.js';
import { useMarkdownWithFrontmatter } from '../hooks/useMarkdownWithFrontmatter.js';
import { SYSTEM_CARD_CONTENT_DIR, SYSTEM_CARD_FILES } from '../config/systemCard.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import MermaidDiagram from '../components/systemcard/MermaidDiagram.js';
import { useFocusOnChange } from '../hooks/useFocusOnChange.js';

// rehype-raw: the card's "Image description" panels are raw <details> HTML.
// rehype-slug: GitHub-style heading ids, which the card's "On this page"
// links (#executive-summary, #résumé-exécutif, ...) point at.
const REHYPE_PLUGINS = [rehypeRaw, rehypeSlug];

const isMermaidBlock = (node) =>
  node?.children?.[0]?.tagName === 'code' &&
  (node.children[0].properties?.className || []).includes('language-mermaid');

// The "On this page" contents list: every item is just a link to a section
// of this page. Matched by shape, not heading text, so it works in EN and FR.
const isContentsList = (node) => {
  const items = (node?.children || []).filter((child) => child.type === 'element');
  return (
    items.length > 0 &&
    items.every((li) => {
      const content = li.children.filter(
        (child) => child.type === 'element' || child.value?.trim()
      );
      return (
        content.length === 1 &&
        content[0].tagName === 'a' &&
        String(content[0].properties?.href || '').startsWith('#')
      );
    })
  );
};

const SystemCardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { file } = SYSTEM_CARD_FILES[lang] || SYSTEM_CARD_FILES.en;
  const { frontmatter, content, loading, error } = useMarkdownWithFrontmatter(
    file,
    SYSTEM_CARD_CONTENT_DIR
  );
  // Explicit focus-move on error - language toggle is a full page reload, so
  // error can only go false->true once per mount (same as AboutPage.js).
  const errorRef = useFocusOnChange(error);

  useEffect(() => {
    if (!loading && frontmatter.title) {
      document.title = frontmatter.title;

      const descMeta = document.querySelector('meta[name="description"]');
      if (descMeta && frontmatter.description) {
        descMeta.setAttribute('content', frontmatter.description);
      }
    }
  }, [frontmatter, loading]);

  // The content arrives after the browser's own jump-to-#section on load, so
  // a link straight to a section (e.g. from a how-to guide) has to be
  // scrolled to once the headings exist.
  useEffect(() => {
    if (loading || !content || !window.location.hash) return;
    const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) target.scrollIntoView();
  }, [loading, content]);

  if (loading) {
    return (
      <div className="mb-600 container-custom">
        <StatusMessage loading message={t('common.loading')} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-600 container-custom">
        <h1 className="mb-400">{t('systemCard.title')}</h1>
        <StatusMessage
          variant="error"
          message={t('systemCard.loadError')}
          ref={errorRef}
          tabIndex={-1}
          announce={false}
          announcedVia="focus"
          className="focus-target"
        />
      </div>
    );
  }

  return (
    <div className="mb-600 container-custom">
      <div className="system-card-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={REHYPE_PLUGINS}
          components={{
            // h2/h3 mirror GcdsHeading's defaults (mt-600, mb-300). h1 keeps the
            // app-wide mb-400 instead of GC DS's mb-300.
            h1: ({ node, ...props }) => <h1 className="mb-400" {...props} />,
            h2: ({ node, ...props }) => <h2 className="mt-600 mb-300" {...props} />,
            h3: ({ node, ...props }) => <h3 className="mt-600 mb-300" {...props} />,
            p: ({ children }) => <p className="mb-300">{children}</p>,
            // GCDS's reset applies `ol,ul{list-style:none}`, so markers have to be
            // asked for explicitly (same as HowToPage.js). spcd-1, not -2: the
            // card's list items are mostly short. spcd-0 for "On this page".
            ul: ({ node, children }) => (
              <ul
                className={`list-disc mb-400 text-measure ${
                  isContentsList(node) ? 'canada-ca-list-spcd-0' : 'canada-ca-list-spcd-1'
                }`}
              >
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal mb-400 text-measure canada-ca-list-spcd-1">{children}</ol>
            ),
            a: ({ href, children }) => <a href={href}>{children}</a>,
            img: ({ src, alt }) => <img src={src} alt={alt} className="system-card-image" />,
            pre: ({ node, children }) =>
              isMermaidBlock(node) ? (
                <MermaidDiagram
                  code={node.children[0].children.map((child) => child.value).join('')}
                  label={t('systemCard.diagramLabel')}
                />
              ) : (
                <pre>{children}</pre>
              ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default SystemCardPage;
