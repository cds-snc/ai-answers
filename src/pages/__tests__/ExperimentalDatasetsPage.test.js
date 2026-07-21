/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import ExperimentalDatasetsPage from '../experimental/ExperimentalDatasetsPage.js';

const { mockListDatasets, mockExportDataset, mockProcessDataset } = vi.hoisted(() => ({
    mockListDatasets: vi.fn(),
    mockExportDataset: vi.fn(),
    mockProcessDataset: vi.fn()
}));

vi.mock('../../hooks/useTranslations.js', () => ({
    useTranslations: () => ({
        t: (key, defaultValue) => defaultValue || key
    })
}));

vi.mock('../../services/experimental/ExperimentalBatchClientService.js', () => ({
    ExperimentalBatchClientService: {
        listDatasets: mockListDatasets,
        exportDataset: mockExportDataset,
        processDataset: mockProcessDataset
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
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:dataset-export');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
    });

    it('uses the page container layout and renders the admin back link', async () => {
        render(<ExperimentalDatasetsPage lang="en" />);

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

        render(<ExperimentalDatasetsPage lang="en" />);

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

        render(<ExperimentalDatasetsPage lang="en" />);

        const processingButton = await screen.findByRole('button', { name: 'experimental.datasets.processing' });
        expect(processingButton.disabled).toBe(true);
        expect(processingButton.closest('.d-flex')).toBeTruthy();
        fireEvent.click(processingButton);
        expect(mockProcessDataset).not.toHaveBeenCalled();
    });
});
