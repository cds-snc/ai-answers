/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMarkdownWithFrontmatter } from '../useMarkdownWithFrontmatter.js';

const withFetch = (body) => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) })
  );
};

const load = async (body, filename = 'guide.md', dir = '/content/admin') => {
  withFetch(body);
  const { result } = renderHook(() => useMarkdownWithFrontmatter(filename, dir));
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
};

describe('useMarkdownWithFrontmatter', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Regression: an npm `overrides` pin of js-yaml to 4.x broke gray-matter,
  // whose safeLoad call throws under js-yaml 4. Every parse fell into the catch
  // and the raw frontmatter was rendered onto the page as content.
  it('strips the frontmatter block from the content', async () => {
    const result = await load(
      '---\ntitle: "A title"\ndescription: "A description"\n---\n\n# Heading\n\nBody text.'
    );

    expect(result.current.content).not.toContain('title:');
    expect(result.current.content).not.toContain('---');
    expect(result.current.content.startsWith('# Heading')).toBe(true);
  });

  it('exposes the parsed frontmatter values', async () => {
    const result = await load(
      '---\ntitle: "A title"\ndescription: "A description"\n---\n\n# Heading'
    );

    expect(result.current.frontmatter.title).toBe('A title');
    expect(result.current.frontmatter.description).toBe('A description');
  });

  it('handles a file with no frontmatter', async () => {
    const result = await load('# Just a heading\n\nBody text.');

    expect(result.current.frontmatter.title).toBe('');
    expect(result.current.content.startsWith('# Just a heading')).toBe(true);
  });

  it('strips the block even when the YAML is malformed, rather than rendering it', async () => {
    const result = await load('---\ntitle: "unterminated\n  bad: [\n---\n\n# Heading');

    expect(result.current.content).not.toContain('title:');
    expect(result.current.content.startsWith('# Heading')).toBe(true);
    expect(result.current.frontmatter.title).toBe('');
  });

  it('tolerates CRLF line endings', async () => {
    const result = await load('---\r\ntitle: "A title"\r\n---\r\n\r\n# Heading');

    expect(result.current.frontmatter.title).toBe('A title');
    expect(result.current.content).not.toContain('title:');
  });

  it('parses sections by h2 heading', async () => {
    const result = await load(
      '---\ntitle: "T"\n---\n\n# Title\n\n## First section\n\nFirst body.\n\n## Second section\n\nSecond body.'
    );

    expect(result.current.sections.title).toBe('Title');
    expect(result.current.sections['first-section'].heading).toBe('First section');
    expect(result.current.sections['first-section'].content).toBe('First body.');
    expect(result.current.sections['second-section'].heading).toBe('Second section');
  });

  it('does not fetch when no filename is given', async () => {
    withFetch('');
    const { result } = renderHook(() => useMarkdownWithFrontmatter(null, '/content/admin'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
