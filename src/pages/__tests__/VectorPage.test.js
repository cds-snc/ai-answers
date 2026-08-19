/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VectorPage from '../VectorPage.js';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

const mockT = (key) => key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const {
  mockReinitialize,
  mockStartMetadataBackfillJob,
  mockStopMetadataBackfillJob,
  mockClearMetadata,
  mockGetMetadataStatus,
  mockGetMetadataBackfillJob,
} = vi.hoisted(() => ({
  mockReinitialize: vi.fn(),
  mockStartMetadataBackfillJob: vi.fn(),
  mockStopMetadataBackfillJob: vi.fn(),
  mockClearMetadata: vi.fn(),
  mockGetMetadataStatus: vi.fn(),
  mockGetMetadataBackfillJob: vi.fn().mockResolvedValue({ job: null }),
}));
vi.mock('../../services/VectorService.js', () => ({
  default: {
    reinitialize: mockReinitialize,
    getMetadataBackfillJob: mockGetMetadataBackfillJob,
    getStats: vi.fn(),
    getMetadataStatus: mockGetMetadataStatus,
    lookupMetadata: vi.fn(),
    startMetadataBackfillJob: mockStartMetadataBackfillJob,
    stopMetadataBackfillJob: mockStopMetadataBackfillJob,
    clearMetadata: mockClearMetadata,
    runDocdb8CapabilityTest: vi.fn(),
  },
}));

const { mockGenerateEmbeddings } = vi.hoisted(() => ({ mockGenerateEmbeddings: vi.fn() }));
vi.mock('../../services/DataStoreService.js', () => ({
  default: { generateEmbeddings: mockGenerateEmbeddings },
}));
vi.mock('../../components/admin/SimilarChatsDashboard.js', () => ({ default: () => null }));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsDetails: ({ children }) => <details>{children}</details>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

const resetMocks = () => {
  mockReinitialize.mockReset();
  mockStartMetadataBackfillJob.mockReset();
  mockStopMetadataBackfillJob.mockReset();
  mockClearMetadata.mockReset();
  mockGenerateEmbeddings.mockReset();
  mockGetMetadataStatus.mockReset();
  mockGetMetadataBackfillJob.mockReset().mockResolvedValue({ job: null });
  vi.restoreAllMocks();
};

