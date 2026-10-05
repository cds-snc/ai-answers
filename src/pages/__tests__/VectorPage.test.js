/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VectorPage from '../VectorPage.js';
import { waitForAnnouncement } from '../../../test/liveAnnouncer.js';
import { getAnnouncedTexts } from '../../utils/liveAnnouncer.js';

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
  mockRunDocdb8CapabilityTest,
  mockLookupMetadata,
  mockGetStats,
} = vi.hoisted(() => ({
  mockReinitialize: vi.fn(),
  mockStartMetadataBackfillJob: vi.fn(),
  mockStopMetadataBackfillJob: vi.fn(),
  mockClearMetadata: vi.fn(),
  mockGetMetadataStatus: vi.fn(),
  mockGetMetadataBackfillJob: vi.fn().mockResolvedValue({ job: null }),
  mockRunDocdb8CapabilityTest: vi.fn(),
  mockLookupMetadata: vi.fn(),
  mockGetStats: vi.fn(),
}));
vi.mock('../../services/VectorService.js', () => ({
  default: {
    reinitialize: mockReinitialize,
    getMetadataBackfillJob: mockGetMetadataBackfillJob,
    getStats: mockGetStats,
    getMetadataStatus: mockGetMetadataStatus,
    lookupMetadata: mockLookupMetadata,
    startMetadataBackfillJob: mockStartMetadataBackfillJob,
    stopMetadataBackfillJob: mockStopMetadataBackfillJob,
    clearMetadata: mockClearMetadata,
    runDocdb8CapabilityTest: mockRunDocdb8CapabilityTest,
  },
}));

const { mockGenerateEmbeddings, mockGetChat, mockSearchChats } = vi.hoisted(() => ({
  mockGenerateEmbeddings: vi.fn(),
  mockGetChat: vi.fn(),
  mockSearchChats: vi.fn(),
}));
vi.mock('../../services/DataStoreService.js', () => ({
  default: { generateEmbeddings: mockGenerateEmbeddings, getChat: mockGetChat, searchChats: mockSearchChats },
}));
vi.mock('../../components/admin/SimilarChatsDashboard.js', () => ({ default: () => null }));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsHeading: ({ children, tag: Tag = 'h2', id }) => <Tag id={id}>{children}</Tag>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsButton: ({ children, onClick, disabled, buttonRole }) => (
    <button onClick={onClick} disabled={disabled} data-role={buttonRole}>{children}</button>
  ),
  GcdsDetails: ({ children, tabIndex }) => <details tabIndex={tabIndex}>{children}</details>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

