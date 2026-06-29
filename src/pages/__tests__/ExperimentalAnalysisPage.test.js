/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ExperimentalAnalysisPage from '../experimental/ExperimentalAnalysisPage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const {
    mockListAnalyzers,
    mockListDatasets,
    mockListBatches,
    mockCreateBatch,
    mockProcessBatch,
    mockDeleteBatch,
    mockExportBatch,
    mockExportChatLogs
} = vi.hoisted(() => ({
    mockListAnalyzers: vi.fn(),
    mockListDatasets: vi.fn(),
    mockListBatches: vi.fn(),
    mockCreateBatch: vi.fn(),
    mockProcessBatch: vi.fn(),
    mockDeleteBatch: vi.fn(),
    mockExportBatch: vi.fn(),
    mockExportChatLogs: vi.fn()
}));

vi.mock('../../hooks/useTranslations.js', () => ({
    useTranslations: () => ({
        t: (key, defaultValue) => ({
            'experimental.analysis.analyzerDetailsTitle': 'Analyzer details',
            'experimental.analysis.configuration': 'Configuration',
            'experimental.analysis.useExistingDatasetLabel': 'Use existing dataset',
            'experimental.analysis.datasetSelectPlaceholder': '-- Select an existing dataset --',
            'experimental.analysis.datasetHelper': 'Upload and manage datasets through the Datasets page, then select one here.',
            'experimental.analysis.useAsBaseline': 'Use as baseline',
            'experimental.analysis.baselineSelected': 'Baseline selected',
            'experimental.analysis.delete': 'Delete',
            'experimental.analysis.previousRuns': 'Previous runs',
            'experimental.analysis.batchPrefix': 'Batch',
            'experimental.analysis.datasetRows': 'rows',
            'experimental.analysis.progressSummary': 'Completed: {completed} | Failed: {failed} | Total: {total}',
            'experimental.analysis.statuses.processing': 'Processing',
            'experimental.analysis.statuses.completed': 'Completed',
            'experimental.analysis.statuses.failed': 'Failed',
            'experimental.analysis.messages.selectDataset': 'Please select an existing dataset before starting analysis.',
            'experimental.analysis.messages.processingStarted': 'Processing started.',
            'experimental.analysis.messages.startProcessingError': 'Failed to start processing.',
            'experimental.analysis.messages.startAnalysisFailed': 'Failed to start analysis.',
            'experimental.analysis.messages.resumeFailed': 'Failed to resume batch.',
            'experimental.analysis.messages.deleteFailed': 'Failed to delete batch.',
            'experimental.analysis.messages.exportFailed': 'Failed to export batch.',
            'experimental.analysis.analyzerPrefix': 'Analyzer',
            'experimental.analysis.analyzers.analyzer-1.name': 'Analyzer 1',
            'experimental.analysis.analyzers.analyzer-1.description': 'Analyzer 1 description'
        }[key] || defaultValue || key)
    })
}));

vi.mock('react-router-dom', () => ({
    useSearchParams: () => [new URLSearchParams('datasetId=dataset-1'), vi.fn()]
}));

vi.mock('../../services/experimental/ExperimentalBatchClientService.js', () => ({
    ExperimentalBatchClientService: {
        listAnalyzers: mockListAnalyzers,
        listDatasets: mockListDatasets,
        listBatches: mockListBatches,
        createBatch: mockCreateBatch,
        processBatch: mockProcessBatch,
        deleteBatch: mockDeleteBatch,
        exportBatch: mockExportBatch,
        exportChatLogs: mockExportChatLogs
    }
}));

vi.mock('@cdssnc/gcds-components-react', () => ({
    GcdsContainer: ({ children }) => <div>{children}</div>,
    GcdsHeading: ({ children, tag: Tag = 'h2' }) => <Tag>{children}</Tag>,
    GcdsButton: ({ children, onClick, disabled, size }) => (
        <button onClick={onClick} disabled={disabled} data-size={size}>
            {children}
        </button>
    ),
    GcdsText: ({ children }) => <div>{children}</div>,
    GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
    GcdsDetails: ({ children, detailsTitle }) => (
        <section>
            <div>{detailsTitle}</div>
            <div>{children}</div>
        </section>
    )
}));

