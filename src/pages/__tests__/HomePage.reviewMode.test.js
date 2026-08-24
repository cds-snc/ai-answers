/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import HomePage from '../HomePage.js';

const { mockGetChatSessionAvailability, mockGetChat, mockGetPublicSetting } = vi.hoisted(() => ({
  mockGetChatSessionAvailability: vi.fn(() => Promise.resolve({ siteStatus: true, sessionAvailable: true })),
  mockGetChat: vi.fn(() => Promise.resolve({ chat: null })),
  mockGetPublicSetting: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../../services/DataStoreService.js', () => ({
  default: {
    getChatSessionAvailability: mockGetChatSessionAvailability,
    getChat: mockGetChat,
    getPublicSetting: mockGetPublicSetting,
  }
}));

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key) => key,
  })
}));

vi.mock('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ loading: false, user: null }),
}));

// Hoisted so each test can set its own query params before rendering.
let currentSearchParams = new URLSearchParams();
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [currentSearchParams, vi.fn()],
}));

vi.mock('../../components/OutageComponent.js', () => ({
  default: () => <div data-testid="outage-component">Service unavailable</div>,
}));

// Stub ChatAppContainer so we don't pull in its dependency tree - both
// HomePage.js's own live-chat call and ChatReviewPage.js's call render this
// same marker, distinguishable by the readOnly prop it's given.
vi.mock('../../components/chat/ChatAppContainer.js', () => ({
  default: ({ readOnly }) => <div data-testid="chat-app">{readOnly ? 'readonly' : 'live'}</div>,
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsDetails: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsNotice: ({ children }) => <div>{children}</div>,
}));

// Regression: review mode (?chat=...&review=1) used to render straight
// through HomePage.js's own public "ask a new question" chrome (H1
// "AI Answers", subtitle "Get answers to your Canada.ca questions", privacy
// disclosure) - meaningless framing for an admin looking at an
// already-finished chat. It now swaps in ChatReviewPage.js's own
// admin-appropriate header/H1 instead, same URL.
describe('HomePage review mode', () => {
  afterEach(() => {
    cleanup();
    mockGetChatSessionAvailability.mockReset().mockResolvedValue({ siteStatus: true, sessionAvailable: true });
    mockGetChat.mockReset().mockResolvedValue({ chat: null });
    mockGetPublicSetting.mockReset().mockResolvedValue(null);
    currentSearchParams = new URLSearchParams();
  });

  it('renders the review shell (not the public homepage chrome) when review=1', async () => {
    currentSearchParams = new URLSearchParams('chat=abc123&review=1&adminLang=fr');

    render(<HomePage lang="en" />);

    await waitFor(() => {
      expect(screen.getByText('homepage.chat.review.eyebrow')).toBeTruthy();
    });
    expect(screen.getByTestId('chat-app').textContent).toBe('readonly');
    // ChatReviewPage.js's own H1 reuses the same brand-consistent
    // "homepage.title" ("AI Answers") text as the public homepage's H1 -
    // "homepage.chat.review.eyebrow" ("Admin view") is the small eyebrow
    // stacked above it, not a replacement for the H1. The public "Get
    // answers..." *subtitle* is what's actually absent in review mode -
    // that specific key is unique to the public homepage chrome.
    expect(screen.queryByText('homepage.subtitle')).toBeNull();
  });

  it('still renders the normal public homepage chrome with no review param', async () => {
    currentSearchParams = new URLSearchParams();

    render(<HomePage lang="en" />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-app').textContent).toBe('live');
    });
    expect(screen.getByText('homepage.subtitle')).toBeTruthy();
    expect(screen.queryByText('homepage.chat.review.eyebrow')).toBeNull();
  });

  it('a chat= URL without review=1 resumes that chatId live (not read-only), keeping the public chrome', async () => {
    currentSearchParams = new URLSearchParams('chat=abc123');

    render(<HomePage lang="en" />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-app').textContent).toBe('live');
    });
    expect(screen.getByText('homepage.subtitle')).toBeTruthy();
  });
});