const resetMocks = () => {
  mockReinitialize.mockReset();
  mockGetStats.mockReset();
  mockStartMetadataBackfillJob.mockReset();
  mockStopMetadataBackfillJob.mockReset();
  mockClearMetadata.mockReset();
  mockGenerateEmbeddings.mockReset();
  mockGetMetadataStatus.mockReset();
  mockGetMetadataBackfillJob.mockReset().mockResolvedValue({ job: null });
  mockRunDocdb8CapabilityTest.mockReset();
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

    await waitForAnnouncement('index build failed', 'assertive');
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
    expect(screen.getByText('vector.indexCreatedSuccess', { selector: '[class*="status-message--"]' })).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('refreshes stats already on screen after a successful reinitialize, keeping the success message', async () => {
    mockGetStats.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 2 });
    mockReinitialize.mockResolvedValue({});
    renderWithRouter(<VectorPage lang="en" />);

    fireEvent.click(await screen.findByText('vector.fetchStats'));
    await waitFor(() => expect(screen.getByText(/"count": 1/)).toBeTruthy());

    fireEvent.click(screen.getByText('vector.reinitializeIndex'));
    await waitFor(() => expect(screen.getByText(/"count": 2/)).toBeTruthy());
    expect(screen.getByText('vector.indexCreatedSuccess')).toBeTruthy();
    expect(mockGetStats).toHaveBeenCalledTimes(2);
  });

  it('does not fetch stats after reinitialize when none were on screen', async () => {
    mockReinitialize.mockResolvedValue({});
    renderWithRouter(<VectorPage lang="en" />);

    fireEvent.click(await screen.findByText('vector.reinitializeIndex'));
    await waitFor(() => expect(screen.getByText('vector.indexCreatedSuccess')).toBeTruthy());
    expect(mockGetStats).not.toHaveBeenCalled();
  });

  it('drops the old stats and shows the stats error when the refresh fails', async () => {
    mockGetStats.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error('stats boom'));
    mockReinitialize.mockResolvedValue({});
    renderWithRouter(<VectorPage lang="en" />);

    fireEvent.click(await screen.findByText('vector.fetchStats'));
    await waitFor(() => expect(screen.getByText(/"count": 1/)).toBeTruthy());

    fireEvent.click(screen.getByText('vector.reinitializeIndex'));
    await waitFor(() => expect(screen.queryByText(/"count": 1/)).toBeNull());
    expect(screen.getByText('vector.indexCreatedSuccess')).toBeTruthy();
    await waitForAnnouncement('stats boom', 'assertive');
  });

  it('shows no error state before any action', async () => {
    renderWithRouter(<VectorPage lang="en" />);

    await waitFor(() => {
      expect(screen.getByText('vector.reinitializeIndex')).toBeTruthy();
    });
    expect(document.querySelector('.status-message--error-box')).toBeNull();
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

    fireEvent.click(await screen.findByRole('button', { name: 'vector.generateEmbeddings' }));

    await waitFor(() => {
      expect(screen.getByText('vector.allEmbeddingsGenerated')).toBeTruthy();
    });
    expect(screen.getByText('vector.allEmbeddingsGenerated', { selector: '[class*="status-message--"]' })).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('announces a failed embedding run as role="alert"', async () => {
    mockGenerateEmbeddings.mockRejectedValue(new Error('boom'));

    renderWithRouter(<VectorPage lang="en" />);

    fireEvent.click(await screen.findByRole('button', { name: 'vector.generateEmbeddings' }));

    await waitForAnnouncement('vector.generateEmbeddingsFailed', 'assertive');
  });

  it('shows a distinct "regenerated" success message for Regenerate embeddings, not the same text as Generate', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGenerateEmbeddings.mockResolvedValue({ remaining: 0, hasMore: false });

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByLabelText('vector.embeddingScope.all'));
    fireEvent.click(screen.getByRole('button', { name: 'vector.regenerateEmbeddings' }));

    await waitFor(() => {
      expect(screen.getByText('vector.allEmbeddingsRegenerated')).toBeTruthy();
    });
    expect(screen.queryByText('vector.allEmbeddingsGenerated')).toBeNull();
  });

  it('shows a distinct "regenerate failed" message for a failed Regenerate, not the plain generate-failed text', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGenerateEmbeddings.mockRejectedValue(new Error('boom'));

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByLabelText('vector.embeddingScope.all'));
    fireEvent.click(screen.getByRole('button', { name: 'vector.regenerateEmbeddings' }));

    await waitForAnnouncement('vector.regenerateEmbeddingsFailed', 'assertive');
  });
});

describe('VectorPage embedding scope radios pick what the one button does', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('defaults to missing only: blue button, no confirm, regenerateAll false', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockGenerateEmbeddings.mockResolvedValue({ remaining: 0, hasMore: false });
    renderWithRouter(<VectorPage lang="en" />);

    expect((await screen.findByLabelText('vector.embeddingScope.missing')).checked).toBe(true);
    const button = screen.getByRole('button', { name: 'vector.generateEmbeddings' });
    expect(button.getAttribute('data-role')).toBe('primary');

    fireEvent.click(button);
    await waitFor(() => expect(mockGenerateEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({ regenerateAll: false })
    ));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('all embeddings: red Regenerate button that confirms first and does nothing when cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithRouter(<VectorPage lang="en" />);

    fireEvent.click(await screen.findByLabelText('vector.embeddingScope.all'));
    const button = screen.getByRole('button', { name: 'vector.regenerateEmbeddings' });
    expect(button.getAttribute('data-role')).toBe('danger');
    expect(screen.queryByRole('button', { name: 'vector.generateEmbeddings' })).toBeNull();

    fireEvent.click(button);
    expect(window.confirm).toHaveBeenCalledWith('vector.regenerateConfirm');
    expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByText('vector.backfillControls.start'));

    await waitFor(() => {
      expect(screen.getByText('vector.metadataDelayInvalid')).toBeTruthy();
    });
    expect(delayInput.getAttribute('aria-describedby')).toBe('metadata-backfill-delay-seconds-help metadata-backfill-delay-seconds-error');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockStartMetadataBackfillJob).not.toHaveBeenCalled();
  });

  it('announces a failed backfill start as role="alert"', async () => {
    mockStartMetadataBackfillJob.mockRejectedValue(new Error('backfill boom'));

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.backfillControls.start'));

    await waitForAnnouncement('vector.metadataBackfillFailed', 'assertive');
  });
});

