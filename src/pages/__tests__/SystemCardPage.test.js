/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import SystemCardPage from '../SystemCardPage.js';

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key) => key,
  }),
}));

// mermaid needs a real layout engine; jsdom has none.
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(() => Promise.resolve({ svg: '<svg data-testid="flowchart"></svg>' })),
  },
}));

const CARD_MARKDOWN = `---
title: "Fiche système Réponses IA"
description: "Description"
---

# Fiche système Réponses IA

<dl>
  <dt>Version</dt>
  <dd>1.3</dd>
</dl>

## Sur cette page
- [Résumé exécutif](#résumé-exécutif)

## Résumé exécutif

Texte.

- Point un.
- Point deux, avec un [lien](#résumé-exécutif).

\`\`\`mermaid
flowchart TD
    Q["Question"] --> A["Réponse"]
\`\`\`

<details>
<summary>Description de l'image</summary>

Un organigramme.

</details>
`;

describe('SystemCardPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(CARD_MARKDOWN) })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('fetches the generated file for the page language', async () => {
    render(<SystemCardPage lang="fr" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith('/content/system-card/system-card-fr.md');
  });

  it('gives headings the GitHub-style ids the "on this page" links use', async () => {
    render(<SystemCardPage lang="fr" />);

    const heading = await screen.findByRole('heading', { level: 2, name: 'Résumé exécutif' });
    expect(heading.id).toBe('résumé-exécutif');
    // react-markdown percent-encodes the href; browsers decode it to match the id.
    const href = screen.getByRole('link', { name: 'Résumé exécutif' }).getAttribute('href');
    expect(decodeURIComponent(href)).toBe('#résumé-exécutif');
  });

  it('gives only the "on this page" list the tightest spacing', async () => {
    render(<SystemCardPage lang="fr" />);

    const link = await screen.findByRole('link', { name: 'Résumé exécutif' });
    expect(link.closest('ul').className).toContain('canada-ca-list-spcd-0');
    expect(screen.getByText('Point un.').closest('ul').className).toContain('canada-ca-list-spcd-1');
  });

  it('renders the raw <dl> version block as a real description list', async () => {
    render(<SystemCardPage lang="fr" />);

    expect((await screen.findByRole('term')).textContent).toBe('Version');
    expect(screen.getByRole('definition').textContent).toBe('1.3');
  });

  it('renders the raw <details> image description as a real disclosure', async () => {
    const { container } = render(<SystemCardPage lang="fr" />);

    await screen.findByRole('heading', { level: 1 });
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details.querySelector('summary').textContent).toBe("Description de l'image");
  });

  it('draws mermaid blocks as one labelled image instead of showing the code', async () => {
    render(<SystemCardPage lang="fr" />);

    const diagram = await screen.findByRole('img', { name: 'systemCard.diagramLabel' });
    expect(diagram.querySelector('svg')).not.toBeNull();
    expect(screen.queryByText(/flowchart TD/)).toBeNull();
  });

  it('shows the error with a focus target when the content fails to load', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));
    render(<SystemCardPage lang="en" />);

    const notice = await screen.findByText('systemCard.loadError');
    expect(screen.getByRole('heading', { level: 1, name: 'systemCard.title' })).not.toBeNull();
    const box = notice.closest('.status-message--error-box');
    expect(box.getAttribute('tabindex')).toBe('-1');
    await waitFor(() => expect(document.activeElement).toBe(box));
  });

  it('moves focus to the section a link points at, once the content loads', async () => {
    window.history.replaceState(null, '', '/fr/fiche-systeme#r%C3%A9sum%C3%A9-ex%C3%A9cutif');
    render(<SystemCardPage lang="fr" />);

    const heading = await screen.findByRole('heading', { level: 2, name: 'Résumé exécutif' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(heading.classList.contains('focus-target')).toBe(true);
  });

  it('stays at the top instead of crashing on a malformed section link', async () => {
    window.history.replaceState(null, '', '/en/system-card#50%off');
    render(<SystemCardPage lang="en" />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Résumé exécutif' })).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});
