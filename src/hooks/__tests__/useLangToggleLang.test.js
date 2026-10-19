/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { useLangToggleLang } from '../useLangToggleLang.js';

// Stand-ins with the real nesting: gcds-header -> shadow gcds-lang-toggle ->
// shadow gcds-link (no lang, as GC DS renders it today), each exposing
// Stencil's componentOnReady.
const defineStub = (tag, renderShadow) => {
  if (customElements.get(tag)) return;
  customElements.define(tag, class extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.attachShadow({ mode: 'open' }).innerHTML = renderShadow();
    }
    componentOnReady() {
      return Promise.resolve(this);
    }
  });
};
defineStub('gcds-header', () => '<gcds-lang-toggle href="/fr"></gcds-lang-toggle>');
defineStub('gcds-lang-toggle', () => '<gcds-link href="/fr"><span>Français</span><abbr>fr</abbr></gcds-link>');
defineStub('gcds-link', () => '<a part="link"><slot></slot></a>');

const Host = ({ lang }) => {
  useLangToggleLang(lang);
  return <gcds-header />;
};

const findLink = (container) =>
  container.querySelector('gcds-header').shadowRoot
    .querySelector('gcds-lang-toggle').shadowRoot
    .querySelector('gcds-link');

describe('useLangToggleLang', () => {
  afterEach(cleanup);

  it('sets lang="fr" on the language link of an English page', async () => {
    const { container } = render(<Host lang="en" />);
    await waitFor(() => expect(findLink(container).getAttribute('lang')).toBe('fr'));
  });

  it('sets lang="en" on the language link of a French page', async () => {
    const { container } = render(<Host lang="fr" />);
    await waitFor(() => expect(findLink(container).getAttribute('lang')).toBe('en'));
  });

  it('warns instead of throwing when the header has no language link', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const NoToggle = () => {
        useLangToggleLang('en');
        return <gcds-header />;
      };
      const { container } = render(<NoToggle />);
      container.querySelector('gcds-header').shadowRoot.innerHTML = '';
      await waitFor(() => expect(warn).toHaveBeenCalled());
    } finally {
      warn.mockRestore();
    }
  });
});