describe('VectorPage metadata clear — was window.alert(), now StatusMessage', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('asks for confirmation and does nothing when cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByRole('button', { name: 'vector.clearMetadata' }));

    expect(confirmSpy).toHaveBeenCalledWith('vector.clearMetadataConfirm');
    expect(mockClearMetadata).not.toHaveBeenCalled();
  });

  it('announces a successful clear as role="status"', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert');
    mockClearMetadata.mockResolvedValue({});

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByRole('button', { name: 'vector.clearMetadata' }));

    await waitFor(() => {
      expect(screen.getByText('vector.metadataClearSuccess')).toBeTruthy();
    });
    expect(screen.getByText('vector.metadataClearSuccess', { selector: '[class*="status-message--"]' })).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('says there was nothing to clear, as info, when no embedding had metadata', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockClearMetadata.mockResolvedValue({ success: true, modifiedCount: 0 });

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByRole('button', { name: 'vector.clearMetadata' }));

    await waitForAnnouncement('vector.metadataClearNothing');
    expect(screen.getByText('vector.metadataClearNothing', { selector: '.status-message--info-box *, .status-message--info-box' })).toBeTruthy();
    expect(screen.queryByText('vector.metadataClearSuccess')).toBeNull();
  });

  it('announces a failed clear as role="alert"', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockClearMetadata.mockRejectedValue(new Error('clear boom'));

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByRole('button', { name: 'vector.clearMetadata' }));

    await waitForAnnouncement('vector.metadataClearFailed', 'assertive');
  });
});

describe('VectorPage stop backfill — was silent on success, wrong error text on failure', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('announces a successful stop politely, with no visible box', async () => {
    mockGetMetadataBackfillJob.mockResolvedValue({
      job: { id: 'job-1', status: 'running', processed: 3 },
    });
    mockStopMetadataBackfillJob.mockResolvedValue({ job: { id: 'job-1', status: 'stopped', processed: 3 } });

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.backfillControls.stop'));

    await waitForAnnouncement('vector.metadataBackfillStoppedAnnouncement');
    // Not the box treatment used for real outcomes elsewhere.
    expect(screen.queryByText('vector.metadataBackfillStoppedAnnouncement')).toBeNull();
    expect(document.querySelector('.status-message--success-box')).toBeNull();
  });

  it('announces a failed stop with its own text, not the backfill-start failure text', async () => {
    mockGetMetadataBackfillJob.mockResolvedValue({
      job: { id: 'job-1', status: 'running', processed: 3 },
    });
    mockStopMetadataBackfillJob.mockRejectedValue(new Error('stop boom'));

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.backfillControls.stop'));

    const announced = await waitForAnnouncement('vector.metadataBackfillStopFailed', 'assertive');
    expect(announced).not.toContain('vector.metadataBackfillFailed');
  });
});

