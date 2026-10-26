import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

// Drift guard for the meta-tag list usePageMetadata.js and renderIndexHtml.js
// both have to touch - same "silently drops a tag" class of bug as AGENTS.md's
// <referring-url> story, applied to meta tags. Parses both files' source text
// (renderIndexHtml.js isn't importable as data - it's a sequence of
// .replace() calls) rather than trusting either list to stay accurate by hand.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientMetaSource = fs.readFileSync(path.join(__dirname, '../../src/hooks/usePageMetadata.js'), 'utf8');
const renderIndexHtmlSource = fs.readFileSync(path.join(__dirname, '../renderIndexHtml.js'), 'utf8');

const parseClientTags = (source) => {
  const found = new Set();
  const pattern = /meta\[(name|property)="([^"]+)"\]/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    found.add(`${match[1]}:${match[2]}`);
  }
  return found;
};

const parseServerTags = (source) => {
  const found = new Set();
  const pattern = /setMetaContent\(html, '(name|property)', '([^']+)'/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    // routeTitleKeys.js-style double-escaping for the regex dots
    // (dcterms\\.title) - undo it to compare against the plain attribute
    // value parseClientTags reads out of usePageMetadata.js's querySelector calls.
    found.add(`${match[1]}:${match[2].replace(/\\\\?\./g, '.')}`);
  }
  return found;
};

// Tags the client effect updates that renderIndexHtml.js doesn't patch
// server-side yet - a real, known gap, not hypothetical drift: all are
// lang-dependent (author/creator/audience text, og/twitter image filenames,
// project-status), so a real French page load shows the English value until
// the client corrects it post-mount. Flagged in code review (PR #1765, #9);
// listed explicitly so closing the gap is a decision, and any new
// client-only tag not added here fails the test below.
const KNOWN_SERVER_SIDE_GAPS = new Set([
  'name:author',
  'name:dcterms.creator',
  'name:dcterms.audience',
  'name:project-status',
  'property:og:image',
  'property:twitter:image',
]);

describe('meta tag sync between usePageMetadata.js (client) and renderIndexHtml.js (server)', () => {
  it("every tag renderIndexHtml.js patches is also one usePageMetadata.js's client effect knows about", () => {
    const clientTags = parseClientTags(clientMetaSource);
    const serverTags = parseServerTags(renderIndexHtmlSource);

    // Sanity check the extraction itself, so a formatting change that
    // breaks the regexes fails loudly here instead of this test silently
    // asserting against empty sets.
    expect(serverTags.size).toBeGreaterThan(5);

    for (const tag of serverTags) {
      expect(clientTags.has(tag), `renderIndexHtml.js patches ${tag}, but usePageMetadata.js's client effect doesn't`).toBe(true);
    }
  });

  it('documents (rather than hides) which client-side tags server-side does not yet cover', () => {
    const clientTags = parseClientTags(clientMetaSource);
    const serverTags = parseServerTags(renderIndexHtmlSource);
    const clientOnly = [...clientTags].filter((tag) => !serverTags.has(tag));

    expect(new Set(clientOnly)).toEqual(KNOWN_SERVER_SIDE_GAPS);
  });
});
