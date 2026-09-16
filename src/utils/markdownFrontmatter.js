// src/utils/markdownFrontmatter.js
//
// YAML frontmatter parsing, extracted out of useMarkdownWithFrontmatter.js so
// server-side code (server/renderIndexHtml.js, for the About/how-to pages'
// initial <title> - see the comment there for why) can parse the exact same
// markdown files the same way React does on the client, instead of a second
// hand-written parser that can drift from it.
//
// TODO: add js-yaml to package.json `dependencies` (`npm install js-yaml@4.3.1`,
// matching the existing `overrides` pin). This file is now imported by the
// server at startup (server/server.js -> renderIndexHtml.js), but js-yaml is
// only listed under `overrides` - it reaches the production image (`npm ci
// --omit=dev`) purely as a transitive of gray-matter, which is otherwise
// unused. Removing gray-matter would make `node server/server.js` fail at
// module load with "Cannot find package 'js-yaml'" - the whole API down, not
// just a title tag. Flagged by code review on PR #1765.
import { load as loadYaml } from 'js-yaml';

/**
 * Default frontmatter structure
 */
export const DEFAULT_FRONTMATTER = {
  title: '',
  description: '',
  ogImage: null
};

/**
 * Matches a leading YAML frontmatter block: --- on its own line, the YAML body,
 * then a closing --- on its own line. Tolerates CRLF endings.
 */
const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Parse YAML frontmatter from markdown content.
 *
 * Uses js-yaml directly rather than gray-matter: gray-matter calls the
 * `yaml.safeLoad` API that js-yaml 4 removed, and this repo pins js-yaml to 4.x
 * for every dependency via `overrides` in package.json. Under that pin every
 * gray-matter call throws, which previously left the raw frontmatter in the
 * rendered markdown.
 *
 * @param {string} markdown - Raw markdown content
 * @returns {Object} - { frontmatter, contentBody }
 */
export function parseFrontmatter(markdown) {
  // The opening --- must be the very first thing in the file, so drop any BOM.
  const source = markdown.replace(/^﻿/, '');
  const match = source.match(FRONTMATTER_PATTERN);

  if (!match) {
    return { frontmatter: DEFAULT_FRONTMATTER, contentBody: source.trim() };
  }

  // Strip the block whether or not its YAML parses, so malformed frontmatter is
  // never rendered to the page as content.
  const contentBody = source.slice(match[0].length).trim();

  try {
    const data = loadYaml(match[1]) || {};

    // Merge with defaults to ensure all expected fields exist
    return {
      frontmatter: { ...DEFAULT_FRONTMATTER, ...data },
      contentBody
    };
  } catch (err) {
    console.warn(`Failed to parse YAML frontmatter in markdown:`, err.message);
    return { frontmatter: DEFAULT_FRONTMATTER, contentBody };
  }
}