describe('VectorPage backfill buttons stay put whatever the last job did', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  // Every label a control can show is in the DOM (to hold its width); only
  // the current one isn't aria-hidden.
  const visibleLabel = (button) => button.querySelector('.canada-ca-stable-label > :not([aria-hidden])').textContent;

  // By position, since the active control's text changes.
  const backfillButtons = () => {
    const [start, resume, stop] = within(
      screen.getByRole('group', { name: 'vector.backfillControls.label' })
    ).getAllByRole('button');
    return { start, resume, stop };
  };

  it('names each control by its visible label only', async () => {
    renderWithRouter(<VectorPage lang="en" />);
    await waitFor(() => expect(mockGetMetadataBackfillJob).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'vector.backfillControls.start' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'vector.backfillControls.stop' })).toBeTruthy();
  });

  it('shows all three with only Start usable when there is no job', async () => {
    renderWithRouter(<VectorPage lang="en" />);
    await waitFor(() => expect(mockGetMetadataBackfillJob).toHaveBeenCalled());
    const { start, resume, stop } = backfillButtons();
    expect(start.disabled).toBe(false);
    expect(resume.disabled).toBe(true);
    expect(stop.disabled).toBe(true);
    expect(visibleLabel(start)).toBe('vector.backfillControls.start');
    expect([start, resume, stop].map((b) => b.getAttribute('data-role'))).toEqual(['secondary', 'secondary', 'secondary']);
  });

  it('keeps Start and Resume in place, turned off, while a job runs', async () => {
    mockGetMetadataBackfillJob.mockResolvedValue({ job: { id: 'job-1', status: 'running', processed: 3 } });
    renderWithRouter(<VectorPage lang="en" />);
    await waitFor(() => expect(backfillButtons().stop.disabled).toBe(false));
    const { start, resume, stop } = backfillButtons();
    expect(start.disabled).toBe(true);
    expect(resume.disabled).toBe(true);
    // A run found on load shows on Start.
    expect(visibleLabel(start)).toBe('vector.backfillControls.running');
    expect(start.getAttribute('data-role')).toBe('primary');
    expect(visibleLabel(stop)).toBe('vector.backfillControls.stop');
  });

  it('resumes a stopped job by its id', async () => {
    mockGetMetadataBackfillJob.mockResolvedValue({ job: { id: 'job-1', status: 'stopped', processed: 3 } });
    mockStartMetadataBackfillJob.mockResolvedValue({ job: { id: 'job-1', status: 'running', processed: 3 } });
    renderWithRouter(<VectorPage lang="en" />);
    await waitFor(() => expect(backfillButtons().resume.disabled).toBe(false));

    const { stop } = backfillButtons();
    expect(visibleLabel(stop)).toBe('vector.metadataBackfillStopped');
    // Start reads Restart only while Resume is on.
    expect(visibleLabel(backfillButtons().start)).toBe('vector.backfillControls.restart');
    expect(stop.getAttribute('data-role')).toBe('primary');

    fireEvent.click(backfillButtons().resume);
    await waitFor(() => expect(mockStartMetadataBackfillJob).toHaveBeenCalledWith(
      expect.objectContaining({ resumeJobId: 'job-1' })
    ));
    const { start, resume } = backfillButtons();
    expect(visibleLabel(resume)).toBe('vector.backfillControls.running');
    expect(resume.getAttribute('data-role')).toBe('primary');
    expect(visibleLabel(start)).toBe('vector.backfillControls.start');
    expect(backfillButtons().stop.disabled).toBe(false);
  });

  it('Start after a stopped job begins from scratch, not a resume', async () => {
    mockGetMetadataBackfillJob.mockResolvedValue({ job: { id: 'job-1', status: 'stopped', processed: 3 } });
    mockStartMetadataBackfillJob.mockResolvedValue({ job: { id: 'job-2', status: 'queued', processed: 0 } });
    renderWithRouter(<VectorPage lang="en" />);
    await waitFor(() => expect(backfillButtons().resume.disabled).toBe(false));

    fireEvent.click(backfillButtons().start);
    await waitFor(() => expect(mockStartMetadataBackfillJob).toHaveBeenCalledWith(
      expect.objectContaining({ resumeJobId: null, restartJobId: 'job-1' })
    ));
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
      expect(screen.getByText('admin.common.chatIdRequired')).toBeTruthy();
    });
    const chatIdInput = screen.getByLabelText('vector.chatIdLabel');
    expect(chatIdInput.getAttribute('aria-describedby')).toBe('metadata-lookup-heading metadata-lookup-chat-id-error');
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

    expect(status.closest('.status-message--info-box')).toBeTruthy();
    expect(status.closest('.status-message--warning-box')).toBeNull();
  });

  it('shows the counts as a label/value list, not a table', async () => {
    mockGetMetadataStatus.mockResolvedValue({
      complete: false,
      totalEmbeddings: 1234,
      recordsRequiringMetadata: 10,
      recordsWithMetadata: 7,
      recordsMissingMetadata: 3,
    });

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.metadataStatus.check'));

    const term = await screen.findByText('vector.metadataStatus.totalEmbeddings');
    expect(term.tagName).toBe('DT');
    expect(term.nextElementSibling.textContent).toBe('1,234');
    expect(term.closest('table')).toBeNull();
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
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGetMetadataBackfillJob.mockResolvedValue({
      job: { id: 'job-1', status: 'failed', processed: 5 },
    });
    mockClearMetadata.mockResolvedValue({});

    renderWithRouter(<VectorPage lang="en" />);

    await screen.findByText('vector.metadataBackfillFailed');
    expect(screen.getByText(/vector\.metadataProcessed/)).toBeTruthy();
    // Progress is a label/value list, not a run-on line.
    expect(screen.getByText('vector.metadataProcessed').tagName).toBe('DT');
    expect(screen.getByText('vector.metadataProcessed').nextElementSibling.textContent).toBe('5');

    fireEvent.click(screen.getByRole('button', { name: 'vector.clearMetadata' }));
    await screen.findByText('vector.metadataClearSuccess');

    // The mocked job record is unchanged — still "failed" — so this proves
    // the poll itself is now skipping it, not that the server happened to
    // stop reporting a failure.
    await vi.advanceTimersByTimeAsync(5000);

    expect(screen.queryByText('vector.metadataBackfillFailed')).toBeNull();
    expect(screen.queryByText(/vector\.metadataProcessed/)).toBeNull();
    expect(screen.getByText('vector.metadataClearSuccess')).toBeTruthy();
  });

  // Starts a backfill by clicking, then lets the next poll find `job`
  const startBackfillThenPoll = async (job) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockStartMetadataBackfillJob.mockResolvedValue({ job: { id: 'job-1', status: 'running', processed: 0 } });
    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.backfillControls.start'));
    await waitFor(() => expect(mockStartMetadataBackfillJob).toHaveBeenCalled());
    mockGetMetadataBackfillJob.mockResolvedValue({ job });
    await vi.advanceTimersByTimeAsync(5000);
  };

  // Past the announcer's gap, so anything queued would have been spoken
  const expectNotAnnounced = async (text) => {
    await new Promise((resolve) => { setTimeout(resolve, 600); });
    expect(getAnnouncedTexts('polite')).not.toContain(text);
    expect(getAnnouncedTexts('assertive')).not.toContain(text);
  };

  it('announces a backfill started on this visit that fails later (found by polling) as role="alert"', async () => {
    await startBackfillThenPoll({ id: 'job-1', status: 'failed', processed: 5 });

    await waitForAnnouncement('vector.metadataBackfillFailed', 'assertive');
  });

  it('does not re-announce a still-failed job on the next poll tick', async () => {
    await startBackfillThenPoll({ id: 'job-1', status: 'failed', processed: 5 });
    await waitForAnnouncement('vector.metadataBackfillFailed', 'assertive');

    // Same job, same status, next 5s tick — must not spam a second
    // "failed" announcement while nothing actually changed.
    await vi.advanceTimersByTimeAsync(5000);
    expect(getAnnouncedTexts('assertive').filter((t) => t === 'vector.metadataBackfillFailed')).toHaveLength(1);
  });

  it('announces a backfill started on this visit that completes (found by polling) as role="status"', async () => {
    await startBackfillThenPoll({ id: 'job-1', status: 'completed', processed: 10 });

    const status = await screen.findByText('vector.metadataBackfillCompleted');
    expect(status.closest('.status-message--success-box')).toBeTruthy();
    await waitForAnnouncement('vector.metadataBackfillCompleted');
  });

  it('shows a failed job from before the page opened, without announcing it', async () => {
    mockGetMetadataBackfillJob.mockResolvedValue({
      job: { id: 'job-1', status: 'failed', processed: 5 },
    });

    renderWithRouter(<VectorPage lang="en" />);

    const status = await screen.findByText('vector.metadataBackfillFailed');
    expect(status.closest('.status-message--error-box')).toBeTruthy();
    await expectNotAnnounced('vector.metadataBackfillFailed');
  });

  it('shows a completed job from before the page opened, without announcing it', async () => {
    mockGetMetadataBackfillJob.mockResolvedValue({
      job: { id: 'job-1', status: 'completed', processed: 10 },
    });

    renderWithRouter(<VectorPage lang="en" />);

    const status = await screen.findByText('vector.metadataBackfillCompleted');
    expect(status.closest('.status-message--success-box')).toBeTruthy();
    await expectNotAnnounced('vector.metadataBackfillCompleted');
  });

  it('finishes quietly a job that was already running when the page opened', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGetMetadataBackfillJob
      .mockResolvedValueOnce({ job: { id: 'job-1', status: 'running', processed: 5 } })
      .mockResolvedValue({ job: { id: 'job-1', status: 'completed', processed: 10 } });

    renderWithRouter(<VectorPage lang="en" />);
    await vi.advanceTimersByTimeAsync(5000);

    await screen.findByText('vector.metadataBackfillCompleted');
    await expectNotAnnounced('vector.metadataBackfillCompleted');
  });
});