describe('ExperimentalAnalysisPage', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-05T00:10:00.000Z'));
        mockListAnalyzers.mockReset().mockResolvedValue([{ id: 'analyzer-1', nameKey: 'experimental.analysis.analyzers.analyzer-1.name', descriptionKey: 'experimental.analysis.analyzers.analyzer-1.description' }]);
        mockListDatasets.mockReset().mockResolvedValue({
            data: [{ _id: 'dataset-1', name: 'Dataset 1', description: 'Dataset description', rowCount: 1 }]
        });
        mockListBatches.mockReset().mockResolvedValue({ data: [] });
        mockCreateBatch.mockReset();
        mockProcessBatch.mockReset();
        mockDeleteBatch.mockReset();
        mockExportBatch.mockReset();
        mockExportChatLogs.mockReset();
    });

    afterEach(() => {
        cleanup();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('rehydrates and keeps polling an active batch after returning to the page', async () => {
        mockListBatches
            .mockResolvedValueOnce({
                data: [{
                    _id: 'batch-abc123',
                    name: 'Analysis - resumed run',
                    status: 'processing',
                    summary: { completed: 3, failed: 1, total: 10 },
                    analyzerSummary: {},
                    config: { analyzerIds: ['bias-detection'] },
                    createdAt: '2026-05-05T00:00:00.000Z',
                    createdBy: { email: 'user@example.com' }
                }]
            })
            .mockResolvedValueOnce({
                data: [{
                    _id: 'batch-abc123',
                    name: 'Analysis - resumed run',
                    status: 'completed',
                    summary: { completed: 10, failed: 0, total: 10 },
                    analyzerSummary: {},
                    config: { analyzerIds: ['bias-detection'] },
                    createdAt: '2026-05-05T00:00:00.000Z',
                    createdBy: { email: 'user@example.com' }
                }]
        });

        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByText(/Processing/, { selector: 'div' })).toBeTruthy();
        expect(screen.getByText(/Completed: 3 \| Failed: 1 \| Total: 10/)).toBeTruthy();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });

        expect(mockListBatches).toHaveBeenCalledTimes(2);
        expect(screen.queryByText(/processing/, { selector: 'div' })).toBeNull();
    });

    it('shows the selected dataset name, description, and datasets link', async () => {
        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByRole('heading', { name: 'Dataset 1' })).toBeTruthy();
        expect(screen.getByText('Dataset description')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'experimental.datasets.backToList' }).getAttribute('href')).toBe(
            '/en/experimental/datasets'
        );
    });

    it('shows the selected analyzer details in a collapsible control', async () => {
        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.change(screen.getByLabelText('experimental.analysis.selectAnalyzers'), {
            target: { value: 'analyzer-1' }
        });

        expect(screen.getByText('Analyzer details')).toBeTruthy();
        expect(screen.getByText('Analyzer 1 description')).toBeTruthy();
    });

    it('shows a starting status card immediately when analysis is launched', async () => {
        let resolveCreateBatch;
        const createBatchPromise = new Promise((resolve) => {
            resolveCreateBatch = resolve;
        });

        mockCreateBatch.mockReturnValueOnce(createBatchPromise);
        mockProcessBatch.mockResolvedValue({ message: 'Processing started' });

        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.change(screen.getByLabelText('experimental.analysis.selectAnalyzers'), {
            target: { value: 'analyzer-1' }
        });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'experimental.analysis.run' }));
        });

        const expectedRunName = 'Analyzer 1 · Dataset 1 · workflows.generic · models.gpt51';
        expect(mockCreateBatch).toHaveBeenCalledWith(expect.objectContaining({ name: expectedRunName }));
        expect(screen.getByText(expectedRunName)).toBeTruthy();
        expect(screen.getByText('experimental.analysis.messages.startingRun')).toBeTruthy();

        resolveCreateBatch({
            _id: 'batch-123',
            multiple: false
        });

        await act(async () => {
            await Promise.resolve();
        });
    });

    it('disables baseline actions for batches that use a different analyzer than the selected one', async () => {
        mockListBatches.mockResolvedValueOnce({
            data: [
                {
                    _id: 'batch-1',
                    name: 'Analysis - analyzer 1',
                    status: 'completed',
                    summary: { completed: 1, failed: 0, total: 1 },
                    analyzerSummary: {},
                    config: { analyzerIds: ['analyzer-1'] },
                    createdAt: '2026-05-05T00:00:00.000Z',
                    createdBy: { email: 'user@example.com' }
                },
                {
                    _id: 'batch-2',
                    name: 'Analysis - analyzer 2',
                    status: 'completed',
                    summary: { completed: 1, failed: 0, total: 1 },
                    analyzerSummary: {},
                    config: { analyzerIds: ['analyzer-2'] },
                    createdAt: '2026-05-04T00:00:00.000Z',
                    createdBy: { email: 'user@example.com' }
                }
            ]
        });

        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.change(screen.getByLabelText('experimental.analysis.selectAnalyzers'), {
            target: { value: 'analyzer-1' }
        });

        const baselineButtons = screen.getAllByRole('button', { name: 'Use as baseline' });
        expect(baselineButtons).toHaveLength(2);
        expect(baselineButtons[0].disabled).toBe(false);
        expect(baselineButtons[1].disabled).toBe(true);
    });

    it('shows and triggers export chat logs for completed runs when a baseline is selected', async () => {
        mockListBatches.mockResolvedValueOnce({
            data: [
                {
                    _id: 'batch-1',
                    name: 'Analysis - baseline',
                    status: 'completed',
                    summary: { completed: 1, failed: 0, total: 1 },
                    analyzerSummary: {},
                    config: { analyzerIds: ['analyzer-1'] },
                    createdAt: '2026-05-05T00:00:00.000Z',
                    createdBy: { email: 'user@example.com' }
                },
                {
                    _id: 'batch-2',
                    name: 'Analysis - current',
                    status: 'completed',
                    summary: { completed: 1, failed: 0, total: 1 },
                    analyzerSummary: {},
                    config: { analyzerIds: ['analyzer-1'] },
                    createdAt: '2026-05-04T00:00:00.000Z',
                    createdBy: { email: 'user@example.com' }
                }
            ]
        });
        mockExportChatLogs.mockResolvedValue(new Blob(['test'], { type: 'application/vnd.ms-excel' }));

        const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:chat-logs');
        const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.click(screen.getAllByRole('button', { name: 'Use as baseline' })[0]);
        fireEvent.click(screen.getAllByRole('button', { name: 'experimental.analysis.exportChatLogs' })[1]);

        await act(async () => {
            await Promise.resolve();
        });

        expect(mockExportChatLogs).toHaveBeenCalledWith('batch-2', 'batch-1');
        expect(createObjectURL).toHaveBeenCalled();
        expect(clickSpy).toHaveBeenCalled();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:chat-logs');

        createObjectURL.mockRestore();
        revokeObjectURL.mockRestore();
        clickSpy.mockRestore();
    });

    it('shows the same run name in the baseline dropdown as the history table', async () => {
        const expectedDate = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-05-05T00:00:00.000Z'));
        mockListBatches.mockResolvedValueOnce({
            data: [
                {
                    _id: 'batch-1',
                    name: 'Analysis - baseline',
                    status: 'completed',
                    summary: { completed: 1, failed: 0, total: 1 },
                    analyzerSummary: {},
                    config: { analyzerIds: ['analyzer-1'] },
                    createdAt: '2026-05-05T00:00:00.000Z',
                    createdBy: { email: 'user@example.com' }
                }
            ]
        });

        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByText('Analysis - baseline')).toBeTruthy();
        expect(screen.getByRole('option', { name: `Analysis - baseline - ${expectedDate}` })).toBeTruthy();
    });

    it('shows workflow and model family values from saved batch config and falls back to N/A when missing', async () => {
        mockListBatches.mockResolvedValueOnce({
            data: [
                {
                    _id: 'batch-1',
                    name: 'Analysis - configured',
                    status: 'completed',
                    summary: { completed: 1, failed: 0, total: 1 },
                    analyzerSummary: {},
                    appVersion: '1234567890abcdef',
                    config: {
                        analyzerIds: ['bias-detection'],
                        workflow: 'GenericGraph',
                        aiProvider: 'azure'
                    },
                    createdAt: '2026-05-05T00:00:00.000Z',
                    createdBy: { email: 'user@example.com' }
                },
                {
                    _id: 'batch-2',
                    name: 'Analysis - legacy',
                    status: 'completed',
                    summary: { completed: 1, failed: 0, total: 1 },
                    analyzerSummary: {},
                    config: { analyzerIds: ['bias-detection'] },
                    createdAt: '2026-05-04T00:00:00.000Z',
                    createdBy: { email: 'legacy@example.com' }
                }
            ]
        });

        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByRole('columnheader', { name: 'experimental.analysis.columns.workflow' })).toBeTruthy();
        expect(screen.getByRole('columnheader', { name: 'experimental.analysis.columns.modelFamily' })).toBeTruthy();
        expect(screen.getByRole('columnheader', { name: 'experimental.analysis.columns.appVersion' })).toBeTruthy();
        expect(screen.getAllByText('workflows.generic').some(node => node.tagName === 'TD')).toBe(true);
        expect(screen.getByText('7890abcdef')).toBeTruthy();
        expect(screen.getAllByText('common.na').some(node => node.tagName === 'TD')).toBe(true);
        expect(screen.getAllByText('common.na').length).toBeGreaterThan(0);
    });

    it('hides export and resume actions for actively updating processing batches', async () => {
        mockListBatches.mockResolvedValueOnce({
            data: [
                {
                    _id: 'batch-active',
                    name: 'Analysis - active',
                    status: 'processing',
                    updatedAt: '2026-05-05T00:09:30.000Z',
                    summary: { completed: 3, failed: 1, total: 10 },
                    analyzerSummary: {},
                    config: { analyzerIds: ['analyzer-1'] },
                    createdAt: '2026-05-05T00:00:00.000Z',
                    createdBy: { email: 'user@example.com' }
                },
                {
                    _id: 'batch-finished',
                    name: 'Analysis - finished',
                    status: 'completed',
                    updatedAt: '2026-05-05T00:01:00.000Z',
                    summary: { completed: 10, failed: 0, total: 10 },
                    analyzerSummary: {},
                    config: { analyzerIds: ['analyzer-1'] },
                    createdAt: '2026-05-04T00:00:00.000Z',
                    createdBy: { email: 'user@example.com' }
                }
            ]
        });

        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getAllByRole('button', { name: 'experimental.analysis.export' })).toHaveLength(1);
        expect(screen.queryByRole('button', { name: 'experimental.analysis.resume' })).toBeNull();
    });
});
