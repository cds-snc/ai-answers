/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ExperimentalDatasetsPage from '../experimental/ExperimentalDatasetsPage.js';
import { waitForAnnouncement } from '../../../test/liveAnnouncer.js';

const { mockListDatasets, mockExportDataset, mockProcessDataset, mockDeleteDataset } = vi.hoisted(() => ({
    mockListDatasets: vi.fn(),
    mockExportDataset: vi.fn(),
    mockProcessDataset: vi.fn(),
    mockDeleteDataset: vi.fn()
}));

const datasetRow = (overrides = {}) => ({
    _id: 'dataset-1',
    name: 'My Dataset',
    type: 'qa-pair',
    rowCount: 1,
    runCount: 0,
    createdAt: '2026-07-09T00:00:00.000Z',
    creationStatus: 'complete',
    ...overrides
});

vi.mock('../../hooks/useTranslations.js', () => ({
    useTranslations: () => ({
        t: (key, defaultValue) => ({
            'experimental.datasets.deleteSuccess': 'Dataset "{name}" deleted.',
            'experimental.datasets.inUse': 'Dataset "{name}" is in use by active batches and cannot be deleted.',
            'experimental.datasets.exportFailed': 'Failed to export dataset "{name}".'
        }[key] || defaultValue || key)
    })
}));

vi.mock('../../services/experimental/ExperimentalBatchClientService.js', () => ({
    ExperimentalBatchClientService: {
        listDatasets: mockListDatasets,
        exportDataset: mockExportDataset,
        processDataset: mockProcessDataset,
        deleteDataset: mockDeleteDataset
    }
}));

