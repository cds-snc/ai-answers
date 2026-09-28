/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  GcdsFieldset: ({ children, legend }) => <fieldset><legend>{legend}</legend>{children}</fieldset>,
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

describe('DatabasePage import form', () => {
  const postCalls = () => AuthService.fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST');

  const renderWithFile = async () => {
    AuthService.fetch.mockImplementation(async (url, opts) => ({
      ok: true,
      json: async () => (opts?.method === 'POST'
        ? { stats: { inserted: 1, failed: 0, skipped: 0 } }
        : { collections: ['chat', 'question'], collectionsWithoutDates: [] }),
    }));
    mockGetTableCounts.mockResolvedValue({});
    render(<DatabasePage lang="en" />);
    const content = '{"collection":"chat","doc":{}}\n';
    const file = new File([content], 'backup.jsonl');
    // jsdom's Blob has no .text(); the import reads each slice with it.
    file.slice = () => ({ text: async () => content });
    await userEvent.upload(screen.getByLabelText('admin.database.importFileLabel'), file);
    // The table choice stays disabled until the table list loads
    await waitFor(() => expect(screen.getByLabelText('admin.database.importScopeChosen').disabled).toBe(false));
  };

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    AuthService.fetch.mockReset();
  });

  it('rejects "only the tables I choose" with nothing ticked, before confirming', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderWithFile();

    await userEvent.click(screen.getByLabelText('admin.database.importScopeChosen'));
    fireEvent.submit(screen.getByLabelText('admin.database.importFileLabel').closest('form'));

    expect(await screen.findByText('admin.database.importTablesError')).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(postCalls()).toHaveLength(0);
  });

  it('sends nothing when the confirm popup is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderWithFile();

    fireEvent.submit(screen.getByLabelText('admin.database.importFileLabel').closest('form'));

    expect(confirmSpy).toHaveBeenCalledWith('admin.database.importConfirm');
    expect(postCalls()).toHaveLength(0);
  });

  it('disables the table choice when the table list fails to load', async () => {
    AuthService.fetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    mockGetTableCounts.mockResolvedValue({});
    render(<DatabasePage lang="en" />);

    await waitFor(() => expect(AuthService.fetch).toHaveBeenCalled());
    const chosen = screen.getByLabelText('admin.database.importScopeChosen');
    expect(chosen.disabled).toBe(true);
    // Import still runs with the default, as before
    expect(screen.getByLabelText('admin.database.collections.all').checked).toBe(true);
  });

  it('sends only the ticked tables', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderWithFile();

    await userEvent.click(screen.getByLabelText('admin.database.importScopeChosen'));
    await userEvent.click(await screen.findByLabelText('admin.database.collections.question'));
    fireEvent.submit(screen.getByLabelText('admin.database.importFileLabel').closest('form'));

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(JSON.parse(postCalls()[0][1].body).collection).toEqual(['question']);
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
