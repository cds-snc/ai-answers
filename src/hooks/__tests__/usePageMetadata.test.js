/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, afterEach } from 'vitest';
import { usePageMetadata } from '../usePageMetadata.js';

const t = (key) => ({ 'notFound.title': 'Page not found', 'admin.title': 'Admin', 'admin.partnerTitle': 'Partner home', 'homepage.chat.review.eyebrow': 'Chat review' }[key] || key);

let role;
const Host = () => {
  usePageMetadata('en', t, role);
  return null;
};

// Mirrors App.js's route handles.
const routes = [
  { path: '/en', element: <Host />, handle: { skipRouteFocus: true, canadaCaTitle: true } },
  { path: '/en/admin', element: <Host />, handle: { titleKey: 'admin.title', partnerTitleKey: 'admin.partnerTitle' } },
  { path: '/en/logout', element: <Host /> },
  { path: '*', element: <Host />, handle: { is404: true, titleKey: 'notFound.title', canadaCaTitle: true } },
];

const titleAt = (url) => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [url] })} />);
  return document.title;
};

describe('usePageMetadata title', () => {
  afterEach(() => {
    cleanup();
    role = undefined;
  });

  it('adds the Canada.ca suffix on the chat home', () => {
    expect(titleAt('/en')).toBe('Beta: AI Answers - Canada.ca');
  });

  it('adds the Canada.ca suffix on the 404 page', () => {
    expect(titleAt('/en/nope')).toBe('Page not found - Beta: AI Answers - Canada.ca');
  });

  it('leaves the suffix off chat review mode, which shares the home route', () => {
    expect(titleAt('/en?chat=abc&review=1')).toBe('Chat review - Beta: AI Answers');
  });

  it('leaves the suffix off admin and logout pages', () => {
    expect(titleAt('/en/admin')).toBe('Admin - Beta: AI Answers');
    expect(titleAt('/en/logout')).toBe('Beta: AI Answers');
  });

  it('uses the partner title on admin home for partners', () => {
    role = 'partner';
    expect(titleAt('/en/admin')).toBe('Partner home - Beta: AI Answers');
  });
});