describe('VectorPage docdb8 capability probe error rendering', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('wraps a probe failure detail in a single lang="en" span, not double-wrapped', async () => {
    mockRunDocdb8CapabilityTest.mockRejectedValue(new Error('driver timeout'));

    renderWithRouter(<VectorPage lang="en" />);

    fireEvent.click(await screen.findByText('vector.docdb8Capability.run'));

    await waitFor(() => {
      expect(screen.getByText('driver timeout', { selector: 'code[lang="en"]' })).toBeTruthy();
    });
    // Exactly one wrap, not nested — same bug class as
    // SimilarChatsDashboard.js's double <code lang="en">.
    expect(document.querySelectorAll('code[lang="en"]').length).toBe(1);
  });
});

describe('VectorPage embedding provider', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('has a visible label tied to the select, not just an aria-label', async () => {
    renderWithRouter(<VectorPage lang="en" />);
    const select = await screen.findByLabelText('vector.embeddingProviderLabel');
    expect(select.tagName).toBe('SELECT');
    expect(select.getAttribute('aria-label')).toBeNull();
    expect(document.querySelector('label[for="embedding-provider"]')).toBeTruthy();
  });
});

describe('VectorPage backfill delay guidance', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('shows the delay guidance as a hint that describes the field', async () => {
    renderWithRouter(<VectorPage lang="en" />);
    const help = await screen.findByText('vector.metadataDelayHelp');
    expect(help.className).toBe('canada-ca-field-hint');
    const delayInput = screen.getByLabelText('vector.metadataDelayLabel');
    expect(delayInput.getAttribute('aria-describedby')).toBe(help.id);
  });
});

