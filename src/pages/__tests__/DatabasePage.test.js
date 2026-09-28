/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DatabasePage from '../DatabasePage.js';
import AuthService from '../../services/AuthService.js';
import { waitForAnnouncement } from '../../../test/liveAnnouncer.js';

const mockT = (key) => key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockGetTableCounts, mockDropIndexes } = vi.hoisted(() => ({
  mockGetTableCounts: vi.fn(),
  mockDropIndexes: vi.fn(),
}));

vi.mock('../../services/DataStoreService.js', () => ({
  default: {
    getTableCounts: mockGetTableCounts,
    dropIndexes: mockDropIndexes,
  },
}));

vi.mock('../../services/AuthService.js', () => ({
  default: {
    fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ collections: [] }) }),
  },
}));

vi.mock('../../services/BatchService.js', () => ({ default: {} }));

vi.mock('streamsaver', () => ({
  default: { createWriteStream: vi.fn() },
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsHeading: ({ children }) => <h2>{children}</h2>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('DatabasePage StatusMessage roles', () => {
  afterEach(() => {
    cleanup();
    mockGetTableCounts.mockReset();
  });

  it('announces the initial table-counts load error as role="alert"', async () => {
    mockGetTableCounts.mockRejectedValue(new Error('counts unavailable'));

    render(<DatabasePage lang="en" />);

    await waitForAnnouncement('counts unavailable', 'assertive');
  });

  it('does not announce an error when counts load successfully', async () => {
    mockGetTableCounts.mockResolvedValue({ chats: 5 });

    render(<DatabasePage lang="en" />);

    await waitFor(() => {
      expect(screen.getByText('admin.database.tableRecordCounts')).toBeTruthy();
    });
    expect(document.querySelector('.status-message--error-box')).toBeNull();
  });
});

describe('DatabasePage integrity checks', () => {
  afterEach(() => {
    cleanup();
    mockGetTableCounts.mockReset();
    AuthService.fetch.mockReset();
  });

  it('shows samples through the translated label', async () => {
    AuthService.fetch.mockImplementation(async (url) => ({
      ok: true,
      json: async () => (url.includes('db-integrity-checks')
        ? { count: 2, samples: ['a', 'b'] }
        : { collections: [] }),
    }));
    mockGetTableCounts.mockResolvedValue({});
    render(<DatabasePage lang="en" />);

    fireEvent.click(screen.getAllByText('admin.database.runCheckButton')[0]);

    expect(await screen.findByText('admin.database.breakdownSamples')).toBeTruthy();
    expect(screen.queryByText(/Samples:/)).toBeNull();
  });

  it('shows not run before a check runs', () => {
    mockGetTableCounts.mockResolvedValue({});
    render(<DatabasePage lang="en" />);

    expect(screen.getAllByText('admin.database.notRunLabel')).toHaveLength(12);
  });

  it('names each run button after its check', () => {
    mockGetTableCounts.mockResolvedValue({});
    render(<DatabasePage lang="en" />);

    expect(screen.getByRole('button', {
      name: 'admin.database.runCheckButton – admin.database.checks.orphanCitations',
    })).toBeTruthy();
  });

  it('keeps a running check button enabled but aria-disabled', async () => {
    let finish;
    AuthService.fetch.mockImplementation((url) => (url.includes('db-integrity-checks')
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve({ ok: true, json: async () => ({ collections: [] }) })));
    mockGetTableCounts.mockResolvedValue({});
    render(<DatabasePage lang="en" />);

    const button = screen.getAllByText('admin.database.runCheckButton')[0];
    fireEvent.click(button);

    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('true'));
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(AuthService.fetch.mock.calls.filter(([url]) => url.includes('db-integrity-checks'))).toHaveLength(1);
    finish({ ok: true, json: async () => ({ count: 0 }) });
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBeNull());
  });

  it('announces the count when a check finishes', async () => {
    AuthService.fetch.mockImplementation(async (url) => ({
      ok: true,
      json: async () => (url.includes('db-integrity-checks')
        ? { count: 3 }
        : { collections: [] }),
    }));
    mockGetTableCounts.mockResolvedValue({});
    render(<DatabasePage lang="en" />);

    fireEvent.click(screen.getAllByText('admin.database.runCheckButton')[0]);

    await waitForAnnouncement('admin.database.checks.orphanCitations. admin.database.countLabel 3');
  });
});
