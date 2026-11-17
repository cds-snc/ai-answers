/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ExperimentalAnalysisPage from '../experimental/ExperimentalAnalysisPage.js';
import { waitForAnnouncement } from '../../../test/liveAnnouncer.js';

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
            'experimental.analysis.messages.resumeFailed': 'Failed to resume batch "{name}".',
            'experimental.analysis.messages.deleteFailed': 'Failed to delete batch "{name}".',
            'experimental.analysis.messages.deleteSuccess': 'Batch "{name}" deleted.',
            'experimental.analysis.messages.exportFailed': 'Failed to export batch "{name}".',
            'experimental.analysis.messages.exportChatLogsError': 'Failed to export chat logs for "{name}".',
            'experimental.analysis.analyzerPrefix': 'Analyzer',
            'experimental.analysis.analyzers.analyzer-1.name': 'Analyzer 1',
            'experimental.analysis.analyzers.analyzer-1.description': 'Analyzer 1 description'
        }[key] || defaultValue || key)
    })
}));

vi.mock('react-router-dom', () => ({
    useSearchParams: () => [new URLSearchParams('datasetId=dataset-1'), vi.fn()],
    useNavigate: () => vi.fn()
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

vi.mock('@gcds-core/components-react', () => ({
    GcdsIcon: () => null,
    GcdsNotice: ({ children, noticeTitle, noticeTitleTag: Tag = 'h2' }) => (
        <section>
            <Tag>{noticeTitle}</Tag>
            {children}
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
        expect(screen.getAllByRole('link', { name: 'experimental.analysis.viewResults' }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('button', { name: 'experimental.analysis.export' }).length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'experimental.analysis.exportChatLogs' })).toBeTruthy();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });

        expect(mockListBatches).toHaveBeenCalledTimes(4);
        expect(screen.queryByText(/processing/, { selector: 'div' })).toBeNull();
    });

    it('keeps the page heading and reads the selected dataset description with the picker', async () => {
        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('experimental.analysis.title');
        const picker = document.getElementById('dataset-select');
        const description = document.getElementById(picker.getAttribute('aria-describedby'));
        expect(description.textContent).toBe('Dataset description');
        expect(screen.getByRole('link', { name: 'experimental.datasets.backToList' }).getAttribute('href')).toBe(
            '/en/experimental/datasets'
        );
    });

    it('puts Previous runs inside the Batches tab panel', async () => {
        render(<ExperimentalAnalysisPage lang="en" />);
        await act(async () => {
            await Promise.resolve();
        });

        const batchesPanel = document.getElementById('batches-tab-panel');
        expect(batchesPanel.contains(document.getElementById('batches-history'))).toBe(true);

        fireEvent.click(screen.getByRole('tab', { name: 'experimental.analysis.tabs.comparison' }));
        expect(document.getElementById('batches-history')).toBeNull();
    });

    it('has one dataset picker above the tabs, and no suite grid link before the dataset has a comparison', async () => {
        render(<ExperimentalAnalysisPage lang="en" />);
        await act(async () => {
            await Promise.resolve();
        });

        const picker = document.getElementById('dataset-select');
        expect(document.getElementById('batches-tab-panel').contains(picker)).toBe(false);
        expect(screen.queryByRole('link', { name: 'experimental.analysis.suiteViewForDataset' })).toBeNull();

        fireEvent.click(screen.getByRole('tab', { name: 'experimental.analysis.tabs.comparison' }));
        expect(document.querySelectorAll('select[id$="dataset-select"]')).toHaveLength(1);
    });

    it('links to the suite grid under the dataset picker once the dataset has a comparison', async () => {
        mockListBatches.mockImplementation((page, limit, type) => Promise.resolve({
            data: type === 'comparison'
                ? [{ _id: 'comparison-1', name: 'Comparison', type: 'comparison', status: 'completed', summary: {}, createdAt: '2026-05-05T00:00:00.000Z' }]
                : []
        }));
        render(<ExperimentalAnalysisPage lang="en" />);
        await act(async () => {
            await Promise.resolve();
        });

        const suiteHref = '/en/experimental/suites/dataset-1';
        expect(document.querySelector('header').querySelector(`a[href="${suiteHref}"]`)).toBeNull();
        const link = await screen.findByRole('link', { name: 'experimental.analysis.suiteViewForDataset' });
        expect(link.getAttribute('href')).toBe(suiteHref);
    });

    // Hidden panel stays mounted (aria-controls target) but empty, so its
    // progress cards / status message can't announce from off-screen.
    it('keeps both tab panels mounted but renders only the active one', async () => {
        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        const batchesPanel = document.getElementById('batches-tab-panel');
        const comparisonPanel = document.getElementById('comparison-tab-panel');
        expect(batchesPanel.hidden).toBe(false);
        expect(batchesPanel.childElementCount).toBeGreaterThan(0);
        expect(comparisonPanel.hidden).toBe(true);
        expect(comparisonPanel.childElementCount).toBe(0);

        fireEvent.click(screen.getByRole('tab', { name: 'experimental.analysis.tabs.comparison' }));
        expect(batchesPanel.hidden).toBe(true);
        expect(batchesPanel.childElementCount).toBe(0);
        expect(comparisonPanel.hidden).toBe(false);
        expect(comparisonPanel.childElementCount).toBeGreaterThan(0);
    });

    it('shows the analysis mode as a select when the dataset has an answer column', async () => {
        mockListDatasets.mockResolvedValueOnce({
            data: [{
                _id: 'dataset-1',
                name: 'Dataset 1',
                rowCount: 1,
                columns: [{ name: 'question' }, { name: 'answer' }]
            }]
        });

        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        const modeSelect = document.querySelector('#analysis-mode-select');
        expect(modeSelect).toBeTruthy();
        expect(modeSelect.tagName).toBe('SELECT');
        expect(modeSelect.value).toBe('dataset-reference');
        expect(screen.queryByRole('radio')).toBeNull();

        fireEvent.change(modeSelect, { target: { value: 'generated-answer' } });
        expect(modeSelect.value).toBe('generated-answer');
    });

    it('limits reference-required analyzers to dataset-reference mode', async () => {
        mockListAnalyzers.mockResolvedValueOnce([
            {
                id: 'expert-scorer',
                nameKey: 'experimental.analysis.analyzers.expert-scorer.name',
                descriptionKey: 'experimental.analysis.analyzers.expert-scorer.description',
                requiresReference: true
            }
        ]);
        mockListDatasets.mockResolvedValueOnce({
            data: [{
                _id: 'dataset-1',
                name: 'Dataset 1',
                rowCount: 1,
                columns: [{ name: 'question' }, { name: 'answer' }]
            }]
        });

        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.change(screen.getByLabelText('experimental.analysis.selectAnalyzers'), {
            target: { value: 'expert-scorer' }
        });

        const modeSelect = document.querySelector('#analysis-mode-select');
        expect(modeSelect.value).toBe('dataset-reference');
        expect(modeSelect.options).toHaveLength(1);
        expect(modeSelect.options[0].value).toBe('dataset-reference');
    });

    it('does not show the analysis mode select when the dataset has no answer column', async () => {
        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        expect(document.querySelector('#analysis-mode-select')).toBeNull();
        expect(screen.getByText('experimental.analysis.analysisMode.generatedOnly')).toBeTruthy();
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

    it('shows Expert scorer’s reference-required analysis rule', async () => {
        mockListAnalyzers.mockResolvedValueOnce([{
            id: 'expert-scorer',
            nameKey: 'experimental.analysis.analyzers.expert-scorer.name',
            descriptionKey: 'experimental.analysis.analyzers.expert-scorer.description',
            requiresReference: true
        }]);
        mockListDatasets.mockResolvedValueOnce({
            data: [{
                _id: 'dataset-1',
                name: 'Dataset 1',
                rowCount: 1,
                columns: [{ name: 'question' }, { name: 'referenceAnswer' }]
            }]
        });

        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.change(screen.getByLabelText('experimental.analysis.selectAnalyzers'), {
            target: { value: 'expert-scorer' }
        });

        expect(screen.getByText('experimental.analysis.analyzerRules.expert-scorer.rows.referenceAnswer.setup')).toBeTruthy();
        expect(screen.queryByText('experimental.analysis.analyzerRules.expert-scorer.rows.qualityReview.setup')).toBeNull();
    });

    it('filters by the analyzer name on screen and does not sort by analyzer', async () => {
        render(<ExperimentalAnalysisPage lang="en" />);
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        const history = document.getElementById('batches-history');
        const analyzerHeader = [...history.querySelectorAll('th')]
            .find(th => th.textContent === 'experimental.analysis.columns.analyzer');
        expect(analyzerHeader.classList.contains('dt-orderable-none')).toBe(true);

        const search = history.querySelector('input[type="search"]');
        await act(async () => {
            search.value = 'analyzer 1';
            search.dispatchEvent(new Event('input', { bubbles: true }));
            search.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            vi.advanceTimersByTime(1000);
            await Promise.resolve();
        });

        const lastQuery = mockListBatches.mock.calls.filter(call => call[2] === 'analysis').at(-1)[4];
        expect(lastQuery).toMatchObject({ search: 'analyzer 1', analyzerIds: 'analyzer-1' });
    });

    it('names the analyzer rules table by its title', async () => {
        mockListAnalyzers.mockResolvedValueOnce([{
            id: 'expert-scorer',
            nameKey: 'experimental.analysis.analyzers.expert-scorer.name',
            descriptionKey: 'experimental.analysis.analyzers.expert-scorer.description',
            requiresReference: true
        }]);
        mockListDatasets.mockResolvedValueOnce({
            data: [{ _id: 'dataset-1', name: 'Dataset 1', rowCount: 1, columns: [{ name: 'question' }, { name: 'referenceAnswer' }] }]
        });

        render(<ExperimentalAnalysisPage lang="en" />);
        await act(async () => { await Promise.resolve(); });

        fireEvent.change(screen.getByLabelText('experimental.analysis.selectAnalyzers'), {
            target: { value: 'expert-scorer' }
        });

        expect(screen.getByRole('table', { name: 'experimental.analysis.analyzerRules.expert-scorer.title' })).toBeTruthy();
    });

    it('shows the selected analyzer’s batch-comparison rules in Compare batches', async () => {
        mockListAnalyzers.mockResolvedValueOnce([{
            id: 'bias-detection',
            nameKey: 'experimental.analysis.analyzers.bias-detection.name',
            descriptionKey: 'experimental.analysis.analyzers.bias-detection.description'
        }]);
        mockListBatches.mockResolvedValue({
            data: [{
                _id: 'batch-1',
                name: 'Analysis - baseline',
                status: 'completed',
                summary: { completed: 1, failed: 0, total: 1 },
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

        fireEvent.click(screen.getByRole('tab', { name: 'experimental.analysis.tabs.comparison' }));
        fireEvent.change(screen.getByLabelText('experimental.analysis.comparison.baseline'), {
            target: { value: 'batch-1' }
        });

        expect(screen.getByText('experimental.analysis.comparison.analyzerRules.bias-detection.rows.pairedAnswers.setup')).toBeTruthy();
        expect(screen.getByText('experimental.analysis.comparison.analyzerRules.bias-detection.rows.datasetReference.setup')).toBeTruthy();
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
        fireEvent.change(screen.getByLabelText('batch.upload.searchService.label'), {
            target: { value: 'canadaca' }
        });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'experimental.analysis.run' }));
        });

        const expectedRunName = `Analyzer 1 \u00b7 Dataset 1 \u00b7 workflows.generic \u00b7 models.gpt51`;
        expect(mockCreateBatch).toHaveBeenCalledWith(expect.objectContaining({ name: expectedRunName }));
        expect(mockCreateBatch).toHaveBeenCalledWith(expect.objectContaining({
            config: expect.objectContaining({ searchProvider: 'canadaca' })
        }));
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

    it('filters comparison candidates to runs with the baseline analyzer', async () => {
        mockListBatches.mockResolvedValue({
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
                },
                {
                    _id: 'batch-3',
                    name: 'Analysis - analyzer 1 candidate',
                    status: 'completed',
                    summary: { completed: 1, failed: 0, total: 1 },
                    analyzerSummary: {},
                    config: { analyzerIds: ['analyzer-1'] },
                    createdAt: '2026-05-03T00:00:00.000Z',
                    createdBy: { email: 'user@example.com' }
                }
            ]
        });

        render(<ExperimentalAnalysisPage lang="en" />);

        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.click(screen.getByRole('tab', { name: 'experimental.analysis.tabs.comparison' }));
        fireEvent.change(screen.getByLabelText('experimental.analysis.comparison.baseline'), {
            target: { value: 'batch-1' }
        });

        await act(async () => {
            await Promise.resolve();
        });
        const candidateOptions = Array.from(screen.getByLabelText('experimental.analysis.comparison.candidate').options)
            .map(option => option.textContent);
        expect(candidateOptions).toContain('Analysis - analyzer 1 candidate');
        expect(candidateOptions).not.toContain('Analysis - analyzer 2');
    });

    it('shows a comparison outcome on the Comparison tab, not the Batches tab', async () => {
        const completedRun = (id, name) => ({
            _id: id,
            name,
            status: 'completed',
            summary: { completed: 1, failed: 0, total: 1 },
            analyzerSummary: {},
            config: { analyzerIds: ['analyzer-1'] },
            createdAt: '2026-05-05T00:00:00.000Z',
            createdBy: { email: 'user@example.com' }
        });
        mockListBatches.mockResolvedValue({
            data: [completedRun('batch-1', 'Baseline run'), completedRun('batch-2', 'Candidate run')]
        });
        mockCreateBatch.mockRejectedValue(new Error('boom'));

        render(<ExperimentalAnalysisPage lang="en" />);
        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.click(screen.getByRole('tab', { name: 'experimental.analysis.tabs.comparison' }));
        fireEvent.change(screen.getByLabelText('experimental.analysis.comparison.baseline'), {
            target: { value: 'batch-1' }
        });
        fireEvent.change(screen.getByLabelText('experimental.analysis.comparison.candidate'), {
            target: { value: 'batch-2' }
        });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'experimental.analysis.comparison.create' }));
            await Promise.resolve();
        });

        const comparisonPanel = document.getElementById('comparison-tab-panel');
        expect(comparisonPanel.textContent).toContain('experimental.analysis.messages.comparisonFailed');

        fireEvent.click(screen.getByRole('tab', { name: 'experimental.analysis.tabs.batches' }));
        const batchesPanel = document.getElementById('batches-tab-panel');
        expect(batchesPanel.textContent).not.toContain('experimental.analysis.messages.comparisonFailed');
    });

    it('replaces the candidate dropdown with a message when no batch shares the baseline analyzer', async () => {
        mockListBatches.mockResolvedValue({
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

        fireEvent.click(screen.getByRole('tab', { name: 'experimental.analysis.tabs.comparison' }));
        expect(screen.getByLabelText('experimental.analysis.comparison.candidate')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('experimental.analysis.comparison.baseline'), {
            target: { value: 'batch-1' }
        });

        expect(screen.queryByLabelText('experimental.analysis.comparison.candidate')).toBeNull();
        expect(screen.getByRole('heading', { name: 'experimental.analysis.comparison.noCandidatesTitle' })).toBeTruthy();
        expect(screen.getByText('experimental.analysis.comparison.noCandidates')).toBeTruthy();
        await waitForAnnouncement('experimental.analysis.comparison.noCandidatesTitle. experimental.analysis.comparison.noCandidates');
    });

    const flush = async () => {
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });
    };

    const completedBatch = {
        _id: 'batch-1',
        name: 'Analysis - baseline',
        status: 'completed',
        summary: { completed: 1, failed: 0, total: 1 },
        analyzerSummary: {},
        config: { analyzerIds: ['analyzer-1'] },
        createdAt: '2026-05-05T00:00:00.000Z',
        createdBy: { email: 'user@example.com' }
    };

    it('moves focus to the outcome message after deleting a run', async () => {
        mockListBatches.mockResolvedValue({ data: [completedBatch] });
        mockDeleteBatch.mockResolvedValue({});
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

        render(<ExperimentalAnalysisPage lang="en" />);
        await flush();

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await flush();

        expect(mockDeleteBatch).toHaveBeenCalledWith('batch-1');
        expect(document.activeElement.textContent).toContain('Batch "Analysis - baseline" deleted.');
        expect(document.getElementById('batches-history').contains(document.activeElement)).toBe(true);
        confirmSpy.mockRestore();
    });

    it('shows a failed chat log export above the table instead of a browser alert', async () => {
        mockListBatches.mockResolvedValue({ data: [completedBatch] });
        mockExportChatLogs.mockRejectedValue(new Error('boom'));
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

        render(<ExperimentalAnalysisPage lang="en" />);
        await flush();

        fireEvent.click(screen.getByRole('button', { name: 'experimental.analysis.exportChatLogs' }));
        await flush();

        expect(alertSpy).not.toHaveBeenCalled();
        expect(document.getElementById('batches-history').textContent)
            .toContain('Failed to export chat logs for "Analysis - baseline".');
        alertSpy.mockRestore();
    });

    it('keeps the error when one of several batches fails to start', async () => {
        mockCreateBatch.mockResolvedValue({ multiple: true, batches: [{ _id: 'a' }, { _id: 'b' }] });
        mockProcessBatch.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'));

        render(<ExperimentalAnalysisPage lang="en" />);
        await flush();

        fireEvent.change(screen.getByLabelText('experimental.analysis.selectAnalyzers'), {
            target: { value: 'analyzer-1' }
        });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'experimental.analysis.run' }));
        });
        await flush();

        expect(screen.getByText('Failed to start processing.')).toBeTruthy();
        expect(screen.queryByText(/experimental\.analysis\.messages\.startedCount/)).toBeNull();
    });

    it('shows a missing dataset as an error on the dataset field', async () => {
        render(<ExperimentalAnalysisPage lang="en" />);
        await flush();

        fireEvent.change(screen.getByLabelText('experimental.analysis.selectAnalyzers'), {
            target: { value: 'analyzer-1' }
        });
        const datasetSelect = document.getElementById('dataset-select');
        fireEvent.change(datasetSelect, { target: { value: '' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'experimental.analysis.run' }));
        });

        const error = document.getElementById('dataset-select-error');
        expect(error.textContent).toContain('Please select an existing dataset before starting analysis.');
        expect(datasetSelect.getAttribute('aria-describedby')).toBe('dataset-select-error');
        expect(document.activeElement).toBe(error);
        expect(mockCreateBatch).not.toHaveBeenCalled();
    });

    it('exports chat logs for a completed run', async () => {
        mockListBatches.mockResolvedValue({
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

        fireEvent.click(screen.getAllByRole('button', { name: 'experimental.analysis.exportChatLogs' })[1]);

        await act(async () => {
            await Promise.resolve();
        });

        expect(mockExportChatLogs).toHaveBeenCalledWith('batch-2');
        expect(createObjectURL).toHaveBeenCalled();
        expect(clickSpy).toHaveBeenCalled();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:chat-logs');

        createObjectURL.mockRestore();
        revokeObjectURL.mockRestore();
        clickSpy.mockRestore();
    });

    it('shows completed runs in the comparison baseline selector', async () => {
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

        expect(screen.getAllByText('Analysis - baseline').length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('tab', { name: 'experimental.analysis.tabs.comparison' }));
        expect(Array.from(screen.getByLabelText('experimental.analysis.comparison.baseline').options)
            .map(option => option.textContent)).toContain('Analysis - baseline');
    });

    it('shows workflow, model and app version in the Setup column and falls back to N/A when missing', async () => {
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

        expect(screen.getAllByRole('columnheader', { name: 'experimental.analysis.columns.setup' }).length).toBeGreaterThan(0);
        const valueFor = (dl, term) => [...dl.querySelectorAll('dt')].find(dt => dt.textContent === term)?.nextElementSibling.textContent;
        const [configured, legacy] = [...document.querySelectorAll('td dl')].filter(dl => dl.textContent.includes('experimental.analysis.columns.workflow'));
        expect(valueFor(configured, 'experimental.analysis.columns.workflow')).toBe('workflows.generic');
        expect(valueFor(configured, 'batch.upload.model.label')).toBe('common.na');
        expect(valueFor(configured, 'experimental.analysis.columns.appVersion')).toBe('7890abcdef');
        // A legacy batch with no saved workflow, model or version shows N/A for each.
        expect(valueFor(legacy, 'experimental.analysis.columns.workflow')).toBe('common.na');
        expect(valueFor(legacy, 'experimental.analysis.columns.appVersion')).toBe('common.na');
    });

    it('shows partial review and export actions but hides resume for actively updating batches', async () => {
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

        expect(screen.getAllByRole('button', { name: 'experimental.analysis.export' })).toHaveLength(2);
        const viewResultsLinks = screen.getAllByRole('link', { name: 'experimental.analysis.viewResults' });
        expect(viewResultsLinks).toHaveLength(2);
        viewResultsLinks.forEach((link) => {
            expect(link.getAttribute('href')).toMatch(/\/en\/experimental\/analysis\/[^/]+$/);
        });
        expect(screen.queryByRole('button', { name: 'experimental.analysis.resume' })).toBeNull();
    });
});