describe('VectorPage docdb8 capability test picker', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('runs the probe chosen in the dropdown and names it in the results table', async () => {
    mockRunDocdb8CapabilityTest.mockResolvedValue({ test: { supported: true, resultCount: 3, durationMs: 12 } });

    renderWithRouter(<VectorPage lang="en" />);
    const select = await screen.findByLabelText('vector.docdb8Capability.probeLabel');
    expect(select.getAttribute('aria-describedby')).toBe('docdb8-probe-hint');
    fireEvent.change(select, { target: { value: 'node_bruteforce_feedback_subset' } });
    fireEvent.click(screen.getByText('vector.docdb8Capability.run'));

    await waitFor(() => expect(mockRunDocdb8CapabilityTest).toHaveBeenCalledWith('node_bruteforce_feedback_subset'));
    const cell = await screen.findByText('vector.docdb8Capability.probes.nodeBruteforceFeedbackSubset', { selector: 'td' });
    expect(cell).toBeTruthy();
  });
});

describe('VectorPage metadata lookup partial chat ID search', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
    mockGetChat.mockReset();
    mockSearchChats.mockReset();
    mockLookupMetadata.mockReset();
  });

  it('looks up metadata for the one chat a partial ID matches', async () => {
    const CHAT_ID = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
    mockSearchChats.mockResolvedValue({ chatIds: [CHAT_ID], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: CHAT_ID } });
    mockLookupMetadata.mockResolvedValue({ chat: null, rows: [] });

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.change(await screen.findByLabelText('vector.chatIdLabel'), { target: { value: '3f2b8c' } });
    fireEvent.click(screen.getByText('vector.metadataLookup.lookup'));

    await waitFor(() => expect(mockLookupMetadata).toHaveBeenCalledWith(CHAT_ID));
  });

  it('moves focus to the result summary after a match is picked', async () => {
    const CHAT_ID = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
    const OTHER_ID = '3f2b8c1e-0000-4000-8000-000000000000';
    mockSearchChats.mockResolvedValue({ chatIds: [CHAT_ID, OTHER_ID], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: OTHER_ID } });
    mockLookupMetadata.mockResolvedValue({
      chat: { chatId: OTHER_ID, pageLanguage: 'en', interactionCount: 1, embeddingCount: 1 },
      rows: [],
    });

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.change(await screen.findByLabelText('vector.chatIdLabel'), { target: { value: '3f2b8c' } });
    fireEvent.click(screen.getByText('vector.metadataLookup.lookup'));
    fireEvent.click(await screen.findByRole('button', { name: OTHER_ID }));

    await waitFor(() => expect(document.activeElement?.id).toBe('metadata-lookup-result'));
    expect(document.activeElement.textContent).toContain(OTHER_ID);
  });

  it('moves focus to the error message when the lookup fails after a pick', async () => {
    const CHAT_ID = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
    const OTHER_ID = '3f2b8c1e-0000-4000-8000-000000000000';
    mockSearchChats.mockResolvedValue({ chatIds: [CHAT_ID, OTHER_ID], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: OTHER_ID } });
    mockLookupMetadata.mockRejectedValue(new Error('Network down'));

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.change(await screen.findByLabelText('vector.chatIdLabel'), { target: { value: '3f2b8c' } });
    fireEvent.click(screen.getByText('vector.metadataLookup.lookup'));
    fireEvent.click(await screen.findByRole('button', { name: OTHER_ID }));

    await screen.findByText('vector.metadataLookup.failed');
    await waitFor(() => expect(document.activeElement?.textContent).toContain('vector.metadataLookup.failed'));
    // Focus reads it - announcing too would read it twice.
    expect(document.activeElement.getAttribute('data-announced-via')).toBe('focus');
  });

  it.each([
    ['cannot be checked', () => mockGetChat.mockRejectedValue(new Error('Network down')), 'admin.common.fetchFailed'],
    ['is no longer found', () => mockGetChat.mockResolvedValue({ chat: null }), 'admin.common.chatNoLongerFound'],
  ])('moves focus to the outcome message when the picked chat %s', async (_label, mockOutcome, messageKey) => {
    const CHAT_ID = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
    const OTHER_ID = '3f2b8c1e-0000-4000-8000-000000000000';
    mockSearchChats.mockResolvedValue({ chatIds: [CHAT_ID, OTHER_ID], truncated: false });
    mockOutcome();

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.change(await screen.findByLabelText('vector.chatIdLabel'), { target: { value: '3f2b8c' } });
    fireEvent.click(screen.getByText('vector.metadataLookup.lookup'));
    fireEvent.click(await screen.findByRole('button', { name: OTHER_ID }));

    await screen.findByText(messageKey);
    await waitFor(() => expect(document.activeElement?.textContent).toContain(messageKey));
    expect(document.activeElement.getAttribute('data-announced-via')).toBe('focus');
    // The search just found it, so a failed pick is an error either way.
    expect(document.activeElement.classList.contains('status-message--error-box')).toBe(true);
    expect(mockLookupMetadata).not.toHaveBeenCalled();
  });

  it('shows "no chat found" as information and skips the lookup', async () => {
    mockSearchChats.mockResolvedValue({ chatIds: [], truncated: false });

    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.change(await screen.findByLabelText('vector.chatIdLabel'), { target: { value: 'zzzz' } });
    fireEvent.click(screen.getByText('vector.metadataLookup.lookup'));

    const message = await screen.findByText('admin.common.chatNotFound');
    expect(message.closest('.status-message--info-box')).toBeTruthy();
    // A typed search, not a pick - announced, not focused.
    expect(message.closest('[data-announced-via]').getAttribute('data-announced-via')).toBe('live-announcer-polite');
    expect(mockLookupMetadata).not.toHaveBeenCalled();
  });
});

