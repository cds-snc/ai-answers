import { useState, useEffect } from 'react';
import { load as loadYaml } from 'js-yaml';

/**
 * Default frontmatter structure
 */
const DEFAULT_FRONTMATTER = {
  title: '',
  description: '',
  ogImage: null
};

/**
 * Generic hook to fetch and parse markdown content with YAML frontmatter
 * Frontmatter is extracted from YAML block at top of file (between --- delimiters)
 * Content sections are parsed by h2 headings (##)
 *
 * @param {string} filename - Name of markdown file (e.g., 'about-en.md')
 * @param {string} contentDir - Directory containing markdown files (default: '/content')
 * @returns {Object} - { frontmatter, content, sections, loading, error }
 *
 * @example
 * const { frontmatter, sections, loading, error } = useMarkdownWithFrontmatter('about-en.md');
 * // frontmatter = { title: '...', description: '...', ogImage: '...' }
 * // sections = { title: '...', 'section-key': { heading: '...', content: '...' }, ... }
 */
export const useMarkdownWithFrontmatter = (filename, contentDir = '/content') => {
  const [frontmatter, setFrontmatter] = useState(DEFAULT_FRONTMATTER);
  const [content, setContent] = useState('');
  const [sections, setSections] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Signal to the shell (App.js) that this page manages its own metadata
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.__CUSTOM_METADATA_ACTIVE = true;
    return () => {
      window.__CUSTOM_METADATA_ACTIVE = false;
    };
  }, []);

  useEffect(() => {
    // No filename means the caller has nothing to load (e.g. an unknown guide id);
    // skip the fetch rather than requesting a bogus path.
    if (!filename) {
      setLoading(false);
      return;
    }

    const fetchAndParseContent = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${contentDir}/${filename}`);

        if (!response.ok) {
          throw new Error(`Failed to load content: ${response.status}`);
        }

        const text = await response.text();

        // Parse frontmatter and content
        const { frontmatter: parsedFrontmatter, contentBody } = parseFrontmatter(text);
        const parsedSections = parseMarkdownSections(contentBody);

        setFrontmatter(parsedFrontmatter);
        setContent(contentBody);
        setSections(parsedSections);
      } catch (err) {
        console.error(`Error loading markdown content (${filename}):`, err);
        setError(err.message);
        // Keep defaults on error
        setFrontmatter(DEFAULT_FRONTMATTER);
        setContent('');
        setSections({});
      } finally {
        setLoading(false);
      }
    };

    fetchAndParseContent();
  }, [filename, contentDir]);

  return { frontmatter, content, sections, loading, error };
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
function parseFrontmatter(markdown) {
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

/**
 * Parse markdown content into sections by h2 headings
 * Returns an object with section keys (lowercase, hyphenated) and content
 *
 * @param {string} markdown - Markdown content to parse
 * @returns {Object} - Sections object with title and section keys
 */
function parseMarkdownSections(markdown) {
  const sections = {};

  // Split by h2 headings (## )
  const parts = markdown.split(/^## /gm);

  // First part is content before any h2 (usually the h1 title)
  if (parts[0]) {
    const titleMatch = parts[0].match(/^# (.+)/m);
    if (titleMatch) {
      sections.title = titleMatch[1].trim();
    }
  }

  // Process each h2 section
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const lines = part.split('\n');
    const heading = lines[0].trim();
    const content = lines.slice(1).join('\n').trim();

    // Create a key from the heading (lowercase, replace spaces with hyphens)
    const key = heading
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    sections[key] = {
      heading,
      content
    };
  }

  return sections;
}

export default useMarkdownWithFrontmatter;