describe('VectorPage StatusMessage roles (reinitialize index)', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('announces a failed reinitialize as role="alert"', async () => {
    mockReinitialize.mockRejectedValue(new Error('index build failed'));

    renderWithRouter(<VectorPage lang="en" />);

    const button = await screen.findByText('vector.reinitializeIndex');
    fireEvent.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('index build failed');
  });

  it('announces a successful reinitialize as role="status", not window.alert()', async () => {
    const alertSpy = vi.spyOn(window, 'alert');
    mockReinitialize.mockResolvedValue({});

    renderWithRouter(<VectorPage lang="en" />);

    const button = await screen.findByText('vector.reinitializeIndex');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('vector.indexCreatedSuccess')).toBeTruthy();
    });
    expect(screen.getByText('vector.indexCreatedSuccess').closest('[role="status"]')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows no error state before any action', async () => {
    renderWithRouter(<VectorPage lang="en" />);

    await waitFor(() => {
      expect(screen.getByText('vector.reinitializeIndex')).toBeTruthy();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('VectorPage embedding generation — was window.alert(), now StatusMessage', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('announces a successful embedding run (remaining: 0) as role="status"', async () => {
    const alertSpy = vi.spyOn(window, 'alert');
    mockGenerateEmbeddings.mockResolvedValue({ remaining: 0, hasMore: false });

    renderWithRouter(<VectorPage lang="en" />);

    fireEvent.click(await screen.findByText('vector.generateEmbeddings'));

    await waitFor(() => {
      expect(screen.getByText('vector.allEmbeddingsGenerated')).toBeTruthy();
    });
    expect(screen.getByText('vector.allEmbeddingsGenerated').closest('[role="status"]')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('announces a failed embedding run as role="alert"', async () => {
    mockGenerateEmbeddings.mockRejectedValue(new Error('boom'));

    renderWithRouter(<VectorPage lang="en" />);

    fireEvent.click(await screen.findByText('vector.generateEmbeddings'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('vector.generateEmbeddingsFailed');
  });

  it('shows a distinct "regenerated" success message for Regenerate embeddings, not the same text as Generate', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGenerateEmbeddings.mockResolvedValue({ remaining: 0, hasMore: false });

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.regenerateEmbeddings'));

    await waitFor(() => {
      expect(screen.getByText('vector.allEmbeddingsRegenerated')).toBeTruthy();
    });
    expect(screen.queryByText('vector.allEmbeddingsGenerated')).toBeNull();
  });

  it('shows a distinct "regenerate failed" message for a failed Regenerate, not the plain generate-failed text', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGenerateEmbeddings.mockRejectedValue(new Error('boom'));

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.regenerateEmbeddings'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('vector.regenerateEmbeddingsFailed');
  });
});

describe('VectorPage metadata backfill delay — field-tied validation, not a page-level alert', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('rejects an out-of-range delay via FeedbackInlineError tied to the input, not role="alert"', async () => {
    const alertSpy = vi.spyOn(window, 'alert');
    renderWithRouter(<VectorPage lang="en" />);

    const delayInput = await screen.findByLabelText('vector.metadataDelayLabel');
    fireEvent.change(delayInput, { target: { value: '9999' } });
    fireEvent.click(screen.getByText('vector.backfillEmptyMetadata'));

    await waitFor(() => {
      expect(screen.getByText('vector.metadataDelayInvalid')).toBeTruthy();
    });
    expect(delayInput.getAttribute('aria-describedby')).toBe('metadata-backfill-delay-seconds-error');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockStartMetadataBackfillJob).not.toHaveBeenCalled();
  });

  it('announces a failed backfill start as role="alert"', async () => {
    mockStartMetadataBackfillJob.mockRejectedValue(new Error('backfill boom'));

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.backfillEmptyMetadata'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('vector.metadataBackfillFailed');
  });
});

describe('VectorPage metadata clear — was window.alert(), now StatusMessage', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('announces a successful clear as role="status"', async () => {
    const alertSpy = vi.spyOn(window, 'alert');
    mockClearMetadata.mockResolvedValue({});

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.clearMetadata'));

    await waitFor(() => {
      expect(screen.getByText('vector.metadataClearSuccess')).toBeTruthy();
    });
    expect(screen.getByText('vector.metadataClearSuccess').closest('[role="status"]')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('announces a failed clear as role="alert"', async () => {
    mockClearMetadata.mockRejectedValue(new Error('clear boom'));

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.clearMetadata'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('vector.metadataClearFailed');
  });
});

describe('VectorPage stop backfill — was silent on success, wrong error text on failure', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('announces a successful stop via a persistent sr-only region, not a visible box', async () => {
    mockGetMetadataBackfillJob.mockResolvedValue({
      job: { id: 'job-1', status: 'running', processed: 3 },
    });
    mockStopMetadataBackfillJob.mockResolvedValue({ job: { id: 'job-1', status: 'stopped', processed: 3 } });

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.stopMetadataBackfill'));

    const announcement = await screen.findByText('vector.metadataBackfillStoppedAnnouncement');
    expect(announcement.className).toContain('sr-only');
    expect(announcement.closest('[role="status"]')).toBeTruthy();
    // Not the box treatment used for real outcomes elsewhere.
    expect(announcement.closest('.status-message--success-box')).toBeNull();
  });

  it('announces a failed stop with its own text, not the backfill-start failure text', async () => {
    mockGetMetadataBackfillJob.mockResolvedValue({
      job: { id: 'job-1', status: 'running', processed: 3 },
    });
    mockStopMetadataBackfillJob.mockRejectedValue(new Error('stop boom'));

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.stopMetadataBackfill'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('vector.metadataBackfillStopFailed');
    expect(alert.textContent).not.toContain('vector.metadataBackfillFailed');
  });
});

describe('VectorPage metadata lookup chat ID — field-tied validation, not a page-level alert', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('rejects an empty chat ID via FeedbackInlineError tied to the input, not role="alert"', async () => {
    const alertSpy = vi.spyOn(window, 'alert');
    renderWithRouter(<VectorPage lang="en" />);

    fireEvent.click(await screen.findByText('vector.metadataLookup.lookup'));

    await waitFor(() => {
      expect(screen.getByText('vector.metadataLookup.chatIdRequired')).toBeTruthy();
    });
    const chatIdInput = screen.getByLabelText('vector.metadataLookup.chatIdLabel');
    expect(chatIdInput.getAttribute('aria-describedby')).toBe('metadata-lookup-chat-id-error');
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('VectorPage metadata status — was a plain <p>, now StatusMessage', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('announces "complete" as role="status" with variant=success', async () => {
    mockGetMetadataStatus.mockResolvedValue({
      complete: true,
      totalEmbeddings: 10,
      recordsRequiringMetadata: 10,
      recordsWithMetadata: 10,
      recordsMissingMetadata: 0,
    });

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.metadataStatus.check'));

    const status = await screen.findByText('vector.metadataStatus.complete');
    expect(status.closest('[role="status"]')).toBeTruthy();
    expect(status.closest('.status-message--success-box')).toBeTruthy();
  });

  it('announces "incomplete" as role="status" with variant=info, not warning', async () => {
    mockGetMetadataStatus.mockResolvedValue({
      complete: false,
      totalEmbeddings: 10,
      recordsRequiringMetadata: 10,
      recordsWithMetadata: 7,
      recordsMissingMetadata: 3,
    });

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.metadataStatus.check'));

    const status = await screen.findByText('vector.metadataStatus.incomplete');
    expect(status.closest('[role="status"]')).toBeTruthy();
    expect(status.closest('.status-message--info-box')).toBeTruthy();
    expect(status.closest('.status-message--warning-box')).toBeNull();
  });
});

describe('VectorPage metadata backfill job status, discovered by polling', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
    vi.useRealTimers();
  });

  it('dismisses a stale failed job\'s message/progress once "Clear metadata" runs, without waiting for a different job', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGetMetadataBackfillJob.mockResolvedValue({
      job: { id: 'job-1', status: 'failed', processed: 5 },
    });
    mockClearMetadata.mockResolvedValue({});

    renderWithRouter(<VectorPage lang="en" />);

    await screen.findByText('vector.metadataBackfillFailed');
    expect(screen.getByText(/vector\.metadataProcessed/)).toBeTruthy();

    fireEvent.click(screen.getByText('vector.clearMetadata'));
    await screen.findByText('vector.metadataClearSuccess');

    // The mocked job record is unchanged — still "failed" — so this proves
    // the poll itself is now skipping it, not that the server happened to
    // stop reporting a failure.
    await vi.advanceTimersByTimeAsync(5000);

    expect(screen.queryByText('vector.metadataBackfillFailed')).toBeNull();
    expect(screen.queryByText(/vector\.metadataProcessed/)).toBeNull();
    expect(screen.getByText('vector.metadataClearSuccess')).toBeTruthy();
  });

  it('announces an asynchronously-failed job (found by polling, not a direct catch) as role="alert"', async () => {
    mockGetMetadataBackfillJob.mockResolvedValue({
      job: { id: 'job-1', status: 'failed', processed: 5 },
    });

    renderWithRouter(<VectorPage lang="en" />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('vector.metadataBackfillFailed');
  });

  it('announces an asynchronously-completed job (found by polling) as role="status", not silently', async () => {
    mockGetMetadataBackfillJob.mockResolvedValue({
      job: { id: 'job-1', status: 'completed', processed: 10 },
    });

    renderWithRouter(<VectorPage lang="en" />);

    const status = await screen.findByText('vector.metadataBackfillCompleted');
    expect(status.closest('[role="status"]')).toBeTruthy();
    expect(status.closest('.status-message--success-box')).toBeTruthy();
  });
});
