/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ExperimentalAnalysisPage from '../experimental/ExperimentalAnalysisPage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const {
    mockListAnalyzers,
    mockListDatasets,
    mockListBatches
} = vi.hoisted(() => ({
    mockListAnalyzers: vi.fn(),
    mockListDatasets: vi.fn(),
    mockListBatches: vi.fn()
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
        createBatch: vi.fn(),
        processBatch: vi.fn(),
        deleteBatch: vi.fn(),
        exportBatch: vi.fn()
    }
}));

vi.mock('@cdssnc/gcds-components-react', () => ({
    GcdsContainer: ({ children }) => <div>{children}</div>,
    GcdsHeading: ({ children }) => <h2>{children}</h2>,
    GcdsButton: ({ children, onClick, disabled, size }) => (
        <button onClick={onClick} disabled={disabled} data-size={size}>
            {children}
        </button>
    ),
    GcdsText: ({ children }) => <div>{children}</div>
}));

describe('ExperimentalAnalysisPage', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockListAnalyzers.mockReset().mockResolvedValue([]);
        mockListDatasets.mockReset().mockResolvedValue({ data: [{ _id: 'dataset-1', name: 'Dataset 1', rowCount: 1 }] });
        mockListBatches.mockReset();
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
});
