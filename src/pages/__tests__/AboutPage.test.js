/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, waitFor } from '@testing-library/react';
import AboutPage from '../AboutPage.js';

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key) => key,
  }),
}));

const ABOUT_MARKDOWN = `---
title: "About AI Answers"
description: "About page description"
---

# About AI Answers

## Overview

Some overview text.
`;

describe('AboutPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the overview section for a successful fetch', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(ABOUT_MARKDOWN) })
    );

    render(<AboutPage lang="en" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'About AI Answers' })).not.toBeNull();
    });
    expect(screen.getByText('Some overview text.')).not.toBeNull();
  });

  // Real content files: AboutPage only shows a section whose heading slug
  // matches its hardcoded key, and the French one drops the accent in "système".
  it.each([
    ['en', 'about-en.md', 'System card documentation', '/en/system-card'],
    ['fr', 'about-fr.md', 'Documentation de la fiche système', '/fr/fiche-systeme'],
  ])('shows the %s system card section linking to the in-app page', async (lang, file, heading, href) => {
    const markdown = fs.readFileSync(path.resolve('public/content', file), 'utf8');
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(markdown) })
    );

    render(<AboutPage lang={lang} />);

    const section = (await screen.findByRole('heading', { level: 2, name: heading })).closest('section');
    expect(section.querySelector('a').getAttribute('href')).toBe(href);
  });

  it('moves focus to the load-error message when the fetch fails', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('boom') })
    );

    render(<AboutPage lang="en" />);

    const notice = await screen.findByText('aboutPage.loadError');
    const box = notice.closest('.status-message--error-box');
    expect(box.getAttribute('tabindex')).toBe('-1');
    await waitFor(() => expect(document.activeElement).toBe(box));
  });
});
