/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import HowToPage from '../HowToPage.js';

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key) => key,
  }),
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ href, target, lang, children }) => (
    <a href={href} target={target} data-gcds-link lang={lang}>
      {children}
    </a>
  ),
}));

const GUIDE_MARKDOWN = `---
title: "Test guide title"
description: "Test guide description"
---

# Evaluation-informed answers

Some intro text.

| What you see | Most likely reason |
|---|---|
| No panel | Nothing qualified |

![A screenshot](/content/admin/images/eval-informed-past-evals-used-en.jpg)

See [an in-app guide](/en/how-to/evaluate-answers) or [an external doc](https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md).
`;

describe('HowToPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(GUIDE_MARKDOWN) })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the guide markdown for a known how-to id', async () => {
    render(<HowToPage lang="en" howToId="eval-informed-answers" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Evaluation-informed answers' })).not.toBeNull();
    });
    expect(screen.getByText('Some intro text.')).not.toBeNull();
  });

  it('fetches the language-specific file from the admin content directory', async () => {
    render(<HowToPage lang="fr" howToId="eval-informed-answers" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      '/content/admin/comment-reponses-informees-par-evaluations.md'
    );
  });

  it('renders GFM tables, which the troubleshooting sections rely on', async () => {
    render(<HowToPage lang="en" howToId="eval-informed-answers" />);

    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());
    expect(screen.getByRole('columnheader', { name: 'What you see' })).not.toBeNull();
    expect(screen.getByRole('cell', { name: 'Nothing qualified' })).not.toBeNull();
  });

  it('renders screenshots with their alt text', async () => {
    render(<HowToPage lang="en" howToId="eval-informed-answers" />);

    await waitFor(() => expect(screen.queryByAltText('A screenshot')).not.toBeNull());
    expect(screen.getByAltText('A screenshot').getAttribute('src')).toBe(
      '/content/admin/images/eval-informed-past-evals-used-en.jpg'
    );
  });

  it('renders a back-to-admin link directly after the guide heading', async () => {
    const { container } = render(<HowToPage lang="fr" howToId="eval-informed-answers" />);

    await waitFor(() => expect(container.querySelector('h1')).not.toBeNull());

    const link = container.querySelector('nav a');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/fr/admin');

    // The link must follow the h1, matching the other admin pages' layout.
    const heading = container.querySelector('h1');
    expect(heading.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens external links via GcdsLink in a new tab, and keeps in-app links as plain same-tab anchors', async () => {
    render(<HowToPage lang="en" howToId="eval-informed-answers" />);

    const inAppLink = await screen.findByRole('link', { name: 'an in-app guide' });
    expect(inAppLink.getAttribute('href')).toBe('/en/how-to/evaluate-answers');
    expect(inAppLink.getAttribute('target')).toBeNull();
    expect(inAppLink.hasAttribute('data-gcds-link')).toBe(false);

    const externalLink = screen.getByRole('link', { name: 'an external doc' });
    expect(externalLink.getAttribute('href')).toBe(
      'https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md'
    );
    expect(externalLink.getAttribute('target')).toBe('_blank');
    expect(externalLink.hasAttribute('data-gcds-link')).toBe(true);
  });

  it('shows a not-found message for an unknown how-to id, without fetching', async () => {
    render(<HowToPage lang="en" howToId="does-not-exist" />);

    expect(screen.getByText('admin.howTo.notFound')).not.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
