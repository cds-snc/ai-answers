import { useState, useEffect } from 'react';

/**
 * Hook to fetch and parse About page markdown content
 * Sections are parsed by h2 headings (##)
 *
 * @param {string} lang - Language code ('en' or 'fr')
 * @returns {Object} - { content, sections, loading, error }
 */
export const useAboutContent = (lang = 'en') => {
  const [content, setContent] = useState('');
  const [sections, setSections] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      setError(null);

      try {
        const filename = lang === 'fr' ? 'about-fr.md' : 'about-en.md';
        const response = await fetch(`/content/${filename}`);

        if (!response.ok) {
          throw new Error(`Failed to load content: ${response.status}`);
        }

        const text = await response.text();
        setContent(text);

        // Parse sections by h2 headings
        const parsedSections = parseMarkdownSections(text);
        setSections(parsedSections);
      } catch (err) {
        console.error('Error loading About page content:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [lang]);

  return { content, sections, loading, error };
};

/**
 * Parse markdown content into sections by h2 headings
 * Returns an object with section keys (lowercase, hyphenated) and content
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

export default useAboutContent;
