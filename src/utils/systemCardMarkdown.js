// Turns a repo-root system card (SYSTEM_CARD.md / SYSTEM_CARD_FR.md) into the
// markdown SystemCardPage.js renders. Pure - the systemCard plugin in
// vite.config.js does the file reading and serving. See src/config/systemCard.js.
//
// Never throws on bad card content: a typo in a documentation file must not
// stop the whole app from building. A missing image/PDF is shown as
// "unavailable" text instead, and systemCardMarkdown.test.js fails on it so
// it's caught in the pull request.
import { SYSTEM_CARD_CONTENT_DIR, REPO_BLOB_URL, SYSTEM_CARD_BUILD_TEXT } from '../config/systemCard.js';

// Linked files the app serves itself, so they still work when GitHub is down.
const SERVED_ASSET_PATTERN = /\.(jpe?g|png|gif|svg|webp|pdf)$/i;

// The "**English** : [SYSTEM_CARD.md](SYSTEM_CARD.md)" line: the page header's
// language toggle does this job in the app.
const OTHER_LANGUAGE_LINE_PATTERN = /^\*\*[^*]+\*\*\s*:\s*\[SYSTEM_CARD(?:_FR)?\.md\]\(SYSTEM_CARD(?:_FR)?\.md\)\s*\r?\n/m;

// [text](target) and ![alt](target). The card's links have no spaces or
// parentheses in their targets.
const LINK_PATTERN = /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g;

const isRepoRelative = (target) => !/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target);

const yamlString = (value) => JSON.stringify(value);

/**
 * @param {string} source - raw SYSTEM_CARD*.md contents
 * @param {{ lang: 'en'|'fr', description: string, assetExists: (repoPath: string) => boolean }} options
 * @returns {{ markdown: string, assets: string[], missingAssets: string[] }} the
 *   page markdown; the repo-relative paths it now expects under
 *   SYSTEM_CARD_CONTENT_DIR (same path below it); and linked files that don't exist
 */
export function buildSystemCardMarkdown(source, { lang, description, assetExists }) {
  const text = SYSTEM_CARD_BUILD_TEXT[lang];
  const titleMatch = source.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : text.title;

  const assets = new Set();
  const missingAssets = new Set();
  const body = source
    .replace(OTHER_LANGUAGE_LINE_PATTERN, '')
    .replace(LINK_PATTERN, (full, bang, label, target) => {
      if (!isRepoRelative(target)) return full;
      const [repoPath, hash = ''] = target.split(/(?=#)/);

      if (!SERVED_ASSET_PATTERN.test(repoPath)) {
        return `${bang}[${label}](${REPO_BLOB_URL}/${repoPath}${hash})`;
      }

      // A ../ path would be served from outside the content folder, which
      // fails the build - treat it like a missing file instead.
      if (repoPath.split('/').includes('..') || !assetExists(repoPath)) {
        missingAssets.add(repoPath);
        if (bang) return `*${text.imageUnavailable} (${label})*`;
        const unavailable = /\.pdf$/i.test(repoPath) ? text.pdfUnavailable : text.imageUnavailable;
        return `${label} *(${unavailable})*`;
      }

      assets.add(repoPath);
      return `${bang}[${label}](${SYSTEM_CARD_CONTENT_DIR}/${repoPath}${hash})`;
    });

  const frontmatter = [
    '---',
    `title: ${yamlString(title)}`,
    `description: ${yamlString(description)}`,
    '---',
    '',
  ].join('\n');

  return { markdown: frontmatter + body, assets: [...assets], missingAssets: [...missingAssets] };
}
