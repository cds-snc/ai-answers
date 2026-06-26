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
    mockExportBatch
} = vi.hoisted(() => ({
    mockListAnalyzers: vi.fn(),
    mockListDatasets: vi.fn(),
    mockListBatches: vi.fn(),
    mockCreateBatch: vi.fn(),
    mockProcessBatch: vi.fn(),
    mockDeleteBatch: vi.fn(),
    mockExportBatch: vi.fn()
}));

vi.mock('../../hooks/useTranslations.js', () => ({
    useTranslations: () => ({
        t: (key, defaultValue) => defaultValue || key
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
        exportBatch: mockExportBatch
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
    GcdsLink: ({ children, href }) => <a href={href}>{children}</a>
}));

describe('ExperimentalAnalysisPage', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockListAnalyzers.mockReset().mockResolvedValue([{ id: 'analyzer-1', name: 'Analyzer 1' }]);
        mockListDatasets.mockReset().mockResolvedValue({
            data: [{ _id: 'dataset-1', name: 'Dataset 1', description: 'Dataset description', rowCount: 1 }]
        });
        mockListBatches.mockReset().mockResolvedValue({ data: [] });
        mockCreateBatch.mockReset();
        mockProcessBatch.mockReset();
        mockDeleteBatch.mockReset();
        mockExportBatch.mockReset();
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

        expect(screen.getByText(/processing/, { selector: 'div' })).toBeTruthy();
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

        const baselineButtons = screen.getAllByRole('button', { name: 'Use as Baseline' });
        expect(baselineButtons).toHaveLength(2);
        expect(baselineButtons[0].disabled).toBe(false);
        expect(baselineButtons[1].disabled).toBe(true);
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
        expect(screen.getAllByText('workflows.generic').some(node => node.tagName === 'TD')).toBe(true);
        expect(screen.getAllByText('common.na').some(node => node.tagName === 'TD')).toBe(true);
        expect(screen.getAllByText('common.na').length).toBeGreaterThan(0);
    });
});
