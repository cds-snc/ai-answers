/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import HomePage from '../HomePage.js';

// Mock DataStoreService — tests control what the availability endpoint resolves to
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

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsDetails: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsNotice: ({ children }) => <div>{children}</div>,
}));

describe('HomePage availability', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockGetChatSessionAvailability.mockReset().mockResolvedValue({ siteStatus: true, sessionAvailable: true });
    mockGetChat.mockReset().mockResolvedValue({ chat: null });
    mockGetPublicSetting.mockReset().mockResolvedValue(null);
  });

  it('renders the chat when siteStatus is available', async () => {
    mockGetChatSessionAvailability.mockResolvedValue({ siteStatus: true, sessionAvailable: true });

    render(<HomePage lang="en" />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-app')).toBeTruthy();
    });
    expect(screen.queryByTestId('outage-component')).toBeNull();
  });

  it('renders OutageComponent when siteStatus is unavailable', async () => {
    mockGetChatSessionAvailability.mockResolvedValue({ siteStatus: false, sessionAvailable: true });

    render(<HomePage lang="en" />);

    await waitFor(() => {
      expect(screen.getByTestId('outage-component')).toBeTruthy();
      expect(screen.queryByTestId('chat-app')).toBeNull();
    });
  });

  it('renders OutageComponent when session capacity is unavailable', async () => {
    mockGetChatSessionAvailability.mockResolvedValue({ siteStatus: true, sessionAvailable: false });

    render(<HomePage lang="en" />);

    await waitFor(() => {
      expect(screen.getByTestId('outage-component')).toBeTruthy();
      expect(screen.queryByTestId('chat-app')).toBeNull();
    });
  });
});