vi.mock('@cdssnc/gcds-components-react', () => ({
    GcdsContainer: ({ children, layout, tag: Tag = 'div' }) => (
        <Tag data-layout={layout || ''}>{children}</Tag>
    ),
    GcdsHeading: ({ children, tag: Tag = 'h2' }) => <Tag>{children}</Tag>,
    GcdsButton: ({ children, onClick, disabled }) => (
        <button onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
    GcdsText: ({ children }) => <div>{children}</div>,
    GcdsInput: ({ label, id, value, onGcdsInput }) => (
        <label htmlFor={id}>
            {label}
            <input id={id} value={value} onChange={onGcdsInput} />
        </label>
    ),
    GcdsLink: ({ children, href }) => <a href={href}>{children}</a>
}));

describe('ExperimentalDatasetsPage', () => {
    beforeEach(() => {
        mockListDatasets.mockReset().mockResolvedValue({ data: [] });
        mockExportDataset.mockReset().mockResolvedValue(new Blob(['chatId,question,answer\n1,Question,Answer'], { type: 'text/csv' }));
        mockProcessDataset.mockReset().mockResolvedValue({});
        mockDeleteDataset.mockReset().mockResolvedValue({});
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:dataset-export');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
    });

    it('uses the page container layout and renders the admin back link', async () => {
        render(<ExperimentalDatasetsPage lang="en" />, { wrapper: MemoryRouter });

        expect(screen.getByText('experimental.datasets.title').closest('[data-layout="page"]')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'common.backToAdmin' }).getAttribute('href')).toBe('/en/admin');
        expect(await screen.findByText('experimental.datasets.empty')).toBeTruthy();
    });

    it('exports a dataset as csv from the actions column', async () => {
        mockListDatasets.mockResolvedValueOnce({
            data: [
                {
                    _id: 'dataset-1',
                    name: 'My Dataset',
                    description: '',
                    type: 'qa-pair',
                    createdBy: { email: 'user@example.com' },
                    rowCount: 1,
                    runCount: 0,
                    createdAt: '2026-07-09T00:00:00.000Z'
                }
            ]
        });

        render(<ExperimentalDatasetsPage lang="en" />, { wrapper: MemoryRouter });

        const exportButton = await screen.findByRole('button', { name: 'experimental.datasets.export' });
        fireEvent.click(exportButton);

        await waitFor(() => {
            expect(mockExportDataset).toHaveBeenCalledWith('dataset-1');
        });

        expect(URL.createObjectURL).toHaveBeenCalled();
        expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });

    it('keeps processing datasets disabled and places the status action inline', async () => {
        mockListDatasets.mockResolvedValueOnce({
            data: [{
                _id: 'dataset-processing',
                name: 'Processing dataset',
                type: 'qa-pair',
                rowCount: 1,
                runCount: 0,
                createdAt: '2026-07-09T00:00:00.000Z',
                creationStatus: 'processing'
            }]
        });

        render(<ExperimentalDatasetsPage lang="en" />, { wrapper: MemoryRouter });

        const processingButton = await screen.findByRole('button', { name: 'experimental.datasets.processing' });
        expect(processingButton.disabled).toBe(true);
        expect(processingButton.closest('.experimental-table-actions--group')).toBeTruthy();
        fireEvent.click(processingButton);
        expect(mockProcessDataset).not.toHaveBeenCalled();

        // Nowhere to navigate yet: the view actions are disabled buttons, not links.
        expect(screen.getByRole('button', { name: 'experimental.datasets.analyze' }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'experimental.datasets.suiteView' }).disabled).toBe(true);
        expect(screen.queryByRole('link', { name: 'experimental.datasets.analyze' })).toBeNull();
    });

    it('renders the analyze, suite grid and create actions as real links', async () => {
        mockListDatasets.mockResolvedValueOnce({
            data: [{
                _id: 'dataset-complete',
                name: 'Complete dataset',
                type: 'qa-pair',
                rowCount: 2,
                runCount: 1,
                createdAt: '2026-07-09T00:00:00.000Z',
                creationStatus: 'complete'
            }]
        });

        render(<ExperimentalDatasetsPage lang="en" />, { wrapper: MemoryRouter });

        const analyze = await screen.findByRole('link', { name: 'experimental.datasets.analyze' });
        expect(analyze.getAttribute('href')).toMatch(/experimental\/analysis\?datasetId=dataset-complete$/);
        expect(screen.getByRole('link', { name: 'experimental.datasets.suiteView' }).getAttribute('href')).toMatch(/experimental\/suites\/dataset-complete$/);
        expect(screen.getByRole('link', { name: 'experimental.datasets.createButton' }).getAttribute('href')).toMatch(/experimental\/create-dataset$/);
        expect(screen.queryByRole('button', { name: 'experimental.datasets.analyze' })).toBeNull();
    });

    it('shows the number of source rows skipped during completed dataset creation', async () => {
        mockListDatasets.mockResolvedValueOnce({
            data: [{
                _id: 'dataset-partial',
                name: 'Partial dataset',
                type: 'qa-pair',
                rowCount: 2,
                runCount: 0,
                createdAt: '2026-07-09T00:00:00.000Z',
                creationStatus: 'complete',
                creationSkippedSourceRows: 1
            }]
        });

        render(<ExperimentalDatasetsPage lang="en" />, { wrapper: MemoryRouter });

        expect(await screen.findByText('experimental.datasets.creationStatus.skippedSourceRows')).toBeTruthy();
    });

    it('shows a failed delete above the table while the upload panel is closed', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        mockListDatasets.mockResolvedValue({ data: [datasetRow()] });
        mockDeleteDataset.mockRejectedValueOnce({ response: { data: { code: 'IN_USE' } } });

        render(<ExperimentalDatasetsPage lang="en" />, { wrapper: MemoryRouter });
        fireEvent.click(await screen.findByRole('button', { name: 'experimental.datasets.delete' }));

        expect(await screen.findByText('Dataset "My Dataset" is in use by active batches and cannot be deleted.')).toBeTruthy();
        expect(document.getElementById('experimental-dataset-upload-panel').hidden).toBe(true);
    });

    it('removes a deleted dataset from the table and moves focus to the outcome', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        mockListDatasets.mockResolvedValueOnce({ data: [datasetRow()] }).mockResolvedValue({ data: [] });

        render(<ExperimentalDatasetsPage lang="en" />, { wrapper: MemoryRouter });
        fireEvent.click(await screen.findByRole('button', { name: 'experimental.datasets.delete' }));

        const outcome = await screen.findByText('Dataset "My Dataset" deleted.');
        await waitFor(() => expect(outcome.closest('[tabindex="-1"]').contains(document.activeElement)).toBe(true));
        await waitFor(() => expect(screen.queryByText('My Dataset')).toBeNull());
    });

    it('shows a failed export on the page instead of a browser alert', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        mockListDatasets.mockResolvedValue({ data: [datasetRow()] });
        mockExportDataset.mockRejectedValueOnce(new Error('network'));

        render(<ExperimentalDatasetsPage lang="en" />, { wrapper: MemoryRouter });
        fireEvent.click(await screen.findByRole('button', { name: 'experimental.datasets.export' }));

        await waitForAnnouncement('Failed to export dataset "My Dataset".', 'assertive');
        expect(alertSpy).not.toHaveBeenCalled();
    });

    it('keeps the table, and the focused Export button, while exporting', async () => {
        mockListDatasets.mockResolvedValue({ data: [datasetRow()] });

        render(<ExperimentalDatasetsPage lang="en" />, { wrapper: MemoryRouter });
        const exportButton = await screen.findByRole('button', { name: 'experimental.datasets.export' });
        const table = document.querySelector('table');
        fireEvent.click(exportButton);

        await waitFor(() => expect(mockExportDataset).toHaveBeenCalledWith('dataset-1'));
        await waitFor(() => expect(screen.getByRole('button', { name: 'experimental.datasets.export' })).toBe(exportButton));
        expect(document.querySelector('table')).toBe(table);
    });

    it('redraws the table when the 5 second check finds a new status', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        try {
            mockListDatasets
                .mockResolvedValueOnce({ data: [datasetRow({ creationStatus: 'processing', rowCount: 0 })] })
                .mockResolvedValue({ data: [datasetRow({ creationStatus: 'failed', rowCount: 0 })] });

            render(<ExperimentalDatasetsPage lang="en" />, { wrapper: MemoryRouter });
            expect(await screen.findByText('experimental.datasets.creationStatus.processing')).toBeTruthy();

            vi.advanceTimersByTime(5000);
            expect(await screen.findByText('experimental.datasets.creationStatus.failed')).toBeTruthy();
        } finally {
            vi.useRealTimers();
        }
    });

    it('shows a loading overlay, then announces when the table has loaded', async () => {
        let resolveList;
        mockListDatasets.mockReturnValueOnce(new Promise(resolve => { resolveList = resolve; }));

        render(<ExperimentalDatasetsPage lang="en" />, { wrapper: MemoryRouter });
        resolveList({ data: [datasetRow()] });

        await waitForAnnouncement('admin.common.resultsLoaded', 'assertive');
        await waitFor(() => expect(document.querySelector('.loading-overlay--scoped')).toBeNull());
    });
});