describe('VectorPage metadata lookup table — one row per embedding, mismatches marked', () => {
  const CHAT_ID = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
  const baseRow = {
    rowNumber: 1,
    interactionDisplayId: '7',
    interactionObjectId: 'int-1',
    embeddingId: 'emb-1',
    embeddingInteractionId: 'int-1',
    attachedExpertFeedbackId: 'ef-1',
    metadataExpertFeedbackId: 'ef-1',
    attachedExpertFeedbackTotalScore: 90,
    metadataExpertFeedbackTotalScore: 90,
    chatPageLanguage: 'en',
    metadataPageLanguage: 'en',
    interactionLanguage: 'fr',
    metadataInteractionLanguage: 'fr',
    metadataStatus: 'metadataMatches',
    metadataExpertFeedbackNeverStale: false,
  };

  afterEach(() => {
    cleanup();
    resetMocks();
    mockGetChat.mockReset();
    mockLookupMetadata.mockReset();
  });

  const lookUp = async (rows) => {
    mockGetChat.mockResolvedValue({ chat: { chatId: CHAT_ID } });
    mockLookupMetadata.mockResolvedValue({
      chat: { chatId: CHAT_ID, pageLanguage: 'en', interactionCount: rows.length, embeddingCount: rows.length },
      rows,
    });
    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.change(await screen.findByLabelText('vector.chatIdLabel'), { target: { value: CHAT_ID } });
    fireEvent.click(screen.getByText('vector.metadataLookup.lookup'));
    const table = await screen.findByRole('table', { name: 'vector.metadataLookup.title' });
    return table;
  };
  const cells = (table) => [...table.querySelectorAll('tbody tr:first-child td')];

  it('has eight columns, one row per embedding', async () => {
    const table = await lookUp([baseRow, { ...baseRow, rowNumber: 2, interactionDisplayId: '8', interactionObjectId: 'int-2', embeddingId: 'emb-2', embeddingInteractionId: 'int-2' }]);
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual([
      'vector.metadataLookup.columns.row',
      'vector.metadataLookup.columns.status',
      'vector.metadataLookup.columns.displayId',
      'vector.metadataLookup.columns.ids',
      'vector.metadataLookup.columns.expertFeedbackId',
      'vector.metadataLookup.columns.score',
      'vector.metadataLookup.columns.pageLanguage',
      'vector.metadataLookup.columns.interactionLanguage',
    ]);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('shows a value once when the attached value and the metadata agree', async () => {
    const table = await lookUp([baseRow]);
    const [, , , , feedback, score, pageLang, interactionLang] = cells(table);
    expect(feedback.textContent).toBe('ef-1');
    expect(score.textContent).toBe('90');
    expect(pageLang.textContent).toBe('en');
    expect(interactionLang.textContent).toBe('fr');
    expect(table.querySelector('.metadata-mismatch')).toBeNull();
  });

  it('marks a mismatch with words for screen readers, not colour alone', async () => {
    const table = await lookUp([{ ...baseRow, metadataExpertFeedbackTotalScore: 75 }]);
    const score = cells(table)[5];
    const mark = score.querySelector('.metadata-mismatch');
    expect(mark).toBeTruthy();
    // Read as "Mismatch: attached 90 but metadata has 75"; the "!" and arrow are visual only.
    const spoken = [...mark.childNodes]
      .filter((n) => !(n.getAttribute && n.getAttribute('aria-hidden') === 'true'))
      .map((n) => n.textContent.trim())
      .filter(Boolean);
    expect(spoken).toEqual(['vector.metadataLookup.mismatch', '90', 'vector.metadataLookup.mismatchTo', '75']);
    expect(mark.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it('shows saved values plainly when the interaction has no embedding', async () => {
    const table = await lookUp([{
      ...baseRow,
      embeddingId: null,
      embeddingInteractionId: null,
      metadataExpertFeedbackId: null,
      metadataExpertFeedbackTotalScore: null,
      metadataPageLanguage: null,
      metadataInteractionLanguage: null,
      metadataStatus: 'missingEmbedding',
    }]);
    const [, , , , feedback, score, pageLang, interactionLang] = cells(table);
    expect(table.querySelector('.metadata-mismatch')).toBeNull();
    expect([feedback, score, pageLang, interactionLang].map((c) => c.textContent)).toEqual(['ef-1', '90', 'en', 'fr']);
  });

  it('shows the never-stale pill in the status cell only when set', async () => {
    const table = await lookUp([
      { ...baseRow, metadataExpertFeedbackNeverStale: true },
      { ...baseRow, rowNumber: 2, interactionObjectId: 'int-2', embeddingId: 'emb-2', embeddingInteractionId: 'int-2' },
    ]);
    const [first, second] = [...table.querySelectorAll('tbody tr')].map((tr) => tr.querySelectorAll('td')[1]);
    expect(first.querySelector('.label')?.textContent).toBe('vector.metadataLookup.columns.neverStale');
    expect(second.querySelector('.label')).toBeNull();
  });

  it('shows the row number first and says when the display ID is missing', async () => {
    const table = await lookUp([{ ...baseRow, rowNumber: 3, interactionDisplayId: null }]);
    expect(cells(table)[0].textContent).toBe('3');
    expect(cells(table)[2].textContent).toBe('vector.metadataLookup.missingDisplayId');
  });

  it('draws lines between rows', async () => {
    const table = await lookUp([baseRow]);
    expect(table.classList.contains('row-border')).toBe(true);
  });

  it('lists the chat summary as label/value pairs, without the page language', async () => {
    await lookUp([baseRow]);
    const summary = document.getElementById('metadata-lookup-result');
    expect(summary.tagName).toBe('DL');
    expect([...summary.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'vector.metadataLookup.chatSummary.chatId',
      'vector.metadataLookup.chatSummary.interactions',
      'vector.metadataLookup.chatSummary.embeddings',
    ]);
    expect([...summary.querySelectorAll('dd')].map((dd) => dd.textContent)).toEqual([CHAT_ID, '1', '1']);
  });
});

describe('VectorPage DocDB raw results disclosure', () => {
  afterEach(() => {
    cleanup();
    resetMocks();
  });

  it('adds no extra tab stop before the disclosure\'s own toggle', async () => {
    mockRunDocdb8CapabilityTest.mockResolvedValue({ test: { supported: true, resultCount: 3, durationMs: 12 } });
    renderWithRouter(<VectorPage lang="en" />);
    fireEvent.click(await screen.findByText('vector.docdb8Capability.run'));
    await screen.findByText('vector.docdb8Capability.probes.annAllThenFeedbackPostFilter', { selector: 'td' }).catch(() => null);
    const details = await waitFor(() => {
      const d = document.querySelector('details');
      expect(d).toBeTruthy();
      return d;
    });
    expect(details.hasAttribute('tabindex')).toBe(false);
  });
});
