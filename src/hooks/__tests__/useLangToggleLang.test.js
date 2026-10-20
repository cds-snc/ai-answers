/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';
import { useLangToggleLang } from '../useLangToggleLang.js';

// Stand-ins with the real nesting: gcds-header -> shadow gcds-lang-toggle ->
// shadow gcds-link (no lang, as GC DS renders it today). Like the real
// custom-elements build, they have no componentOnReady.
const defineStub = (tag, renderShadow) => {
  if (customElements.get(tag)) return;
  customElements.define(tag, class extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.attachShadow({ mode: 'open' }).innerHTML = renderShadow();
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

  it('updates lang when the page language changes', async () => {
    const { container, rerender } = render(<Host lang="en" />);
    await waitFor(() => expect(findLink(container).getAttribute('lang')).toBe('fr'));
    rerender(<Host lang="fr" />);
    await waitFor(() => expect(findLink(container).getAttribute('lang')).toBe('en'));
  });

  // Real page load: the React wrapper sets langHref after gcds-header's first
  // render, so the toggle only shows up afterwards.
  it('sets lang on a language link that appears after the header loads', async () => {
    const { container } = render(<Host lang="en" />);
    const shadow = container.querySelector('gcds-header').shadowRoot;
    shadow.innerHTML = '';
    await new Promise((resolve) => setTimeout(resolve, 20));
    shadow.innerHTML = '<gcds-lang-toggle href="/fr"></gcds-lang-toggle>';
    await waitFor(() => expect(findLink(container).getAttribute('lang')).toBe('fr'));
  });

  // Real page load: each GC DS element renders on its own schedule, so the
  // toggle can be there before it has drawn its link.
  it('sets lang on a link the toggle draws after the toggle appears', async () => {
    const { container } = render(<Host lang="fr" />);
    const toggleShadow = container.querySelector('gcds-header').shadowRoot
      .querySelector('gcds-lang-toggle').shadowRoot;
    toggleShadow.innerHTML = '';
    await new Promise((resolve) => setTimeout(resolve, 20));
    toggleShadow.innerHTML = '<gcds-link href="/en"><span>English</span><abbr>en</abbr></gcds-link>';
    await waitFor(() => expect(findLink(container).getAttribute('lang')).toBe('en'));
  });
});
