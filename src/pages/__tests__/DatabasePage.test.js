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
import { getAnnouncedText } from '../../utils/liveAnnouncer.js';

const mockT = vi.fn((key) => key);
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockGetTableCounts, mockDropIndexes, mockCreateIndexes, mockGetIndexRebuildStatus } = vi.hoisted(() => ({
  mockGetTableCounts: vi.fn(),
  mockDropIndexes: vi.fn(),
  mockCreateIndexes: vi.fn(),
  mockGetIndexRebuildStatus: vi.fn(),
}));

vi.mock('../../services/DataStoreService.js', () => ({
  default: {
    getTableCounts: mockGetTableCounts,
    dropIndexes: mockDropIndexes,
    createIndexes: mockCreateIndexes,
    getIndexRebuildStatus: mockGetIndexRebuildStatus,
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

describe('DatabasePage index rebuild', () => {
  const running = { running: true, success: [], failed: [], stillBuilding: [] };
  const finished = { running: false, success: ['Chat', 'Question'], failed: [], stillBuilding: [] };
  const withFailure = {
    running: false,
    success: ['Question'],
    failed: [{ collection: 'Chat', error: 'E11000 duplicate key', code: 11000 }],
    stillBuilding: [],
  };
  const withStillBuilding = { running: false, success: ['Question'], failed: [], stillBuilding: [{ collection: 'Chat', error: 'Existing index build in progress', code: 40333 }] };

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    mockGetTableCounts.mockReset();
    mockCreateIndexes.mockReset();
    mockGetIndexRebuildStatus.mockReset();
    mockT.mockImplementation((key) => key);
  });

  const renderPage = () => {
    mockGetTableCounts.mockResolvedValue({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DatabasePage lang="en" />);
  };

  const clickRebuild = () => fireEvent.click(screen.getByText('admin.database.createIndexesButton'));

  it('says the rebuild started, not that it succeeded', async () => {
    mockGetIndexRebuildStatus.mockResolvedValue(null);
    mockCreateIndexes.mockResolvedValue({ alreadyRunning: false, rebuild: running });
    renderPage();

    clickRebuild();

    await waitForAnnouncement('admin.database.createIndexesStarted');
  });

  it('says a rebuild is already running on a second click', async () => {
    mockGetIndexRebuildStatus.mockResolvedValue(null);
    mockCreateIndexes.mockResolvedValue({ alreadyRunning: true, rebuild: running });
    renderPage();

    clickRebuild();

    await waitForAnnouncement('admin.database.createIndexesAlreadyRunning');
  });

  it('announces when the rebuild finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGetIndexRebuildStatus.mockResolvedValueOnce(null).mockResolvedValue(finished);
    mockCreateIndexes.mockResolvedValue({ alreadyRunning: false, rebuild: running });
    renderPage();

    clickRebuild();
    await waitForAnnouncement('admin.database.createIndexesStarted');
    await vi.advanceTimersByTimeAsync(5000);

    await waitForAnnouncement('admin.database.createIndexesFinished');
  });

  it('announces failures under the rebuild button, raw errors marked as English', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGetIndexRebuildStatus.mockResolvedValueOnce(null).mockResolvedValue(withFailure);
    mockCreateIndexes.mockResolvedValue({ alreadyRunning: false, rebuild: running });
    renderPage();

    clickRebuild();
    await waitForAnnouncement('admin.database.createIndexesStarted');
    await vi.advanceTimersByTimeAsync(5000);

    await waitForAnnouncement('admin.database.createIndexesFailed', 'assertive');
    const detail = screen.getByText('E11000 duplicate key');
    expect(detail.tagName).toBe('CODE');
    expect(detail.getAttribute('lang')).toBe('en');
    expect(screen.getByText('Chat')).toBeTruthy();
    // Heading above the failure list, as before the rebuild ran in the background
    const box = document.querySelector('.status-details-box--error');
    expect(box.querySelector('p').textContent).toBe('admin.database.indexCreationFailed');
  });

  it('says collections already building an index are still building, not failed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGetIndexRebuildStatus.mockResolvedValueOnce(null).mockResolvedValue(withStillBuilding);
    mockCreateIndexes.mockResolvedValue({ alreadyRunning: false, rebuild: running });
    renderPage();

    clickRebuild();
    await waitForAnnouncement('admin.database.createIndexesStarted');
    await vi.advanceTimersByTimeAsync(5000);

    const announced = await waitForAnnouncement('admin.database.createIndexesStillBuilding');
    expect(announced).toContain('admin.database.createIndexesFinished');
    expect(announced).not.toContain('Chat');
    expect(getAnnouncedText('assertive')).toBe('');
    expect(document.querySelector('.status-message--info-box')).toBeTruthy();
    // Said once, above the list; each item keeps the database's own message
    const box = document.querySelector('.status-details-box--info');
    expect(box.querySelector('p').textContent).toBe('admin.database.indexStillBuilding');
    const item = box.querySelector('li');
    expect(item.textContent).toContain('Chat');
    expect(item.textContent).toContain('admin.database.indexCodeLabel');
    const detail = item.querySelector('code');
    expect(detail.textContent).toBe('Existing index build in progress');
    expect(detail.getAttribute('lang')).toBe('en');
  });

  it('splits a real failure and collections still building into two boxes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGetIndexRebuildStatus.mockResolvedValueOnce(null).mockResolvedValue({
      ...withFailure,
      success: [],
      stillBuilding: [{ collection: 'Question', error: 'Existing index build in progress', code: 40333 }],
    });
    mockCreateIndexes.mockResolvedValue({ alreadyRunning: false, rebuild: running });
    renderPage();

    clickRebuild();
    await waitForAnnouncement('admin.database.createIndexesStarted');
    await vi.advanceTimersByTimeAsync(5000);

    const urgent = await waitForAnnouncement('admin.database.createIndexesFailed', 'assertive');
    expect(urgent).not.toContain('admin.database.createIndexesStillBuilding');
    expect(urgent).not.toContain('E11000');
    const polite = await waitForAnnouncement('admin.database.createIndexesStillBuilding');
    expect(polite).not.toContain('Question');

    expect(document.querySelector('.status-message--error-box')).toBeTruthy();
    expect(document.querySelector('.status-message--info-box').textContent).toContain('admin.database.createIndexesStillBuilding');
    const failures = document.querySelector('.status-details-box--error');
    expect(failures.querySelector('li code').textContent).toBe('E11000 duplicate key');
    expect(failures.textContent).not.toContain('Question');
    expect(document.querySelector('.status-details-box--info li').textContent).toContain('Question');
  });

  // Announcements are queued in order, so once the click's "started" is
  // spoken, anything the page load had queued would already be there too.
  const expectNotAnnounced = async (...texts) => {
    mockCreateIndexes.mockResolvedValue({ alreadyRunning: false, rebuild: running });
    clickRebuild();
    const polite = await waitForAnnouncement('admin.database.createIndexesStarted');
    const all = `${polite}\n${getAnnouncedText('assertive')}`;
    texts.forEach((text) => expect(all).not.toContain(text));
  };

  it('shows the last rebuild result when the page opens, without announcing it', async () => {
    mockGetIndexRebuildStatus.mockResolvedValue(withFailure);
    renderPage();

    expect(await screen.findByText('E11000 duplicate key')).toBeTruthy();
    expect(screen.getByText('admin.database.createIndexesFailed', { exact: false })).toBeTruthy();
    await expectNotAnnounced('admin.database.createIndexesFailed');
  });

  it('says when the last rebuild finished', async () => {
    mockT.mockImplementation((key) => (key === 'admin.database.createIndexesFinished' ? 'Finished ({time}).' : key));
    mockGetIndexRebuildStatus.mockResolvedValue({ ...finished, finishedAt: '2026-09-29T18:15:00.000Z' });
    renderPage();

    const expected = `Finished (${new Date('2026-09-29T18:15:00.000Z').toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short' })}).`;
    expect(await screen.findByText(expected, { exact: false })).toBeTruthy();
  });

  it('gives the success and failure counts', async () => {
    const counts = 'Success: {successCount}, Failed: {failCount}.';
    mockT.mockImplementation((key) => (key === 'admin.database.createIndexesCounts' ? counts : key));
    mockGetIndexRebuildStatus.mockResolvedValue({ ...withFailure, stillBuilding: [{ collection: 'User', error: 'busy', code: 40333 }] });
    renderPage();

    // Collections still building are neither
    expect(await screen.findByText('Success: 1, Failed: 1.', { exact: false })).toBeTruthy();
  });

  it('gives the counts when nothing failed too', async () => {
    const counts = 'Success: {successCount}, Failed: {failCount}.';
    mockT.mockImplementation((key) => (key === 'admin.database.createIndexesCounts' ? counts : key));
    mockGetIndexRebuildStatus.mockResolvedValue(finished);
    renderPage();

    expect(await screen.findByText('Success: 2, Failed: 0.', { exact: false })).toBeTruthy();
  });

  it('keeps checking, without announcing, while a rebuild from before is still running', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGetIndexRebuildStatus.mockResolvedValueOnce(running).mockResolvedValue(finished);
    renderPage();

    expect(await screen.findByText('admin.database.createIndexesAlreadyRunning')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(5000);

    expect(await screen.findByText('admin.database.createIndexesFinished', { exact: false })).toBeTruthy();
    await expectNotAnnounced('admin.database.createIndexesAlreadyRunning', 'admin.database.createIndexesFinished');
  });

  it('says the rebuild stopped when the server lost it mid-rebuild', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGetIndexRebuildStatus.mockResolvedValue(null);
    mockCreateIndexes.mockResolvedValue({ alreadyRunning: false, rebuild: running });
    renderPage();

    clickRebuild();
    await waitForAnnouncement('admin.database.createIndexesStarted');
    await vi.advanceTimersByTimeAsync(5000);

    await waitForAnnouncement('admin.database.createIndexesLost');
    expect(document.querySelector('.status-message--warning-box')).toBeTruthy();
  });

  it('says the check failed, and stops checking', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGetIndexRebuildStatus.mockResolvedValueOnce(null).mockRejectedValue(new Error('network down'));
    mockCreateIndexes.mockResolvedValue({ alreadyRunning: false, rebuild: running });
    renderPage();

    clickRebuild();
    await waitForAnnouncement('admin.database.createIndexesStarted');
    await vi.advanceTimersByTimeAsync(5000);

    await waitForAnnouncement('admin.database.indexRebuildStatusError', 'assertive');
    const calls = mockGetIndexRebuildStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(mockGetIndexRebuildStatus.mock.calls.length).toBe(calls);
  });
});
