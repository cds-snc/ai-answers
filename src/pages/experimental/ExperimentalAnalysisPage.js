import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { usePauseToggle } from '../../hooks/usePauseToggle.js';
import PauseToggleButton from '../../components/admin/PauseToggleButton.js';
import { buildLabelPillHtml } from '../../utils/labelPill.js';
import CellRootLink from '../../components/admin/CellRootLink.js';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsLink, GcdsDetails } from '@cdssnc/gcds-components-react';
import { GcdsNotice } from '@gcds-core/components-react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { WORKFLOWS, AVAILABLE_MODELS, WORKFLOW_VALUES } from '../../config/workflows.js';
import { formatNumber } from '../../utils/numberFormat.js';
import ExperimentalServerDataTable from '../../components/experimental/ExperimentalServerDataTable.js';
import { getPath } from '../../utils/routes.js';
import StatusMessage, { useRepeatableStatus } from '../../components/admin/StatusMessage.js';
import { useAnnounceOnChange } from '../../hooks/useAnnounceOnChange.js';
import { announce } from '../../utils/liveAnnouncer.js';
import { useFocusOnChange } from '../../hooks/useFocusOnChange.js';
import { useInlineFormError } from '../../hooks/useInlineFormError.js';
import FeedbackInlineError from '../../components/chat/FeedbackInlineError.js';
import { SEARCH_PROVIDERS } from '../../config/searchProviders.js';

// One batch's progress: a status line + a real progressbar. Its own small
// component (not a StatusMessage `progress` variant) because determinate
// progress isn't an outcome or an indeterminate wait — see the scope note
// in StatusMessage.js. The status line is announced through the shared
// announcer whenever its text changes (useAnnounceOnChange), not by being
// a live region itself: cards appear when a run starts, and an element
// inserted with its text already in it is never heard.
// Outcome of a row button in one of the history tables, shown above that
// table. A successful Delete or Resume rebuilds the table and takes the
// button with it, so those move focus onto the message instead.
function useTableStatus() {
    const status = useRepeatableStatus();
    const [focusCount, setFocusCount] = useState(0);
    const [movesFocus, setMovesFocus] = useState(false);
    const ref = useFocusOnChange(focusCount);
    const report = (text, { isError = false, focus = false } = {}) => {
        setMovesFocus(focus);
        status.announce(text, { isError });
        if (focus) setFocusCount(n => n + 1);
    };
    return { ...status, ref, movesFocus, report };
}

function TableStatusMessage({ status }) {
    return (
        <StatusMessage
            ref={status.ref}
            tabIndex={-1}
            className="focus-target mb-200"
            announce={!status.movesFocus}
            announcedVia={status.movesFocus ? 'focus' : undefined}
            variant={status.message ? (status.isError ? 'error' : 'success') : undefined}
            message={status.message}
            nonce={status.nonce}
        />
    );
}

function ProgressCard({ id, prog, t, lang, getStatusLabel }) {
    const statusRef = useRef(null);
    useAnnounceOnChange(statusRef);
    const name = prog.name || `${t('experimental.analysis.batchPrefix')} ${id.slice(-6)}`;
    return (
        <div className="border p-200 mb-200 rounded bg-light">
            <div ref={statusRef}><strong>{name}</strong>: {getStatusLabel(prog.status)}</div>
            <div
                role="progressbar"
                aria-valuenow={Math.round(prog.percentComplete)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={name}
                style={{ width: '100%', backgroundColor: '#eee', height: '10px', marginTop: '5px' }}
            >
                <div style={{
                    width: `${prog.percentComplete}%`,
                    backgroundColor: prog.status === 'failed' ? '#d30800' : '#26374a',
                    height: '100%',
                    transition: 'width 0.5s ease-in-out'
                }}></div>
            </div>
            <div className="font-size-text-xxs-nr" style={{ marginTop: '5px' }}>
                {t('experimental.analysis.progressSummary')
                    .replace('{completed}', formatNumber(prog.completed, lang))
                    .replace('{failed}', formatNumber(prog.failed, lang))
                    .replace('{total}', formatNumber(prog.total, lang))}
            </div>
        </div>
    );
}

const DEFAULT_WORKFLOW = WORKFLOW_VALUES[0] || 'GenericGraph';
const ACTIVE_BATCH_WINDOW_MS = 60 * 1000;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
}[character]));

const normalizeWorkflow = (workflow) => (
    WORKFLOW_VALUES.includes(workflow) ? workflow : DEFAULT_WORKFLOW
);

const buildAnalysisRunName = ({ analyzerName, analyzerId, datasetName, datasetId, workflowLabel, modelLabel }) => {
    return [
        analyzerName || analyzerId || '',
        datasetName || datasetId || '',
        workflowLabel || '',
        modelLabel || ''
    ].filter(Boolean).join(' \u00b7 ');
};

const sanitizeFileName = (value) => String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'analysis-run';

const isActivelyRunningBatch = (batch) => {
    if (batch?.status !== 'processing') {
        return false;
    }

    if (!batch?.updatedAt) {
        return false;
    }

    const updatedAtMs = new Date(batch.updatedAt).getTime();
    if (Number.isNaN(updatedAtMs)) {
        return false;
    }

    return (Date.now() - updatedAtMs) < ACTIVE_BATCH_WINDOW_MS;
};

const canResumeBatch = (batch) => batch?.status === 'processing' && !isActivelyRunningBatch(batch);

const isLambdaRuntime = () => typeof window !== 'undefined' && window.RUNTIME_CONFIG?.IS_LAMBDA === true;

const getAnalyzerTranslationKey = (analyzerId, field) => `experimental.analysis.analyzers.${analyzerId}.${field}`;
// Batch status -> the shared .label colour tiers (admin.css): green done,
// blue working, grey waiting, red failed.
const STATUS_PILL_CLASSES = {
    completed: 'complete',
    processing: 'in_progress',
    pending: 'pending',
    failed: 'error'
};

const getStatusTranslationKey = (status) => `experimental.analysis.statuses.${String(status || '').toLowerCase()}`;

const ANALYSIS_RULE_ROWS = {
    'no-analyzer': ['always'],
    // Expert scorer requires the dataset's reference answer in analysis mode.
    'expert-scorer': ['referenceAnswer'],
    'similar-answer': ['withDatasetReference', 'withoutReference'],
    refusal: ['withDatasetReference', 'withoutReference'],
    safety: ['withDatasetReference', 'withoutReference'],
    'bias-detection': ['withDatasetReference', 'withoutReference'],
    'instant-answer': ['goldenReference']
};

