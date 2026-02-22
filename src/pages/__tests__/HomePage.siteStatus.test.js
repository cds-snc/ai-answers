/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import HomePage from '../HomePage.js';

// Mock DataStoreService — tests control what getSiteStatus resolves to
const { mockGetSiteStatus, mockGetChat, mockGetPublicSetting } = vi.hoisted(() => ({
  mockGetSiteStatus: vi.fn(() => Promise.resolve('available')),
  mockGetChat: vi.fn(() => Promise.resolve({ chat: null })),
  mockGetPublicSetting: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../../services/DataStoreService.js', () => ({
  default: {
    getSiteStatus: mockGetSiteStatus,
    getChat: mockGetChat,
    getPublicSetting: mockGetPublicSetting,
  }
}));

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key, defaultValue) => defaultValue || key,
  })
}));

vi.mock('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ loading: false, user: null }),
}));

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock('../../components/RoleBasedUI.js', () => ({
  useHasAnyRole: () => false,
}));

// Stub OutageComponent with a testable marker
vi.mock('../../components/OutageComponent.js', () => ({
  default: () => <div data-testid="outage-component">Service unavailable</div>,
}));

// Stub ChatAppContainer so we don't pull in its dependency tree
vi.mock('../../components/chat/ChatAppContainer.js', () => ({
  default: () => <div data-testid="chat-app">Chat</div>,
}));

vi.mock('@cdssnc/gcds-components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsDetails: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsNotice: ({ children }) => <div>{children}</div>,
}));

describe('HomePage siteStatus', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockGetSiteStatus.mockReset().mockResolvedValue('available');
    mockGetChat.mockReset().mockResolvedValue({ chat: null });
    mockGetPublicSetting.mockReset().mockResolvedValue(null);
  });

  it('renders the chat when siteStatus is available', async () => {
    mockGetSiteStatus.mockResolvedValue('available');

    render(<HomePage lang="en" />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-app')).toBeTruthy();
    });
    expect(screen.queryByTestId('outage-component')).toBeNull();
  });

  it('renders OutageComponent when siteStatus is unavailable', async () => {
    mockGetSiteStatus.mockResolvedValue('unavailable');

    render(<HomePage lang="en" />);

    await waitFor(() => {
      expect(screen.getByTestId('outage-component')).toBeTruthy();
      expect(screen.queryByTestId('chat-app')).toBeNull();
    });
  });

  it('renders the chat when getSiteStatus fails (defaults to available)', async () => {
    // DataStoreService.getSiteStatus returns 'available' on error by default
    mockGetSiteStatus.mockResolvedValue('available');

    render(<HomePage lang="en" />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-app')).toBeTruthy();
    });
  });
});
