/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import SystemCardPage, { headingId } from '../SystemCardPage.js';

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: (key) => key }),
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ href, target, children }) => (
    <a href={href} target={target} data-gcds-link>{children}</a>
  ),
}));

const MARKDOWN = `---
title: "Card title"
description: "Card description"
---

# Card

## On this page
- [Résumé exécutif](#résumé-exécutif)

## Résumé exécutif

![Diagram alt](/content/images/d.jpg)

1. First step
2. Second step

[Short PDF](/content/pdf/a.pdf)
`;

describe('SystemCardPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(MARKDOWN) });
  });
  afterEach(() => vi.restoreAllMocks());

  it('fetches the language-specific file', async () => {
    render(<SystemCardPage lang="fr" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/content/fiche-systeme-fr.md'));
  });

  it('gives headings ids that match the in-page links, accents included', async () => {
    const { container } = render(<SystemCardPage lang="en" />);
    await waitFor(() => expect(container.querySelector('#résumé-exécutif')).not.toBeNull());
    expect(headingId('Résumé exécutif')).toBe('résumé-exécutif');
  });

  it('renders the image with alt text, an ordered list, and a back-to-About link', async () => {
    const { container } = render(<SystemCardPage lang="en" />);
    await waitFor(() => expect(screen.queryByAltText('Diagram alt')).not.toBeNull());
    expect(container.querySelector('ol')).not.toBeNull();
    expect(container.querySelector('nav a').getAttribute('href')).toBe('/en/about');
  });

  it('opens PDFs in a new tab via GcdsLink', async () => {
    render(<SystemCardPage lang="en" />);
    const link = await screen.findByText('Short PDF');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('sets the document title from frontmatter', async () => {
    render(<SystemCardPage lang="en" />);
    await waitFor(() => expect(document.title).toBe('Card title'));
  });
});
