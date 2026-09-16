/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
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
