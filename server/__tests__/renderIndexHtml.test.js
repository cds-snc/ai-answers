import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import { renderIndexHtml } from '../renderIndexHtml.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The real template, not a hand-written fixture: if index.html's markup
// shape ever changes, the regexes in renderIndexHtml.js should fail loudly
// against it here rather than silently stop matching in production.
const template = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
// public/ mirrors build/ 1:1 for static content (vite build copies it
// unchanged) - using it directly means these tests don't need a build step.
const contentRoot = path.join(__dirname, '../../public');

describe('renderIndexHtml', () => {
  it('leaves the template untouched for a path with no resolvable language', () => {
    expect(renderIndexHtml(template, '/some-unknown-thing')).toBe(template);
  });

  // Bare '/' follows the host, mirroring App.js's own defaultLang rule for
  // which home it renders there - so the French host's root no longer ships
  // an English <title>/lang for the screen reader's one-shot read.
  it('treats bare / on a reponses-ia host as French', () => {
    const html = renderIndexHtml(template, '/', { hostname: 'reponses-ia.alpha.canada.ca' });
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<title>Bêta : Réponses IA</title>');
    expect(html).toContain('<meta name="dcterms.language" content="fra" />');
  });

  it('treats bare / on any other host (or no host) as English', () => {
    expect(renderIndexHtml(template, '/', { hostname: 'ai-answers.alpha.canada.ca' })).toContain('<html lang="en">');
    expect(renderIndexHtml(template, '/')).toContain('<title>Beta: AI Answers</title>');
    // A trailing slash is the same root.
    expect(renderIndexHtml(template, '//', { hostname: 'reponses-ia.alpha.canada.ca' })).toContain('<html lang="fr">');
  });

  it('sets the generic site title and lang for an untitled route (e.g. home)', () => {
    const html = renderIndexHtml(template, '/en');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Beta: AI Answers</title>');
  });

  it('sets the page title, lang, and dcterms.language for a titled English route', () => {
    const html = renderIndexHtml(template, '/en/admin');
    expect(html).toContain('<html lang="en">');
    expect(html).toMatch(/<title>[^<]+ - Beta: AI Answers<\/title>/);
    expect(html).toContain('<meta name="dcterms.language" content="eng" />');
  });

  it('sets the French page title, lang, and dcterms.language for a titled French route', () => {
    const html = renderIndexHtml(template, '/fr/admin');
    expect(html).toContain('<html lang="fr">');
    expect(html).toMatch(/<title>[^<]+ - Bêta : Réponses IA<\/title>/);
    expect(html).toContain('<meta name="dcterms.language" content="fra" />');
    expect(html).toContain(
      '<meta name="description" content="Réponses IA est un agent de discussion IA spécialisé conçu pour les utilisateurs de Canada.ca et de tous les sites Web du gouvernement du Canada." />'
    );
  });

  it('resolves a dynamic-segment route regardless of the id value', () => {
    const html = renderIndexHtml(template, '/en/experimental/analysis/abc123');
    expect(html).toMatch(/<title>[^<]+ - Beta: AI Answers<\/title>/);
  });

  it('mirrors the title into dcterms.title, og:title, and twitter:title', () => {
    const html = renderIndexHtml(template, '/en/admin');
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch[1];
    expect(html).toContain(`<meta name="dcterms.title" content="${title}" />`);
    expect(html).toContain(`<meta property="og:title" content="${title}" />`);
    expect(html).toContain(`<meta property="twitter:title" content="${title}" />`);
  });

  describe('markdown-driven routes (About, how-to guides)', () => {
    it('falls back to the generic site title when no contentRoot is given', () => {
      // Matches the status quo before this fix - not a regression.
      const html = renderIndexHtml(template, '/en/about');
      expect(html).toContain('<title>Beta: AI Answers</title>');
    });

    it('reads the About page title straight from its markdown frontmatter (no site-title suffix)', () => {
      const html = renderIndexHtml(template, '/en/about', { contentRoot });
      expect(html).toContain('<title>About AI Answers</title>');
      expect(html).toContain('<meta name="dcterms.title" content="About AI Answers" />');
    });

    it('reads the French About page title too', () => {
      const html = renderIndexHtml(template, '/fr/a-propos', { contentRoot });
      expect(html).toMatch(/<title>[^<]+<\/title>/);
      expect(html).not.toContain('Bêta : Réponses IA');
    });

    it('reads a how-to guide title from its markdown frontmatter', () => {
      const html = renderIndexHtml(template, '/en/how-to/partner-onboarding', { contentRoot });
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      expect(titleMatch[1]).not.toBe('Beta: AI Answers');
      expect(titleMatch[1]).not.toMatch(/ - Beta: AI Answers$/);
    });

    it('reads each markdown file from disk once, then serves later requests from cache', () => {
      const readSpy = vi.spyOn(fs, 'readFileSync');
      try {
        // Same file as an earlier test in this run - already cached - so
        // trailing-slash and repeat requests must not touch the disk at all.
        renderIndexHtml(template, '/en/about', { contentRoot });
        renderIndexHtml(template, '/en/about/', { contentRoot });
        expect(readSpy).not.toHaveBeenCalled();
        // A file not yet requested in this run is read exactly once.
        renderIndexHtml(template, '/fr/comment-faire/integration-des-partenaires', { contentRoot });
        renderIndexHtml(template, '/fr/comment-faire/integration-des-partenaires', { contentRoot });
        expect(readSpy).toHaveBeenCalledTimes(1);
      } finally {
        readSpy.mockRestore();
      }
    });

    it('falls back to the generic title if the markdown file is missing/unreadable', () => {
      const html = renderIndexHtml(template, '/en/about', {
        contentRoot: path.join(__dirname, 'nonexistent-content-root'),
      });
      expect(html).toContain('<title>Beta: AI Answers</title>');
    });
  });
});
