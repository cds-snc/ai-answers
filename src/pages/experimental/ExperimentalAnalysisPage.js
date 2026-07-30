import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsLink, GcdsDetails } from '@cdssnc/gcds-components-react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { WORKFLOWS, AVAILABLE_MODELS, WORKFLOW_VALUES } from '../../config/workflows.js';
import { formatNumber } from '../../utils/numberFormat.js';

const DEFAULT_WORKFLOW = WORKFLOW_VALUES[0] || 'GenericGraph';
const ACTIVE_BATCH_WINDOW_MS = 2 * 60 * 1000;

const normalizeWorkflow = (workflow) => (
    WORKFLOW_VALUES.includes(workflow) ? workflow : DEFAULT_WORKFLOW
);

const buildAnalysisRunName = ({ analyzerName, analyzerId, datasetName, datasetId, workflowLabel, modelLabel }) => {
    return [
        analyzerName || analyzerId || '',
        datasetName || datasetId || '',
        workflowLabel || '',
        modelLabel || ''
    ].filter(Boolean).join(' · ');
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

const getAnalyzerTranslationKey = (analyzerId, field) => `experimental.analysis.analyzers.${analyzerId}.${field}`;
const getStatusTranslationKey = (status) => `experimental.analysis.statuses.${String(status || '').toLowerCase()}`;

const ANALYZER_RULE_ROWS = {
    'no-analyzer': ['always'],
    'expert-scorer': ['datasetOnly', 'datasetAndRun'],
    'similar-answer': ['standalone', 'withReference'],
    'refusal': ['standalone', 'withReference'],
    safety: ['standalone', 'withReference'],
    'bias-detection': ['standalone', 'withReference']
};

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
    const pollRef = useRef(null);
    const isMountedRef = useRef(true);

    const stopPolling = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    };

    const buildProgressMap = (batchList) => {
        return batchList
            .filter(batch => batch.status === 'processing')
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

            const hasActiveRuns = nextBatches.some(batch => batch.status === 'processing');
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

        const selectedDataset = datasets.find(ds => ds._id === selectedDatasetId);
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
            const blob = await ExperimentalBatchClientService.exportBatch(batchId, 'excel');
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

    const comparisonBaseline = batches.find(batch => batch._id === comparisonBaselineId);
    const comparisonCandidates = batches.filter(batch => (
        batch.status === 'completed'
        && batch._id !== comparisonBaselineId
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
                name: `${t('experimental.analysis.comparison.title')}: ${getRunLabel(baseline)} → ${getRunLabel(candidate)}`,
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

    const selectedDataset = datasets.find(ds => ds._id === selectedDatasetId);
    const selectedAnalyzer = analyzers.find(a => a.id === selectedAnalyzerId);

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
                    <GcdsLink href={`/${lang}/experimental/datasets`}>
                        {t('experimental.datasets.backToList')}
                    </GcdsLink>
                    {selectedDatasetId && (
                        <GcdsLink href={`/${lang}/experimental/suites/${selectedDatasetId}`}>
                            {t('experimental.analysis.suiteView')}
                        </GcdsLink>
                    )}
                </div>
            </header>
            

            
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
                                {analyzers.map(a => (
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
                                    {ANALYZER_RULE_ROWS[selectedAnalyzerId] && (
                                        <div className="overflow-auto mt-300">
                                            <GcdsText className="mb-200">
                                                <strong>{t(`experimental.analysis.analyzerRules.${selectedAnalyzerId}.title`)}</strong>
                                            </GcdsText>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                                                        <th className="p-200">{t('experimental.analysis.analyzerRules.headers.setup')}</th>
                                                        <th className="p-200">{t('experimental.analysis.analyzerRules.headers.comparison')}</th>
                                                        <th className="p-200">{t('experimental.analysis.analyzerRules.headers.flagged')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {ANALYZER_RULE_ROWS[selectedAnalyzerId].map(rule => (
                                                        <tr key={rule} style={{ borderBottom: '1px solid #eee' }}>
                                                            <td className="p-200">{t(`experimental.analysis.analyzerRules.${selectedAnalyzerId}.rows.${rule}.setup`)}</td>
                                                            <td className="p-200">{t(`experimental.analysis.analyzerRules.${selectedAnalyzerId}.rows.${rule}.comparison`)}</td>
                                                            <td className="p-200">{t(`experimental.analysis.analyzerRules.${selectedAnalyzerId}.rows.${rule}.flagged`)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </GcdsDetails>
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
                                <div className="border p-200 mb-200 rounded bg-light">
                                    {startingRun.name && (
                                    <div><strong>{startingRun.name}</strong></div>
                                    )}
                                    <div><strong>{startingRun.status}</strong></div>
                                    <GcdsText className="mt-200">{startingRun.message}</GcdsText>
                                </div>
                            )}
                            {Object.entries(batchProgress).map(([id, prog]) => (
                                <div key={id} className="border p-200 mb-200 rounded bg-light">
                                    <div><strong>{prog.name || `${t('experimental.analysis.batchPrefix')} ${id.slice(-6)}`}</strong>: {getStatusLabel(prog.status)}</div>
                                    <div style={{ width: '100%', backgroundColor: '#eee', height: '10px', marginTop: '5px' }}>
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
                            ))}
                        </section>
                    )}
                    {!startingRun && Object.keys(batchProgress).length === 0 && (
                        <section>
                            <GcdsText>{t('experimental.analysis.noActiveRuns')}</GcdsText>
                        </section>
                    )}

            <section className="mt-600">
                <GcdsHeading tag="h2">{t('experimental.analysis.comparison.title')}</GcdsHeading>
                <GcdsText className="mb-300">{t('experimental.analysis.comparison.hint')}</GcdsText>
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
                        {batches.filter(batch => batch.status === 'completed').map(batch => (
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
                {comparisons.length > 0 && (
                    <div className="mt-300">
                        <div style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)' }}>
                            <div style={{ maxWidth: '100%', margin: '0 auto', padding: '0 1rem' }}>
                            <GcdsHeading tag="h2" className="mt-600">{t('experimental.analysis.comparison.columns.previousComparisons')}</GcdsHeading>
                            <div className="overflow-auto">
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                                    <th className="p-300">{t('experimental.analysis.comparison.columns.name')}</th>
                                    <th className="p-300">{t('experimental.analysis.comparison.columns.analyzer')}</th>
                                    <th className="p-300">{t('experimental.analysis.comparison.columns.status')}</th>
                                    <th className="p-300">{t('experimental.analysis.comparison.columns.completed')}</th>
                                    <th className="p-300">{t('experimental.analysis.comparison.columns.failed')}</th>
                                    <th className="p-300">{t('experimental.analysis.comparison.columns.total')}</th>
                                    <th className="p-300">{t('experimental.analysis.comparison.columns.date')}</th>
                                    <th className="p-300">{t('experimental.analysis.comparison.columns.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {comparisons.map(comparison => (
                                    <tr key={comparison._id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td className="p-200">{comparison.name || getRunLabel(comparison)}</td>
                                        <td className="p-200">{getAnalyzerLabel(comparison)}</td>
                                        <td className="p-300">
                                            <span style={{
                                                color: comparison.status === 'completed' ? 'green' : (comparison.status === 'failed' ? 'red' : 'orange'),
                                                fontWeight: 'bold'
                                            }}>
                                                {getStatusLabel(comparison.status)}
                                            </span>
                                        </td>
                                        <td className="p-300">{formatNumber(comparison.summary?.completed, lang)}</td>
                                        <td className="p-300">{formatNumber(comparison.summary?.failed, lang)}</td>
                                        <td className="p-300">{formatNumber(comparison.summary?.total, lang)}</td>
                                        <td className="p-300">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(comparison.createdAt))}</td>
                                        <td className="p-200">
                                            <div className="flex gap-200">
                                                <GcdsButton size="small" onClick={() => navigate(`/${lang}/experimental/analysis/${comparison._id}`)}>
                                                    {t('experimental.analysis.viewResults')}
                                                </GcdsButton>
                                                <GcdsButton size="small" buttonRole="secondary" onClick={() => handleExport(comparison._id)}>
                                                    {t('experimental.analysis.export')}
                                                </GcdsButton>
                                                <GcdsButton size="small" buttonRole="danger" onClick={() => handleDeleteBatch(comparison._id)}>
                                                    {t('experimental.analysis.delete')}
                                                </GcdsButton>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            </table>
                            </div>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* History List */}
            <section style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)' }}>
                <div style={{ maxWidth: '100%', margin: '0 auto', padding: '0 1rem' }}>
                    <GcdsHeading tag="h2" className="mt-600">{t('experimental.analysis.previousRuns')}</GcdsHeading>
                    <div className="overflow-auto">
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                            <th className="p-300">{t('experimental.analysis.columns.name')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.analyzer')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.workflow')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.modelFamily')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.appVersion')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.status')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.completed')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.failed')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.totalQuestions')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.createdBy')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.flagged')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.date')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {batches.map(batch => (
                            <tr key={batch._id} style={{ borderBottom: '1px solid #eee' }}>
                                <td className="p-200">{getRunLabel(batch)}</td>
                                <td className="p-200">{getAnalyzerLabel(batch)}</td>
                                <td className="p-200">{getWorkflowLabel(batch)}</td>
                                <td className="p-200">{getModelLabel(batch)}</td>
                                <td className="p-200" title={batch.appVersion || ''}>{getAppVersionLabel(batch)}</td>
                                <td className="p-300">
                                    <span style={{
                                        color: batch.status === 'completed' ? 'green' : (batch.status === 'failed' ? 'red' : 'orange'),
                                        fontWeight: 'bold'
                                    }}>
                                        {getStatusLabel(batch.status)}
                                    </span>
                                </td>
                                <td className="p-300">{formatNumber(batch.summary?.completed, lang)}</td>
                                <td className="p-300">{formatNumber(batch.summary?.failed, lang)}</td>
                                <td className="p-300">{formatNumber(batch.summary?.total, lang)}</td>
                                <td className="p-300">{batch.createdBy?.email || t('common.na')}</td>
                                <td className="p-300">
                                    {batch.summary?.flagged > 0 ? (
                                        <span style={{ color: '#d30800', fontWeight: 'bold' }}>⚠ {formatNumber(batch.summary.flagged, lang)}</span>
                                    ) : (
                                        <span>0</span>
                                    )}
                                </td>
                                <td className="p-300">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(batch.createdAt))}</td>
                                <td className="p-200">
                                    <div className="flex gap-200">
                                        <GcdsButton size="small" onClick={() => navigate(`/${lang}/experimental/analysis/${batch._id}`)}>
                                            {t('experimental.analysis.viewResults')}
                                        </GcdsButton>
                                        <GcdsButton size="small" buttonRole="secondary" onClick={() => handleExport(batch._id)}>
                                            {t('experimental.analysis.export')}
                                        </GcdsButton>
                                        <GcdsButton size="small" buttonRole="secondary" onClick={() => handleExportChatLogs(batch)}>
                                            {t('experimental.analysis.exportChatLogs')}
                                        </GcdsButton>
                                        {batch.status === 'processing' && !isActivelyRunningBatch(batch) && (
                                            <GcdsButton size="small" buttonRole="secondary" onClick={() => handleResumeBatch(batch._id)}>
                                                {t('experimental.analysis.resume')}
                                            </GcdsButton>
                                        )}
                                        <GcdsButton size="small" buttonRole="danger" onClick={() => handleDeleteBatch(batch._id)}>
                                            {t('experimental.analysis.delete')}
                                        </GcdsButton>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                    </div>
                </div>
            </section>
        </GcdsContainer>
    );
}
