import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsLink, GcdsDetails } from '@cdssnc/gcds-components-react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { WORKFLOWS, AVAILABLE_MODELS, WORKFLOW_VALUES } from '../../config/workflows.js';
import { formatNumber } from '../../utils/numberFormat.js';
import ExperimentalServerDataTable from '../../components/experimental/ExperimentalServerDataTable.js';
import { getPath } from '../../utils/routes.js';

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

    const [loading, setLoading] = useState(false);
    const [batches, setBatches] = useState([]);
    const [comparisons, setComparisons] = useState([]);
    const [message, setMessage] = useState('');
    const [startingRun, setStartingRun] = useState(null);

    // Progress tracking
    const [batchProgress, setBatchProgress] = useState({});
    const [comparisonProgress, setComparisonProgress] = useState({});
    const [tableRefreshKey, setTableRefreshKey] = useState(0);
    const pollRef = useRef(null);
    const isMountedRef = useRef(true);
    const previousBatchStatusesRef = useRef(new Map());

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
                    pollRef.current = setInterval(() => {
                        loadBatches(datasetId);
                    }, 5000);
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
        if (!selectedAnalyzerId) {
            setMessage(t('experimental.analysis.messages.selectAnalyzer'));
            return;
        }

        if (!selectedDatasetId) {
            setMessage(t('experimental.analysis.messages.selectDataset'));
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
        setMessage('');

        try {

            // Create Batch
        const batchData = {
            name: runName,
            description: `${t('experimental.analysis.analyzerPrefix')}: ${selectedAnalyzerId}`,
            runLabel: runLabel.trim(),
            type: 'analysis',
            config: {
                analyzerId: selectedAnalyzerId,
                analyzerIds: [selectedAnalyzerId],
                workflow: normalizeWorkflow(selectedWorkflow),
                aiProvider: selectedModel || undefined,
                datasetId: selectedDatasetId || undefined,
                analysisMode,
                trials,
                pageLanguage: String(lang || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en',
            }
        };

            const result = await ExperimentalBatchClientService.createBatch(batchData);

            if (result.multiple) {
                // For multiple results, kick off processing for each and track progress.
                for (const b of result.batches) {
                    try {
                        await ExperimentalBatchClientService.processBatch(b._id);
                        if (!message) setMessage(t('experimental.analysis.messages.processingStarted'));
                    } catch (err) {
                        console.error('Process batch error:', err);
                        setMessage(t('experimental.analysis.messages.startProcessingError'));
                    }
                }
                setMessage(t('experimental.analysis.messages.startedCount').replace('{count}', result.batches.length));
            } else {
                try {
                    await ExperimentalBatchClientService.processBatch(result._id);
                    setMessage(t('experimental.analysis.messages.processingStarted'));
                } catch (err) {
                    console.error('Process batch error:', err);
                    setMessage(t('experimental.analysis.messages.startProcessingError'));
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
            setMessage(isLocaleKey ? translated : t('experimental.analysis.messages.startAnalysisFailed'));
        } finally {
            setStartingRun(null);
            setLoading(false);
            await loadBatches(selectedDatasetId);
        }
    };

    const handleDeleteBatch = async (batchId) => {
        if (!window.confirm(t('experimental.analysis.messages.confirmDelete'))) return;
        try {
            await ExperimentalBatchClientService.deleteBatch(batchId);
            await loadBatches(selectedDatasetId);
        } catch (err) {
            console.error('Delete error:', err);
            alert(t('experimental.analysis.messages.deleteFailed'));
        }
    };

    const handleExport = async (batchId) => {
        try {
            const blob = await ExperimentalBatchClientService.exportBatch(batchId, 'excel', lang);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `batch-${batchId}-results.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export error:', err);
            alert(t('experimental.analysis.messages.exportFailed'));
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
            alert(t('experimental.analysis.messages.exportChatLogsError'));
        }
    };

    const handleResumeBatch = async (batchId) => {
        try {
            setLoading(true);
            await ExperimentalBatchClientService.processBatch(batchId, true);
            setMessage(t('experimental.analysis.messages.resumeStarted'));
            await loadBatches(selectedDatasetId);
        } catch (err) {
            console.error('Resume batch error:', err);
            setMessage(t('experimental.analysis.messages.resumeFailed'));
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

    const handleCreateComparison = async () => {
        if (!comparisonBaselineId || !comparisonCandidateId) {
            setMessage(t('experimental.analysis.messages.selectComparisonRuns'));
            return;
        }

        const baseline = batches.find(batch => batch._id === comparisonBaselineId);
        const candidate = batches.find(batch => batch._id === comparisonCandidateId);
        if (!baseline || !candidate) return;

        setComparisonLoading(true);
        try {
            const analyzerId = resolveBatchAnalyzerId(baseline);
            const result = await ExperimentalBatchClientService.createBatch({
                name: `${t('experimental.analysis.comparison.title')}: ${getRunLabel(baseline)} â†’ ${getRunLabel(candidate)}`,
                description: `${t('experimental.analysis.comparison.baseline')}: ${getRunLabel(baseline)}`,
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
            setMessage(t('experimental.analysis.messages.comparisonStarted'));
            setComparisonBaselineId('');
            setComparisonCandidateId('');
            await loadBatches(selectedDatasetId);
        } catch (err) {
            console.error('Comparison creation error:', err);
            setMessage(t('experimental.analysis.messages.comparisonFailed'));
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

    const batchColumns = [
        { title: t('experimental.analysis.columns.name'), data: 'name', width: '9%', render: (data, type) => type === 'display' ? `<span class="experimental-table-name">${escapeHtml(data)}</span>` : data },
        { title: t('experimental.analysis.columns.analyzer'), data: null, width: '8%', render: (_data, _type, row) => getAnalyzerLabel(row) },
        { title: t('experimental.analysis.columns.workflow'), data: null, width: '8%', render: (_data, _type, row) => getWorkflowLabel(row) },
        { title: t('experimental.analysis.columns.modelFamily'), data: null, width: '8%', render: (_data, _type, row) => getModelLabel(row) },
        { title: t('experimental.analysis.columns.appVersion'), data: 'appVersion', width: '5%', render: (data, type) => type === 'display' ? getAppVersionLabel({ appVersion: data }) : data },
        { title: t('experimental.analysis.columns.status'), data: 'status', width: '7%', render: (data) => getStatusLabel(data) },
        { title: t('experimental.analysis.columns.completed'), data: 'summary.completed', width: '4%', render: (data, type) => type === 'display' ? formatNumber(data, lang) : data },
        { title: t('experimental.analysis.columns.failed'), data: 'summary.failed', width: '4%', render: (data, type) => type === 'display' ? formatNumber(data, lang) : data },
        { title: t('experimental.analysis.columns.totalQuestions'), data: 'summary.total', width: '4%', render: (data, type) => type === 'display' ? formatNumber(data, lang) : data },
        { title: t('experimental.analysis.columns.createdBy'), data: null, width: '10%', render: (_data, _type, row) => row.createdBy?.email || t('common.na') },
        { title: t('experimental.analysis.columns.flagged'), data: 'summary.flagged', width: '4%', render: (data, type) => type === 'display' ? formatNumber(data, lang) : data },
        { title: t('experimental.analysis.columns.date'), data: 'createdAt', width: '6%', render: (data, type) => type === 'display' ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(data)) : data }
    ];

    const comparisonColumns = [
        { title: t('experimental.analysis.comparison.columns.name'), data: 'name', width: '23%', render: (data, type) => type === 'display' ? `<span style="white-space: normal; overflow-wrap: anywhere;">${escapeHtml(data)}</span>` : data },
        { title: t('experimental.analysis.comparison.columns.analyzer'), data: null, width: '15%', render: (_data, _type, row) => getAnalyzerLabel(row) },
        { title: t('experimental.analysis.comparison.columns.status'), data: 'status', width: '10%', render: (data) => getStatusLabel(data) },
        { title: t('experimental.analysis.comparison.columns.completed'), data: 'summary.completed', width: '7%', render: (data, type) => type === 'display' ? formatNumber(data, lang) : data },
        { title: t('experimental.analysis.comparison.columns.failed'), data: 'summary.failed', width: '7%', render: (data, type) => type === 'display' ? formatNumber(data, lang) : data },
        { title: t('experimental.analysis.comparison.columns.total'), data: 'summary.total', width: '7%', render: (data, type) => type === 'display' ? formatNumber(data, lang) : data },
        { title: t('experimental.analysis.comparison.columns.date'), data: 'createdAt', width: '11%', render: (data, type) => type === 'display' ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(data)) : data }
    ];

    const renderComparisonActions = (comparison) => (
        <div className="experimental-table-actions experimental-table-actions--group" role="group" aria-label={t('experimental.analysis.comparison.columns.actions')}>
            <GcdsButton size="small" onClick={() => navigate(`${getPath('experimental-analysis', lang)}/${comparison._id}`)}>{t('experimental.analysis.viewResults')}</GcdsButton>
            <GcdsButton size="small" buttonRole="secondary" onClick={() => handleExport(comparison._id)}>{t('experimental.analysis.export')}</GcdsButton>
            <GcdsButton size="small" buttonRole="danger" onClick={() => handleDeleteBatch(comparison._id)}>{t('experimental.analysis.delete')}</GcdsButton>
        </div>
    );

    const renderBatchActions = (batch) => (
        <div className="experimental-table-actions experimental-table-actions--group" role="group" aria-label={t('experimental.analysis.columns.actions')}>
            <GcdsButton size="small" onClick={() => navigate(`${getPath('experimental-analysis', lang)}/${batch._id}`)}>{t('experimental.analysis.viewResults')}</GcdsButton>
            <GcdsButton size="small" buttonRole="secondary" onClick={() => handleExport(batch._id)}>{t('experimental.analysis.export')}</GcdsButton>
            <GcdsButton size="small" buttonRole="secondary" onClick={() => handleExportChatLogs(batch)}>{t('experimental.analysis.exportChatLogs')}</GcdsButton>
            {isLambdaRuntime() && canResumeBatch(batch) && <GcdsButton size="small" buttonRole="secondary" onClick={() => handleResumeBatch(batch._id)}>{t('experimental.analysis.resume')}</GcdsButton>}
            <GcdsButton size="small" buttonRole="danger" onClick={() => handleDeleteBatch(batch._id)}>{t('experimental.analysis.delete')}</GcdsButton>
        </div>
    );

    const renderProgressCards = (progressMap) => Object.entries(progressMap).map(([id, prog]) => (
        <div key={id} className="border p-200 mb-200 rounded bg-light">
            <div role="status" aria-live="polite"><strong>{prog.name || `${t('experimental.analysis.batchPrefix')} ${id.slice(-6)}`}</strong>: {getStatusLabel(prog.status)}</div>
            <div
                role="progressbar"
                aria-valuenow={Math.round(prog.percentComplete)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={prog.name || `${t('experimental.analysis.batchPrefix')} ${id.slice(-6)}`}
                style={{ width: '100%', backgroundColor: '#eee', height: '10px', marginTop: '5px' }}
            >
                <div style={{
                    width: `${prog.percentComplete}%`,
                    backgroundColor: prog.status === 'failed' ? '#d30800' : '#26374a',
                    height: '100%',
                    transition: 'width 0.5s ease-in-out'
                }}></div>
            </div>
            <div style={{ fontSize: '0.8rem', marginTop: '5px' }}>
                {t('experimental.analysis.progressSummary')
                    .replace('{completed}', formatNumber(prog.completed, lang))
                    .replace('{failed}', formatNumber(prog.failed, lang))
                    .replace('{total}', formatNumber(prog.total, lang))}
            </div>
        </div>
    ));

    const renderAnalyzerRulesTable = (analyzerId, mode) => {
        const ruleRows = mode === 'comparison'
            ? BATCH_COMPARISON_RULE_ROWS[analyzerId]
            : ANALYSIS_RULE_ROWS[analyzerId];
        if (!ruleRows) return null;

        const keyPrefix = mode === 'comparison'
            ? 'experimental.analysis.comparison.analyzerRules'
            : 'experimental.analysis.analyzerRules';

        return (
            <div className="overflow-auto mt-300">
                <GcdsText className="mb-200">
                    <strong>{t(`${keyPrefix}.${analyzerId}.title`)}</strong>
                </GcdsText>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
        <GcdsContainer layout="page" className="mb-600">
            <header className="mb-400">
                <GcdsHeading tag="h1">
                    {selectedDataset?.name || t('experimental.analysis.title')}
                </GcdsHeading>
                {selectedDataset?.description && (
                    <GcdsText className="mb-200">
                        {selectedDataset.description}
                    </GcdsText>
                )}
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <GcdsLink href={getPath('experimental-datasets', lang)}>
                        {t('experimental.datasets.backToList')}
                    </GcdsLink>
                    {selectedDatasetId && (
                        <GcdsLink href={`${getPath('experimental-suites', lang)}/${selectedDatasetId}`}>
                            {t('experimental.analysis.suiteView')}
                        </GcdsLink>
                    )}
                </div>
            </header>

            <div className="experimental-analysis-tabs" role="tablist" aria-label={t('experimental.analysis.tabs.label')}>
                <button
                    type="button"
                    role="tab"
                    id="batches-tab"
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
                    aria-selected={activeTab === 'comparison'}
                    aria-controls="comparison-tab-panel"
                    className={`experimental-analysis-tab${activeTab === 'comparison' ? ' experimental-analysis-tab--active' : ''}`}
                    onClick={() => setActiveTab('comparison')}
                >
                    {t('experimental.analysis.tabs.comparison')}
                </button>
            </div>

            {activeTab === 'batches' && <div id="batches-tab-panel" role="tabpanel" aria-labelledby="batches-tab">
                    <section>
                        <GcdsHeading tag="h2">{t('experimental.analysis.configuration')}</GcdsHeading>

                        {/* Analyzer selector */}
                        <div className="mb-400">
                            <label htmlFor="analyzer-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                {t('experimental.analysis.selectAnalyzers')}
                            </label>
                            <select
                                id="analyzer-select"
                                value={selectedAnalyzerId}
                                onChange={(e) => {
                                    setSelectedAnalyzerId(e.target.value);
                                }}
                                style={{ padding: '8px', width: '100%' }}
                            >
                                <option value="">{t('experimental.analysis.messages.selectAnalyzer')}</option>
                                {availableAnalyzers.map(a => (
                                    <option key={a.id} value={a.id}>
                                        {getAnalyzerDisplayName(a)}
                                    </option>
                                ))}
                            </select>
                            {selectedAnalyzerId && selectedAnalyzer && (
                                <GcdsDetails detailsTitle={t('experimental.analysis.analyzerDetailsTitle')} className="mt-200">
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
                        </div>

                        <div className="mb-400">
                            <label htmlFor="analysis-mode-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                {t('experimental.analysis.analysisMode.label')}
                            </label>
                            {hasDatasetReferenceAnswer ? (
                                <select
                                    id="analysis-mode-select"
                                    value={analysisMode}
                                    onChange={(e) => setAnalysisMode(e.target.value)}
                                    style={{ padding: '8px', width: '100%' }}
                                >
                                    <option value="dataset-reference">{t('experimental.analysis.analysisMode.reference')}</option>
                                    {selectedAnalyzer?.requiresReference !== true && (
                                        <option value="generated-answer">{t('experimental.analysis.analysisMode.generated')}</option>
                                    )}
                                </select>
                            ) : (
                                <GcdsText>{t('experimental.analysis.analysisMode.generatedOnly')}</GcdsText>
                            )}
                        </div>

                        <div className="mb-400">
                            <label htmlFor="workflow-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                {t('experimental.analysis.workflowLabel')}
                            </label>
                            <select
                                id="workflow-select"
                                value={selectedWorkflow}
                                onChange={(e) => setSelectedWorkflow(e.target.value)}
                                style={{ padding: '8px', width: '100%' }}
                            >
                                {WORKFLOWS.map(workflow => (
                                    <option key={workflow.value} value={workflow.value}>
                                        {t(workflow.labelKey)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mb-400">
                            <label htmlFor="model-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                {t('batch.upload.model.label')}
                            </label>
                            <select
                                id="model-select"
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                style={{ padding: '8px', width: '100%' }}
                            >
                                {AVAILABLE_MODELS.map(model => (
                                    <option key={model.value} value={model.value}>
                                        {t(model.labelKey)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Dataset Selection */}
                        <div className="mb-400">
                            <label htmlFor="dataset-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                {t('experimental.analysis.useExistingDatasetLabel')}
                            </label>
                            <select
                                id="dataset-select"
                                value={selectedDatasetId}
                                onChange={(e) => setSelectedDatasetId(e.target.value)}
                                style={{ padding: '8px', width: '100%' }}
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
                        </div>

                        <div className="mb-400">
                            <label htmlFor="trials-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                {t('experimental.analysis.trialsLabel')}
                            </label>
                            <select
                                id="trials-select"
                                value={trials}
                                onChange={(e) => setTrials(parseInt(e.target.value, 10) || 1)}
                                style={{ padding: '8px', maxWidth: '10rem' }}
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

                        <div className="mb-400">
                            <label htmlFor="run-label-input" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                {t('experimental.analysis.runLabelLabel')}
                            </label>
                            <input
                                id="run-label-input"
                                type="text"
                                value={runLabel}
                                maxLength={200}
                                onChange={(e) => setRunLabel(e.target.value)}
                                placeholder={t('experimental.analysis.runLabelPlaceholder')}
                                style={{ padding: '8px', width: '100%', boxSizing: 'border-box' }}
                            />
                        </div>

                        <GcdsButton onClick={handleRunAnalysis} disabled={loading || !selectedAnalyzerId}>
                            {loading ? t('experimental.analysis.starting') : t('experimental.analysis.run')}
                        </GcdsButton>
                        {message && <GcdsText className="mt-200" role="status"><strong>{message}</strong></GcdsText>}
                    </section>

                    {(startingRun || Object.keys(batchProgress).length > 0) && (
                        <section>
                            <GcdsHeading tag="h2">{t('experimental.analysis.runningStatus')}</GcdsHeading>
                            {startingRun && (
                                <div className="border p-200 mb-200 rounded bg-light" role="status" aria-live="polite">
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
            </div>}

            {activeTab === 'comparison' && <div id="comparison-tab-panel" role="tabpanel" aria-labelledby="comparison-tab">
            <section>
                <GcdsHeading tag="h2">{t('experimental.analysis.comparison.title')}</GcdsHeading>
                <GcdsText className="mb-300">{t('experimental.analysis.comparison.hint')}</GcdsText>
                <div className="mb-300">
                    <label htmlFor="comparison-dataset-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                        {t('experimental.analysis.useExistingDatasetLabel')}
                    </label>
                    <select
                        id="comparison-dataset-select"
                        value={selectedDatasetId}
                        onChange={(e) => setSelectedDatasetId(e.target.value)}
                        style={{ padding: '8px', width: '100%' }}
                    >
                        <option value="">{t('experimental.analysis.datasetSelectPlaceholder')}</option>
                        {datasets.map(ds => (
                            <option key={ds._id} value={ds._id}>
                                {ds.name} ({formatNumber(ds.rowCount, lang)} {t('experimental.analysis.datasetRows')})
                            </option>
                        ))}
                    </select>
                    {!selectedDatasetId && <GcdsText className="mt-200">{t('experimental.analysis.datasetHelper')}</GcdsText>}
                </div>
                <div className="mb-300">
                    <label htmlFor="comparison-baseline-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                        {t('experimental.analysis.comparison.baseline')}
                    </label>
                    <select
                        id="comparison-baseline-select"
                        value={comparisonBaselineId}
                        onChange={(e) => {
                            setComparisonBaselineId(e.target.value);
                            setComparisonCandidateId('');
                        }}
                        style={{ padding: '8px', width: '100%' }}
                    >
                        <option value="">{t('experimental.analysis.comparison.selectBaseline')}</option>
                        {batches.filter(batch => batch.status === 'completed' && supportsBatchComparison(batch)).map(batch => (
                            <option key={batch._id} value={batch._id}>{getRunLabel(batch)}</option>
                        ))}
                    </select>
                </div>
                <div className="mb-300">
                    <label htmlFor="comparison-candidate-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                        {t('experimental.analysis.comparison.candidate')}
                    </label>
                    <select
                        id="comparison-candidate-select"
                        value={comparisonCandidateId}
                        onChange={(e) => setComparisonCandidateId(e.target.value)}
                        disabled={!comparisonBaselineId}
                        style={{ padding: '8px', width: '100%' }}
                    >
                        <option value="">{t('experimental.analysis.comparison.selectCandidate')}</option>
                        {comparisonCandidates.map(batch => (
                            <option key={batch._id} value={batch._id}>{getRunLabel(batch)}</option>
                        ))}
                    </select>
                </div>
                <GcdsButton onClick={handleCreateComparison} disabled={comparisonLoading || !comparisonBaselineId || !comparisonCandidateId}>
                    {comparisonLoading ? t('experimental.analysis.starting') : t('experimental.analysis.comparison.create')}
                </GcdsButton>
                {Object.keys(comparisonProgress).length > 0 && (
                    <section className="mt-400 mb-400">
                        <GcdsHeading tag="h2">{t('experimental.analysis.runningStatus')}</GcdsHeading>
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
                {comparisons.length > 0 && (
                    <div className="mt-300">
                        <div className="experimental-table-container">
                            <div style={{ maxWidth: '100%', margin: '0 auto', padding: '0 1rem' }}>
                            <GcdsHeading tag="h2" className="mt-600">{t('experimental.analysis.comparison.columns.previousComparisons')}</GcdsHeading>
                            <ExperimentalServerDataTable
                                columns={comparisonColumns}
                                fetchData={fetchComparisonTableData}
                                actionsTitle={t('experimental.analysis.comparison.columns.actions')}
                                renderActions={renderComparisonActions}
                                lang={lang}
                                tableKey={`comparisons-${selectedDatasetId}-${tableRefreshKey}`}
                                actionsWidth="20%"
                                autoWidth={false}
                                containerClassName="experimental-table-layout"
                            />
                            </div>
                        </div>
                    </div>
                )}
            </section>
            </div>}

            {/* History List */}
            {activeTab === 'batches' && <section id="batches-history" className="experimental-table-container">
                <div style={{ maxWidth: '100%', margin: '0 auto', padding: '0 1rem' }}>
                    <GcdsHeading tag="h2" className="mt-600">{t('experimental.analysis.previousRuns')}</GcdsHeading>
                    <ExperimentalServerDataTable
                        columns={batchColumns}
                        fetchData={fetchBatchTableData}
                        actionsTitle={t('experimental.analysis.columns.actions')}
                        renderActions={renderBatchActions}
                        lang={lang}
                        tableKey={`batches-${selectedDatasetId}-${tableRefreshKey}`}
                        order={[[11, 'desc']]}
                        actionsWidth="23%"
                        autoWidth={false}
                        containerClassName="experimental-table-layout"
                    />
                </div>
            </section>
            }
        </GcdsContainer>
    );
}