const BATCH_COMPARISON_RULE_ROWS = {
    'expert-scorer': ['canonicalReference', 'runToRun'],
    'similar-answer': ['pairedAnswers', 'datasetReference'],
    refusal: ['pairedAnswers', 'datasetReference'],
    safety: ['pairedAnswers', 'datasetReference'],
    'bias-detection': ['pairedAnswers', 'datasetReference']
};

const ANSWER_COLUMN_NAMES = new Set(['answer', 'redactedanswer', 'response', 'referenceanswer']);

const datasetHasReferenceAnswer = (dataset) => (
    dataset?.hasReferenceAnswer === true
    || (Array.isArray(dataset?.columns) && dataset.columns.some((column) => (
        ANSWER_COLUMN_NAMES.has(String(column?.name || '').replace(/[\s_-]+/g, '').toLowerCase())
    )))
);

export default function ExperimentalAnalysisPage({ lang = 'en' }) {
    const { t } = useTranslations(lang);
    const locale = String(lang || 'en').toLowerCase().startsWith('fr') ? 'fr-CA' : 'en-CA';
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const datasetIdParam = searchParams.get('datasetId');

    // State
    const [analyzers, setAnalyzers] = useState([]);
    const [selectedAnalyzerId, setSelectedAnalyzerId] = useState('');

    const [datasets, setDatasets] = useState([]);
    const [selectedDatasetId, setSelectedDatasetId] = useState(datasetIdParam || '');
    const [comparisonBaselineId, setComparisonBaselineId] = useState('');
    const [comparisonCandidateId, setComparisonCandidateId] = useState('');
    const [comparisonLoading, setComparisonLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') === 'comparison' ? 'comparison' : 'batches');
    const [analysisMode, setAnalysisMode] = useState('generated-answer');
    const [runLabel, setRunLabel] = useState('');
    const [trials, setTrials] = useState(1);
    const [selectedWorkflow, setSelectedWorkflow] = useState(DEFAULT_WORKFLOW);
    const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0]?.value || 'openai-gpt51');
    const [selectedSearch, setSelectedSearch] = useState('');

    const [loading, setLoading] = useState(false);
    const [batches, setBatches] = useState([]);
    const [comparisons, setComparisons] = useState([]);
    // Outcome of the last run/resume/comparison action; 'info' for "started".
    const runStatus = useRepeatableStatus();
    const showInfo = (text) => runStatus.announce(text, { isError: false });
    const showError = (text) => runStatus.announce(text, { isError: true });
    const comparisonStatus = useRepeatableStatus();
    const historyStatus = useTableStatus();
    const comparisonTableStatus = useTableStatus();
    const datasetError = useInlineFormError();
    const [startingRun, setStartingRun] = useState(null);
    // The "starting run" card below is announced when it appears / its
    // text changes, rather than being a live region itself (it's
    // conditionally rendered).
    const startingRunRef = useRef(null);
    useAnnounceOnChange(startingRunRef);

    // Progress tracking
    const [batchProgress, setBatchProgress] = useState({});
    const [comparisonProgress, setComparisonProgress] = useState({});
    const [tableRefreshKey, setTableRefreshKey] = useState(0);
    const pollRef = useRef(null);
    const isMountedRef = useRef(true);
    const previousBatchStatusesRef = useRef(new Map());

    // ARIA APG Tabs pattern: roving tabindex across the two tabs, moved with
    // Arrow/Home/End and activated immediately (automatic activation - only
    // two tabs, no async cost to switching).
    const TAB_IDS = ['batches', 'comparison'];
    const tabRefs = useRef({});
    const focusTab = (tabId) => {
        setActiveTab(tabId);
        tabRefs.current[tabId]?.focus();
    };
    const handleTabKeyDown = (e) => {
        const currentIndex = TAB_IDS.indexOf(activeTab);
        let nextIndex = null;
        if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TAB_IDS.length;
        else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TAB_IDS.length) % TAB_IDS.length;
        else if (e.key === 'Home') nextIndex = 0;
        else if (e.key === 'End') nextIndex = TAB_IDS.length - 1;
        if (nextIndex !== null) {
            e.preventDefault();
            focusTab(TAB_IDS[nextIndex]);
        }
    };

    // WCAG 2.2.2 (Pause, Stop, Hide): this poll runs every 5s for as long as
    // any batch/comparison is pending or processing, and there's no other
    // control on this page that halts it (the runs themselves keep going
    // server-side regardless). This poll starts/stops conditionally based on
    // fetched data rather than on mount, so it uses usePauseToggle's
    // guardPoll directly instead of usePausablePolling.
    const { isPaused: isPollPaused, togglePause: toggleIsPollPaused, guardPoll } = usePauseToggle();

    const stopPolling = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    };

    const buildProgressMap = (batchList, includePending = false) => {
        return batchList
            .filter(batch => batch.status === 'processing' || (includePending && batch.status === 'pending'))
            .reduce((acc, batch) => {
                const completed = batch.summary?.completed ?? 0;
                const failed = batch.summary?.failed ?? 0;
                const total = batch.summary?.total ?? 0;

                acc[batch._id] = {
                    status: batch.status,
                    completed,
                    failed,
                    total,
                    name: batch.name || '',
                    percentComplete: total > 0
                        ? Math.round(((completed + failed) / total) * 100)
                        : 0,
                    analyzerSummary: batch.analyzerSummary || {}
                };
                return acc;
            }, {});
    };

    const loadBatches = async (datasetId = selectedDatasetId) => {
        try {
            const [result, comparisonResult] = await Promise.all([
                ExperimentalBatchClientService.listBatches(1, 100, 'analysis', datasetId),
                ExperimentalBatchClientService.listBatches(1, 100, 'comparison', datasetId)
            ]);
            const nextBatches = result.data || [];

            if (!isMountedRef.current) {
                return nextBatches;
            }

            setBatches(nextBatches);
            setComparisons(comparisonResult.data || []);
            setBatchProgress(buildProgressMap(nextBatches));
            setComparisonProgress(buildProgressMap(comparisonResult.data || [], true));

            const currentBatches = [...nextBatches, ...(comparisonResult.data || [])];
            const currentStatuses = new Map(currentBatches.map(batch => [batch._id, batch.status]));
            const activeStatuses = new Set(['pending', 'processing']);
            const completedRun = [...previousBatchStatusesRef.current.entries()].some(([id, previousStatus]) => (
                activeStatuses.has(previousStatus)
                && currentStatuses.has(id)
                && !activeStatuses.has(currentStatuses.get(id))
            ));
            if (completedRun) {
                setTableRefreshKey(key => key + 1);
            }
            previousBatchStatusesRef.current = currentStatuses;

            const hasActiveRuns = nextBatches.some(batch => batch.status === 'processing')
                || (comparisonResult.data || []).some(batch => ['pending', 'processing'].includes(batch.status));
            if (hasActiveRuns) {
                if (!pollRef.current) {
                    pollRef.current = setInterval(guardPoll(() => loadBatches(datasetId)), 5000);
                }
            } else {
                stopPolling();
            }

            return nextBatches;
        } catch (err) {
            console.error(err);
            return [];
        }
    };

    useEffect(() => {
        isMountedRef.current = true;
        if (datasetIdParam) setSelectedDatasetId(datasetIdParam);
        fetchInitialData();
        return () => {
            isMountedRef.current = false;
            stopPolling();
        };
    }, [datasetIdParam]);

    useEffect(() => {
        loadBatches(selectedDatasetId);
        return () => {
            stopPolling();
        };
    }, [selectedDatasetId]);

    const selectedDataset = datasets.find(ds => ds._id === selectedDatasetId);
    const hasDatasetReferenceAnswer = datasetHasReferenceAnswer(selectedDataset);
    const selectedAnalyzer = analyzers.find(a => a.id === selectedAnalyzerId);
    const availableAnalyzers = analyzers.filter((analyzer) => (
        (analyzer.requiresReference !== true || hasDatasetReferenceAnswer)
        && (!Array.isArray(analyzer.supportedWorkflows) || analyzer.supportedWorkflows.includes(selectedWorkflow))
    ));

    useEffect(() => {
        setAnalysisMode(hasDatasetReferenceAnswer ? 'dataset-reference' : 'generated-answer');
    }, [selectedDatasetId, hasDatasetReferenceAnswer]);

    useEffect(() => {
        if (selectedAnalyzer?.requiresReference === true && hasDatasetReferenceAnswer) {
            setAnalysisMode('dataset-reference');
        }
    }, [selectedAnalyzer, hasDatasetReferenceAnswer]);

    useEffect(() => {
        if (selectedAnalyzerId && !availableAnalyzers.some(analyzer => analyzer.id === selectedAnalyzerId)) {
            setSelectedAnalyzerId('');
        }
    }, [availableAnalyzers, selectedAnalyzerId]);

    const fetchInitialData = async () => {
        try {
            const [az, ds] = await Promise.all([
                ExperimentalBatchClientService.listAnalyzers(),
                ExperimentalBatchClientService.listDatasets()
            ]);
            setAnalyzers(az);
            setDatasets(ds.data || []);
        } catch (err) {
            console.error('Failed to fetch initial data:', err);
        }
    };

    const getLocalizedAnalyzerText = (analyzer, field) => {
        if (!analyzer?.id) {
            return '';
        }

        const key = analyzer?.[`${field}Key`] || getAnalyzerTranslationKey(analyzer.id, field);
        const translated = t(key);
        if (translated === key) {
            if (field === 'name') {
                return analyzer?.id || '';
            }
            return '';
        }

        return translated;
    };

    const getAnalyzerDisplayName = (analyzer) => getLocalizedAnalyzerText(analyzer, 'name');
    const getAnalyzerDescription = (analyzer) => analyzer?.id === 'expert-scorer'
        ? t('experimental.analysis.expertScorerDescription')
        : getLocalizedAnalyzerText(analyzer, 'description');
    const getComparisonAnalyzerDescription = (analyzer) => (
        analyzer?.id ? t(`experimental.analysis.comparison.analyzers.${analyzer.id}`) : ''
    );

    const getStatusLabel = (status) => {
        const key = getStatusTranslationKey(status);
        const translated = t(key);
        return translated === key ? String(status || '') : translated;
    };

    const resolveBatchAnalyzerId = (batch) => {
        if (batch?.config?.analyzerId) return batch.config.analyzerId;
        if (Array.isArray(batch?.config?.analyzerIds) && batch.config.analyzerIds.length > 0) {
            return batch.config.analyzerIds[0];
        }
        return '';
    };

    const handleRunAnalysis = async () => {
        // Run stays disabled until an analyzer is picked.
        if (!selectedAnalyzerId) return;

        if (!selectedDatasetId) {
            datasetError.triggerError();
            return;
        }

        const selectedAnalyzer = analyzers.find(a => a.id === selectedAnalyzerId);
        const selectedWorkflowLabel = WORKFLOWS.find(item => item.value === normalizeWorkflow(selectedWorkflow));
        const selectedModelLabel = AVAILABLE_MODELS.find(item => item.value === selectedModel);
        const runName = buildAnalysisRunName({
            analyzerName: getAnalyzerDisplayName(selectedAnalyzer),
            analyzerId: selectedAnalyzerId,
            datasetName: selectedDataset?.name || '',
            datasetId: selectedDatasetId,
            workflowLabel: selectedWorkflowLabel ? t(selectedWorkflowLabel.labelKey) : '',
            modelLabel: selectedModelLabel ? t(selectedModelLabel.labelKey) : '',
        });

        setLoading(true);
        setStartingRun({
            name: runName,
            status: t('experimental.analysis.startingRun'),
            message: t('experimental.analysis.messages.startingRun')
        });
        runStatus.clear();

        try {

            // Create Batch
        const batchData = {
            name: runName,
            description: `${t('experimental.analysis.analyzerPrefix')} ${selectedAnalyzerId}`,
            runLabel: runLabel.trim(),
            type: 'analysis',
            config: {
                analyzerId: selectedAnalyzerId,
                analyzerIds: [selectedAnalyzerId],
                workflow: normalizeWorkflow(selectedWorkflow),
                aiProvider: selectedModel || undefined,
                searchProvider: selectedSearch,
                datasetId: selectedDatasetId || undefined,
                analysisMode,
                trials,
                pageLanguage: String(lang || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en',
            }
        };

            const result = await ExperimentalBatchClientService.createBatch(batchData);

            if (result.multiple) {
                // For multiple results, kick off processing for each and track progress.
                let failedCount = 0;
                for (const b of result.batches) {
                    try {
                        await ExperimentalBatchClientService.processBatch(b._id);
                    } catch (err) {
                        console.error('Process batch error:', err);
                        failedCount += 1;
                    }
                }
                if (failedCount > 0) {
                    showError(t('experimental.analysis.messages.startProcessingError'));
                } else {
                    showInfo(t('experimental.analysis.messages.startedCount').replace('{count}', result.batches.length));
                }
            } else {
                try {
                    await ExperimentalBatchClientService.processBatch(result._id);
                    showInfo(t('experimental.analysis.messages.processingStarted'));
                } catch (err) {
                    console.error('Process batch error:', err);
                    showError(t('experimental.analysis.messages.startProcessingError'));
                }
            }
            setRunLabel('');
        } catch (err) {
            console.error(err);
            // err.message is a locale key when the server returned a known error.
            // Try translating it first; fall back to the generic failure message
            // when it resolves to the key itself.
            const translated = err?.message ? t(err.message) : null;
            const isLocaleKey = translated && translated !== err.message;
            showError(isLocaleKey ? translated : t('experimental.analysis.messages.startAnalysisFailed'));
        } finally {
            setStartingRun(null);
            setLoading(false);
            await loadBatches(selectedDatasetId);
        }
    };

    // A row outcome names its batch: the message shows above the table, away
    // from the row, and a deleted row is gone.
    const withBatchName = (key, batch) => t(key).replace('{name}', () => batch.name);

    const handleDeleteBatch = async (batch, tableStatus) => {
        if (!window.confirm(t('experimental.analysis.messages.confirmDelete'))) return;
        try {
            await ExperimentalBatchClientService.deleteBatch(batch._id);
            await loadBatches(selectedDatasetId);
            setTableRefreshKey(key => key + 1);
            tableStatus.report(withBatchName('experimental.analysis.messages.deleteSuccess', batch), { focus: true });
        } catch (err) {
            console.error('Delete error:', err);
            tableStatus.report(withBatchName('experimental.analysis.messages.deleteFailed', batch), { isError: true });
        }
    };

    const handleExport = async (batch, tableStatus) => {
        try {
            const blob = await ExperimentalBatchClientService.exportBatch(batch._id, 'excel', lang);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `batch-${batch._id}-results.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export error:', err);
            tableStatus.report(withBatchName('experimental.analysis.messages.exportFailed', batch), { isError: true });
        }
    };

    const handleExportChatLogs = async (batch) => {
        try {
            const blob = await ExperimentalBatchClientService.exportChatLogs(batch._id);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat-logs-${sanitizeFileName(batch.name || batch._id)}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export chat logs error:', err);
            historyStatus.report(withBatchName('experimental.analysis.messages.exportChatLogsError', batch), { isError: true });
        }
    };

    const handleResumeBatch = async (batch) => {
        try {
            setLoading(true);
            await ExperimentalBatchClientService.processBatch(batch._id, true);
            await loadBatches(selectedDatasetId);
            setTableRefreshKey(key => key + 1);
            historyStatus.report(withBatchName('experimental.analysis.messages.resumeStarted', batch), { focus: true });
        } catch (err) {
            console.error('Resume batch error:', err);
            historyStatus.report(withBatchName('experimental.analysis.messages.resumeFailed', batch), { isError: true });
        } finally {
            setLoading(false);
        }
    };

    const supportsBatchComparison = (batch) => {
        const analyzer = analyzers.find(candidate => candidate.id === resolveBatchAnalyzerId(batch));
        return analyzer?.supportsBatchComparison !== false;
    };

    const comparisonBaseline = batches.find(batch => batch._id === comparisonBaselineId);
    const comparisonAnalyzer = analyzers.find(analyzer => analyzer.id === resolveBatchAnalyzerId(comparisonBaseline));
    const comparisonCandidates = batches.filter(batch => (
        batch.status === 'completed'
        && batch._id !== comparisonBaselineId
        && supportsBatchComparison(batch)
        && (!comparisonBaseline || resolveBatchAnalyzerId(batch) === resolveBatchAnalyzerId(comparisonBaseline))
    ));
    const noComparisonCandidates = Boolean(comparisonBaselineId) && comparisonCandidates.length === 0;

    // The notice replaces the "Compare against" dropdown without taking focus,
    // so say why the dropdown went away.
    useEffect(() => {
        if (!noComparisonCandidates) return;
        announce(`${t('experimental.analysis.comparison.noCandidatesTitle')}. ${t('experimental.analysis.comparison.noCandidates')}`);
    }, [noComparisonCandidates, comparisonBaselineId, t]);

    const handleCreateComparison = async () => {
        if (!comparisonBaselineId || !comparisonCandidateId) {
            comparisonStatus.announce(t('experimental.analysis.messages.selectComparisonRuns'), { isError: true });
            return;
        }

        const baseline = batches.find(batch => batch._id === comparisonBaselineId);
        const candidate = batches.find(batch => batch._id === comparisonCandidateId);
        if (!baseline || !candidate) return;

        setComparisonLoading(true);
        try {
            const analyzerId = resolveBatchAnalyzerId(baseline);
            const result = await ExperimentalBatchClientService.createBatch({
                name: `${t('experimental.analysis.comparison.titlePrefix')} ${getRunLabel(baseline)} → ${getRunLabel(candidate)}`,
                description: `${t('experimental.analysis.comparison.baselinePrefix')} ${getRunLabel(baseline)}`,
                type: 'comparison',
                config: {
                    datasetId: selectedDatasetId,
                    analyzerId,
                    analyzerIds: [analyzerId],
                    baselineRunId: baseline._id,
                    candidateRunId: candidate._id
                }
            });
            await ExperimentalBatchClientService.processBatch(result._id);
            setComparisonProgress(current => ({
                ...current,
                ...buildProgressMap([{
                    ...result,
                    status: 'processing'
                }], true)
            }));
            comparisonStatus.announce(t('experimental.analysis.messages.comparisonStarted'), { isError: false });
            setComparisonBaselineId('');
            setComparisonCandidateId('');
            await loadBatches(selectedDatasetId);
        } catch (err) {
            console.error('Comparison creation error:', err);
            comparisonStatus.announce(t('experimental.analysis.messages.comparisonFailed'), { isError: true });
        } finally {
            setComparisonLoading(false);
        }
    };

    const getRunLabel = (batch) => batch?.name || `${t('experimental.analysis.batchPrefix')} ${String(batch?._id || '').slice(-6)}`;

    const getAnalyzerLabel = (batch) => {
        const id = resolveBatchAnalyzerId(batch);
        if (!id) return batch?.name || '';
        return getAnalyzerDisplayName(analyzers.find(a => a.id === id)) || id;
    };

    const getWorkflowLabel = (batch) => {
        const workflowId = batch?.config?.workflow;
        if (!workflowId) return t('common.na');
        const workflow = WORKFLOWS.find(item => item.value === normalizeWorkflow(workflowId));
        return workflow?.labelKey ? t(workflow.labelKey) : t('common.na');
    };

    const getModelLabel = (batch) => {
        const modelId = batch?.config?.aiProvider;
        if (!modelId) return t('common.na');
        if (modelId === 'azure') return t('common.na');
        const model = AVAILABLE_MODELS.find(item => item.value === modelId);
        return model?.labelKey ? t(model.labelKey) : t('common.na');
    };

    const getAppVersionLabel = (batch) => {
        const appVersion = String(batch?.appVersion || '').trim();
        return appVersion ? appVersion.slice(-10) : t('common.na');
    };

    const fetchBatchTableData = useCallback((query) => (
        ExperimentalBatchClientService.listBatches(1, 10, 'analysis', selectedDatasetId, query)
    ), [selectedDatasetId]);

    const fetchComparisonTableData = useCallback((query) => (
        ExperimentalBatchClientService.listBatches(1, 10, 'comparison', selectedDatasetId, query)
    ), [selectedDatasetId]);

    const formatDate = (value) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
    // Second line under a cell's main value, in smaller grey text.
    const secondaryLine = (text) => `<div class="experimental-table-secondary">${escapeHtml(text)}</div>`;
    // Labelled values in one cell; values arrive already escaped.
    const detailsList = (pairs) => `<dl class="canada-ca-dl-columns canada-ca-dl-columns--single experimental-table-dl">${pairs.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
    const statusPill = (status) => buildLabelPillHtml(STATUS_PILL_CLASSES[status] || 'unknown', getStatusLabel(status));
    const resultsCell = (row, withFlagged) => {
        const summary = row.summary || {};
        const completed = t('experimental.analysis.results.completed')
            .replace('{completed}', formatNumber(summary.completed || 0, lang))
            .replace('{total}', formatNumber(summary.total || 0, lang));
        const detail = (withFlagged ? t('experimental.analysis.results.failedFlagged') : t('experimental.analysis.results.failed'))
            .replace('{failed}', formatNumber(summary.failed || 0, lang))
            .replace('{flagged}', formatNumber(summary.flagged || 0, lang));
        return `${escapeHtml(completed)}${secondaryLine(detail)}`;
    };

    const batchColumns = [
        { title: t('experimental.analysis.columns.name'), data: 'name', width: '22%', render: (data, type, row) => type === 'display' ? detailsList([
            [t('experimental.analysis.details.name'), `<span class="experimental-table-name">${escapeHtml(data)}</span>`],
            [t('experimental.analysis.details.createdBy'), escapeHtml(row.createdBy?.email || t('common.na'))]
        ]) : data },
        { title: t('experimental.analysis.columns.analyzer'), data: 'config.analyzerId', width: '12%', render: (_data, _type, row) => escapeHtml(getAnalyzerLabel(row)) },
        { title: t('experimental.analysis.columns.setup'), data: null, orderable: false, width: '19%', render: (_data, _type, row) => detailsList([
            [t('experimental.analysis.columns.workflow'), escapeHtml(getWorkflowLabel(row))],
            [t('batch.upload.model.label'), escapeHtml(getModelLabel(row))],
            [t('experimental.analysis.columns.appVersion'), escapeHtml(getAppVersionLabel(row))]
        ]) },
        { title: t('experimental.analysis.columns.results'), data: 'summary.completed', className: 'dt-left', width: '14%', render: (_data, type, row) => type === 'display' ? resultsCell(row, true) : row.summary?.completed },
        { title: t('experimental.analysis.columns.status'), data: 'status', width: '9%', render: (data, type) => type === 'display' ? statusPill(data) : data },
        { title: t('experimental.analysis.columns.date'), data: 'createdAt', width: '10%', render: (data, type) => type === 'display' ? formatDate(data) : data }
    ];

    const comparisonColumns = [
        { title: t('experimental.analysis.comparison.columns.name'), data: 'name', width: '28%', render: (data, type) => type === 'display' ? `<span class="experimental-table-name">${escapeHtml(data)}</span>` : data },
        { title: t('experimental.analysis.comparison.columns.analyzer'), data: 'config.analyzerId', width: '16%', render: (_data, _type, row) => escapeHtml(getAnalyzerLabel(row)) },
        { title: t('experimental.analysis.columns.results'), data: 'summary.completed', className: 'dt-left', width: '18%', render: (_data, type, row) => type === 'display' ? resultsCell(row, false) : row.summary?.completed },
        { title: t('experimental.analysis.comparison.columns.status'), data: 'status', width: '12%', render: (data, type) => type === 'display' ? statusPill(data) : data },
        { title: t('experimental.analysis.comparison.columns.date'), data: 'createdAt', width: '12%', render: (data, type) => type === 'display' ? formatDate(data) : data }
    ];

    const renderComparisonActions = (comparison) => (
        <div className="experimental-table-actions experimental-table-actions--group experimental-table-actions--stacked" role="group" aria-label={t('experimental.analysis.comparison.columns.actions')}>
            <CellRootLink className="filter-button filter-button-primary" navigate={navigate} href={`${getPath('experimental-analysis', lang)}/${comparison._id}`}>{t('experimental.analysis.viewResults')}</CellRootLink>
            <GcdsButton size="small" buttonRole="secondary" onClick={() => handleExport(comparison, comparisonTableStatus)}>{t('experimental.analysis.export')}</GcdsButton>
            <GcdsButton size="small" buttonRole="danger" onClick={() => handleDeleteBatch(comparison, comparisonTableStatus)}>{t('experimental.analysis.delete')}</GcdsButton>
        </div>
    );

    const renderBatchActions = (batch) => (
        <div className="experimental-table-actions experimental-table-actions--group experimental-table-actions--stacked" role="group" aria-label={t('experimental.analysis.columns.actions')}>
            <CellRootLink className="filter-button filter-button-primary" navigate={navigate} href={`${getPath('experimental-analysis', lang)}/${batch._id}`}>{t('experimental.analysis.viewResults')}</CellRootLink>
            <GcdsButton size="small" buttonRole="secondary" onClick={() => handleExport(batch, historyStatus)}>{t('experimental.analysis.export')}</GcdsButton>
            <GcdsButton size="small" buttonRole="secondary" onClick={() => handleExportChatLogs(batch)}>{t('experimental.analysis.exportChatLogs')}</GcdsButton>
            {isLambdaRuntime() && canResumeBatch(batch) && <GcdsButton size="small" buttonRole="secondary" onClick={() => handleResumeBatch(batch)}>{t('experimental.analysis.resume')}</GcdsButton>}
            <GcdsButton size="small" buttonRole="danger" onClick={() => handleDeleteBatch(batch, historyStatus)}>{t('experimental.analysis.delete')}</GcdsButton>
        </div>
    );

    // Rendered next to the "Running status" progress cards in both tab
    // panels — that's the content the 5s poll actually keeps auto-updating,
    // not the static configuration form above it or the history table below
    // (which only remounts once, as a side effect, when a run finishes).
    const renderPauseToggle = () => (
        <PauseToggleButton isPaused={isPollPaused} onToggle={toggleIsPollPaused} t={t} className="mb-200" />
    );

    const renderProgressCards = (progressMap) => Object.entries(progressMap).map(([id, prog]) => (
        <ProgressCard key={id} id={id} prog={prog} t={t} lang={lang} getStatusLabel={getStatusLabel} />
    ));

    const renderAnalyzerRulesTable = (analyzerId, mode) => {
        const ruleRows = mode === 'comparison'
            ? BATCH_COMPARISON_RULE_ROWS[analyzerId]
            : ANALYSIS_RULE_ROWS[analyzerId];
        if (!ruleRows) return null;

        const keyPrefix = mode === 'comparison'
            ? 'experimental.analysis.comparison.analyzerRules'
            : 'experimental.analysis.analyzerRules';
        const titleId = `${mode}-${analyzerId}-rules-title`;

        return (
            <div className="overflow-auto mt-300">
                <GcdsText className="mb-200">
                    <strong id={titleId}>{t(`${keyPrefix}.${analyzerId}.title`)}</strong>
                </GcdsText>
                <table aria-labelledby={titleId} style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                            <th className="p-200">{t(`${keyPrefix}.headers.setup`)}</th>
                            <th className="p-200">{t(`${keyPrefix}.headers.comparison`)}</th>
                            <th className="p-200">{t(`${keyPrefix}.headers.flagged`)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ruleRows.map(rule => (
                            <tr key={rule} style={{ borderBottom: '1px solid #eee' }}>
                                <td className="p-200">{t(`${keyPrefix}.${analyzerId}.rows.${rule}.setup`)}</td>
                                <td className="p-200">{t(`${keyPrefix}.${analyzerId}.rows.${rule}.comparison`)}</td>
                                <td className="p-200">{t(`${keyPrefix}.${analyzerId}.rows.${rule}.flagged`)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <GcdsContainer layout="page" className="mb-600 filter-fields-full-size">
            <header className="mb-400">
                <GcdsHeading tag="h1">{t('experimental.analysis.title')}</GcdsHeading>
                <nav aria-label={t('admin.navigation.ariaLabel')}>
                    <GcdsLink href={getPath('experimental-datasets', lang)}>
                        {t('experimental.datasets.backToList')}
                    </GcdsLink>
                </nav>
            </header>

            {/* One dataset for the whole page: it scopes both tabs' forms and tables. */}
            <div className="mb-400 settings-form-width">
                {datasetError.hasError && (
                    <FeedbackInlineError
                        id="dataset-select-error"
                        message={t('experimental.analysis.messages.selectDataset')}
                        errorCount={datasetError.errorCount}
                        inputRef={datasetError.errorRef}
                    />
                )}
                <label htmlFor="dataset-select" className="filter-label display-block">
                    {t('experimental.analysis.useExistingDatasetLabel')}
                </label>
                <select
                    id="dataset-select"
                    value={selectedDatasetId}
                    onChange={(e) => {
                        setSelectedDatasetId(e.target.value);
                        datasetError.clearError();
                    }}
                    aria-describedby={[
                        datasetError.hasError && 'dataset-select-error',
                        selectedDataset?.description && 'dataset-select-description'
                    ].filter(Boolean).join(' ') || undefined}
                    className="filter-select"
                >
                    <option value="">{t('experimental.analysis.datasetSelectPlaceholder')}</option>
                    {datasets.map(ds => (
                        <option key={ds._id} value={ds._id}>
                            {ds.name} ({formatNumber(ds.rowCount, lang)} {t('experimental.analysis.datasetRows')})
                        </option>
                    ))}
                </select>
                {!selectedDatasetId && (
                    <GcdsText className="mt-200">
                        {t('experimental.analysis.datasetHelper')}
                    </GcdsText>
                )}
                {/* The dropdown already shows the name; the description is read
                    with it. */}
                {selectedDataset?.description && (
                    <div className="mt-200">
                        <dl className="canada-ca-dl-inline">
                            <div>
                                <dt>{t('experimental.suite.descriptionLabel')}</dt>
                                <dd id="dataset-select-description">{selectedDataset.description}</dd>
                            </div>
                        </dl>
                    </div>
                )}
                {/* The suite grid lists comparisons, so it has nothing to show
                    until this dataset has one. */}
                {selectedDataset && comparisons.length > 0 && (
                    <GcdsText marginTop="300" marginBottom="0">
                        <GcdsLink href={`${getPath('experimental-suites', lang)}/${selectedDataset._id}`}>
                            {t('experimental.analysis.suiteViewForDataset')}
                        </GcdsLink>
                    </GcdsText>
                )}
            </div>

            <div
                className="experimental-analysis-tabs"
                role="tablist"
                aria-label={t('experimental.analysis.tabs.label')}
                onKeyDown={handleTabKeyDown}
            >
                <button
                    type="button"
                    role="tab"
                    id="batches-tab"
                    ref={(el) => { tabRefs.current.batches = el; }}
                    tabIndex={activeTab === 'batches' ? 0 : -1}
                    aria-selected={activeTab === 'batches'}
                    aria-controls="batches-tab-panel"
                    className={`experimental-analysis-tab${activeTab === 'batches' ? ' experimental-analysis-tab--active' : ''}`}
                    onClick={() => setActiveTab('batches')}
                >
                    {t('experimental.analysis.tabs.batches')}
                </button>
                <button
                    type="button"
                    role="tab"
                    id="comparison-tab"
                    ref={(el) => { tabRefs.current.comparison = el; }}
                    tabIndex={activeTab === 'comparison' ? 0 : -1}
                    aria-selected={activeTab === 'comparison'}
                    aria-controls="comparison-tab-panel"
                    className={`experimental-analysis-tab${activeTab === 'comparison' ? ' experimental-analysis-tab--active' : ''}`}
                    onClick={() => setActiveTab('comparison')}
                >
                    {t('experimental.analysis.tabs.comparison')}
                </button>
            </div>

            {/* Both panel boxes stay mounted so each tab's aria-controls resolves,
                but only the active one renders content: its progress cards and
                status message announce through the shared announcer, and would
                be heard from a hidden panel. */}
            <div id="batches-tab-panel" role="tabpanel" aria-labelledby="batches-tab" hidden={activeTab !== 'batches'}>
            {activeTab === 'batches' && <>
                    <section>
                        <GcdsHeading tag="h2">{t('experimental.analysis.configuration')}</GcdsHeading>

                        {/* Analyzer selector */}
                        <div className="mb-200 settings-form-width">
                            <label htmlFor="analyzer-select" className="filter-label display-block">
                                {t('experimental.analysis.selectAnalyzers')}
                            </label>
                            <select
                                id="analyzer-select"
                                value={selectedAnalyzerId}
                                onChange={(e) => {
                                    setSelectedAnalyzerId(e.target.value);
                                }}
                                className="filter-select"
                            >
                                <option value="">{t('experimental.analysis.messages.selectAnalyzer')}</option>
                                {availableAnalyzers.map(a => (
                                    <option key={a.id} value={a.id}>
                                        {getAnalyzerDisplayName(a)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {selectedAnalyzerId && selectedAnalyzer && (
                            <GcdsDetails detailsTitle={t('experimental.analysis.analyzerDetailsTitle')} className="mb-400">
                                <GcdsText className="mb-200">
                                    <strong>{getAnalyzerDisplayName(selectedAnalyzer)}</strong>
                                </GcdsText>
                                {getAnalyzerDescription(selectedAnalyzer)
                                    .split('\n')
                                    .filter(line => line.trim())
                                    .map((line, idx) => (
                                        <GcdsText key={idx} className="mb-200">{line}</GcdsText>
                                    ))}
                                {renderAnalyzerRulesTable(selectedAnalyzerId, 'analysis')}
                            </GcdsDetails>
                        )}

                        <div className="mb-400 settings-form-width">
                            <label htmlFor="analysis-mode-select" className="filter-label display-block">
                                {t('experimental.analysis.analysisMode.label')}
                            </label>
                            {hasDatasetReferenceAnswer ? (<>
                                <p id="analysis-mode-hint" className="field-hint">{t('experimental.analysis.analysisMode.hint')}</p>
                                <select
                                    id="analysis-mode-select"
                                    value={analysisMode}
                                    onChange={(e) => setAnalysisMode(e.target.value)}
                                    aria-describedby="analysis-mode-hint"
                                    className="filter-select"
                                >
                                    <option value="dataset-reference">{t('experimental.analysis.analysisMode.reference')}</option>
                                    {selectedAnalyzer?.requiresReference !== true && (
                                        <option value="generated-answer">{t('experimental.analysis.analysisMode.generated')}</option>
                                    )}
                                </select>
                            </>) : (
                                <GcdsText>{t('experimental.analysis.analysisMode.generatedOnly')}</GcdsText>
                            )}
                        </div>

                        <div className="mb-400 settings-form-width">
                            <label htmlFor="workflow-select" className="filter-label display-block">
                                {t('experimental.analysis.workflowLabel')}
                            </label>
                            <select
                                id="workflow-select"
                                value={selectedWorkflow}
                                onChange={(e) => setSelectedWorkflow(e.target.value)}
                                className="filter-select"
                            >
                                {WORKFLOWS.map(workflow => (
                                    <option key={workflow.value} value={workflow.value}>
                                        {t(workflow.labelKey)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mb-400 settings-form-width">
                            <label htmlFor="model-select" className="filter-label display-block">
                                {t('batch.upload.model.label')}
                            </label>
                            <select
                                id="model-select"
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="filter-select"
                            >
                                {AVAILABLE_MODELS.map(model => (
                                    <option key={model.value} value={model.value}>
                                        {t(model.labelKey)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mb-400 settings-form-width">
                            <label htmlFor="search-provider-select" className="filter-label display-block">
                                {t('batch.upload.searchService.label')}
                            </label>
                            <select
                                id="search-provider-select"
                                value={selectedSearch}
                                onChange={(e) => setSelectedSearch(e.target.value)}
                                className="filter-select"
                            >
                                <option value="">{t('homepage.chat.options.useSystemSettings')}</option>
                                {SEARCH_PROVIDERS.map((provider) => (
                                    <option key={provider.value} value={provider.value}>{t(provider.labelKey)}</option>
                                ))}
                            </select>
                        </div>

                        <div className="mb-400 settings-form-width">
                            <label htmlFor="trials-select" className="filter-label display-block">
                                {t('experimental.analysis.trialsLabel')}
                            </label>
                            <select
                                id="trials-select"
                                value={trials}
                                onChange={(e) => setTrials(parseInt(e.target.value, 10) || 1)}
                                className="filter-select experimental-analysis-trials-select"
                            >
                                {[1, 2, 3, 4, 6, 8].map(n => (
                                    <option key={n} value={n}>{formatNumber(n, lang)}</option>
                                ))}
                            </select>
                            {selectedDataset && (
                                <GcdsText className="mt-200">
                                    {t('experimental.analysis.trialsCostHint')
                                        .replace('{rows}', formatNumber(selectedDataset.rowCount || 0, lang))
                                        .replace('{trials}', formatNumber(trials, lang))
                                        .replace('{total}', formatNumber((selectedDataset.rowCount || 0) * trials, lang))}
                                </GcdsText>
                            )}
                        </div>

                        <div className="mb-400 settings-form-width">
                            <label htmlFor="run-label-input" className="filter-label display-block">
                                {t('experimental.analysis.runLabelLabel')}
                            </label>
                            <input
                                id="run-label-input"
                                type="text"
                                value={runLabel}
                                maxLength={200}
                                onChange={(e) => setRunLabel(e.target.value)}
                                placeholder={t('experimental.analysis.runLabelPlaceholder')}
                                className="filter-input"
                            />
                        </div>

                        <GcdsButton onClick={handleRunAnalysis} disabled={loading || !selectedAnalyzerId}>
                            {loading ? t('experimental.analysis.starting') : t('experimental.analysis.run')}
                        </GcdsButton>
                        <StatusMessage className="mt-200" variant={runStatus.message ? (runStatus.isError ? 'error' : 'info') : undefined} message={runStatus.message} nonce={runStatus.nonce} />
                    </section>

                    {(startingRun || Object.keys(batchProgress).length > 0) && (
                        <section>
                            <GcdsHeading tag="h2">{t('experimental.analysis.runningStatus')}</GcdsHeading>
                            {renderPauseToggle()}
                            {startingRun && (
                                <div ref={startingRunRef} className="border p-200 mb-200 rounded bg-light">
                                    {startingRun.name && (
                                    <div><strong>{startingRun.name}</strong></div>
                                    )}
                                    <div><strong>{startingRun.status}</strong></div>
                                    <GcdsText className="mt-200">{startingRun.message}</GcdsText>
                                </div>
                            )}
                            {renderProgressCards(batchProgress)}
                        </section>
                    )}
                    {!startingRun && Object.keys(batchProgress).length === 0 && (
                        <section>
                            <GcdsText>{t('experimental.analysis.noActiveRuns')}</GcdsText>
                        </section>
                    )}
                    <section id="batches-history">
                        <GcdsHeading tag="h2" className="mt-600">{t('experimental.analysis.previousRuns')}</GcdsHeading>
                        <TableStatusMessage status={historyStatus} />
                        <ExperimentalServerDataTable
                            columns={batchColumns}
                            fetchData={fetchBatchTableData}
                            actionsTitle={t('experimental.analysis.columns.actions')}
                            renderActions={renderBatchActions}
                            lang={lang}
                            tableKey={`batches-${selectedDatasetId}-${tableRefreshKey}`}
                            order={[[5, 'desc']]}
                            actionsWidth="14%"
                            autoWidth={false}
                            containerClassName="metrics-table-container experimental-table-layout table-scroll"
                            searchLabelSrOnly={t('experimental.analysis.filterBatchesLabel')}
                            searchPlaceholder={t('admin.common.filterPlaceholder')}
                        />
                    </section>
            </>}
            </div>

            <div id="comparison-tab-panel" role="tabpanel" aria-labelledby="comparison-tab" hidden={activeTab !== 'comparison'}>
            {activeTab === 'comparison' && <>
            <section>
                <GcdsHeading tag="h2">{t('experimental.analysis.comparison.title')}</GcdsHeading>
                <GcdsText className="mb-300">{t('experimental.analysis.comparison.hint')}</GcdsText>
                <div className="mb-300 settings-form-width">
                    <label htmlFor="comparison-baseline-select" className="filter-label display-block">
                        {t('experimental.analysis.comparison.baseline')}
                    </label>
                    <select
                        id="comparison-baseline-select"
                        value={comparisonBaselineId}
                        onChange={(e) => {
                            setComparisonBaselineId(e.target.value);
                            setComparisonCandidateId('');
                        }}
                        className="filter-select"
                    >
                        <option value="">{t('experimental.analysis.comparison.selectBaseline')}</option>
                        {batches.filter(batch => batch.status === 'completed' && supportsBatchComparison(batch)).map(batch => (
                            <option key={batch._id} value={batch._id}>{getRunLabel(batch)}</option>
                        ))}
                    </select>
                </div>
                <div className="mb-300 settings-form-width">
                    {noComparisonCandidates ? (
                        <>
                            <p className="filter-label display-block mt-0">{t('experimental.analysis.comparison.candidate')}</p>
                            <GcdsNotice
                                noticeRole="info"
                                noticeTitleTag="h3"
                                noticeTitle={t('experimental.analysis.comparison.noCandidatesTitle')}
                            >
                                <GcdsText>{t('experimental.analysis.comparison.noCandidates')}</GcdsText>
                            </GcdsNotice>
                        </>
                    ) : (
                        <>
                            <label htmlFor="comparison-candidate-select" className="filter-label display-block">
                                {t('experimental.analysis.comparison.candidate')}
                            </label>
                            <select
                                id="comparison-candidate-select"
                                value={comparisonCandidateId}
                                onChange={(e) => setComparisonCandidateId(e.target.value)}
                                disabled={!comparisonBaselineId}
                                className="filter-select"
                            >
                                <option value="">{t('experimental.analysis.comparison.selectCandidate')}</option>
                                {comparisonCandidates.map(batch => (
                                    <option key={batch._id} value={batch._id}>{getRunLabel(batch)}</option>
                                ))}
                            </select>
                        </>
                    )}
                </div>
                <GcdsButton onClick={handleCreateComparison} disabled={comparisonLoading || !comparisonBaselineId || !comparisonCandidateId}>
                    {comparisonLoading ? t('experimental.analysis.starting') : t('experimental.analysis.comparison.create')}
                </GcdsButton>
                <StatusMessage className="mt-200" variant={comparisonStatus.message ? (comparisonStatus.isError ? 'error' : 'info') : undefined} message={comparisonStatus.message} nonce={comparisonStatus.nonce} />
                {Object.keys(comparisonProgress).length > 0 && (
                    <section className="mt-400 mb-400">
                        <GcdsHeading tag="h2">{t('experimental.analysis.runningStatus')}</GcdsHeading>
                        {renderPauseToggle()}
                        {renderProgressCards(comparisonProgress)}
                    </section>
                )}
                {comparisonAnalyzer && (
                    <GcdsDetails detailsTitle={t('experimental.analysis.comparison.analyzerDetailsTitle')} className="mt-300 mb-400">
                        <GcdsText className="mb-200">
                            <strong>{getAnalyzerDisplayName(comparisonAnalyzer)}</strong>
                        </GcdsText>
                        <GcdsText>{getComparisonAnalyzerDescription(comparisonAnalyzer)}</GcdsText>
                        {renderAnalyzerRulesTable(comparisonAnalyzer.id, 'comparison')}
                    </GcdsDetails>
                )}
                <TableStatusMessage status={comparisonTableStatus} />
                {comparisons.length > 0 && (
                    <div className="mt-300">
                        <GcdsHeading tag="h2" className="mt-600">{t('experimental.analysis.comparison.columns.previousComparisons')}</GcdsHeading>
                        <ExperimentalServerDataTable
                            columns={comparisonColumns}
                            fetchData={fetchComparisonTableData}
                            actionsTitle={t('experimental.analysis.comparison.columns.actions')}
                            renderActions={renderComparisonActions}
                            lang={lang}
                            tableKey={`comparisons-${selectedDatasetId}-${tableRefreshKey}`}
                            actionsWidth="14%"
                            autoWidth={false}
                            containerClassName="metrics-table-container experimental-table-layout table-scroll"
                            searchLabelSrOnly={t('experimental.analysis.filterComparisonsLabel')}
                            searchPlaceholder={t('admin.common.filterPlaceholder')}
                        />
                    </div>
                )}
            </section>
            </>}
            </div>

        </GcdsContainer>
    );
}
