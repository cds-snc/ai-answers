import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';
import { useSearchParams } from 'react-router-dom';

export default function ExperimentalAnalysisPage({ lang = 'en' }) {
    const { t } = useTranslations(lang);
    const [searchParams] = useSearchParams();
    const datasetIdParam = searchParams.get('datasetId');

    // State
    const [analyzers, setAnalyzers] = useState([]);
    const [selectedAnalyzerId, setSelectedAnalyzerId] = useState('');

    const [datasets, setDatasets] = useState([]);
    const [selectedDatasetId, setSelectedDatasetId] = useState(datasetIdParam || '');
    const [baselineBatchId, setBaselineBatchId] = useState('');

    const [loading, setLoading] = useState(false);
    const [batches, setBatches] = useState([]);
    const [message, setMessage] = useState('');

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
            const result = await ExperimentalBatchClientService.listBatches(1, 100, 'analysis', datasetId);
            const nextBatches = result.data || [];

            if (!isMountedRef.current) {
                return nextBatches;
            }

            setBatches(nextBatches);
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
            setMessage('Please select an existing dataset before starting analysis.');
            return;
        }

        setLoading(true);
        setMessage('');

        try {

            // Create Batch
            const batchData = {
                name: `Analysis - ${new Date().toLocaleString()}`,
                description: `Analyzer: ${selectedAnalyzerId}`,
                type: 'analysis',
                config: {
                    analyzerId: selectedAnalyzerId,
                    analyzerIds: [selectedAnalyzerId],
                    datasetId: selectedDatasetId || undefined,
                    baselineRunId: baselineBatchId || undefined,
                pageLanguage: 'en',
            }
            };

            const result = await ExperimentalBatchClientService.createBatch(batchData);

            if (result.multiple) {
                // For multiple results, kick off processing for each and track progress.
                for (const b of result.batches) {
                    try {
                        const resp = await ExperimentalBatchClientService.processBatch(b._id);
                        // Show server message for first batch to aid debugging
                        if (!message) setMessage(resp.message || `Processing started for ${b._id}`);
                    } catch (err) {
                        console.error('Process batch error:', err);
                        setMessage(`Error starting processing: ${err.message}`);
                    }
                }
                setMessage(t('experimental.analysis.messages.startedCount', { count: result.batches.length }) || `Started ${result.batches.length} analysis runs.`);
            } else {
                try {
                    const procResp = await ExperimentalBatchClientService.processBatch(result._id);
                    setMessage(procResp.message || 'Processing started');
                } catch (err) {
                    console.error('Process batch error:', err);
                    setMessage(`Error starting processing: ${err.message}`);
                }
            }
        } catch (err) {
            console.error(err);
                    setMessage(`Error: ${err.message || 'Failed to start analysis'}`);
        } finally {
            setLoading(false);
            await loadBatches(selectedDatasetId);
        }
    };

    const handleDeleteBatch = async (batchId) => {
        if (!window.confirm('Are you sure you want to delete this batch?')) return;
        try {
            await ExperimentalBatchClientService.deleteBatch(batchId);
            await loadBatches(selectedDatasetId);
        } catch (err) {
            console.error('Delete error:', err);
            alert('Failed to delete batch');
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
            alert('Failed to export batch');
        }
    };

    const handleResumeBatch = async (batchId) => {
        try {
            setLoading(true);
            const resp = await ExperimentalBatchClientService.processBatch(batchId, true);
            setMessage(resp.message || t('experimental.analysis.messages.resumeStarted'));
            await loadBatches(selectedDatasetId);
        } catch (err) {
            console.error('Resume batch error:', err);
            setMessage(`Error: ${err.message || 'Failed to resume batch'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleUseAsBaseline = (batchId) => setBaselineBatchId(batchId);

    const getAnalyzerLabel = (batch) => {
        const id = resolveBatchAnalyzerId(batch);
        if (!id) return batch.name;
        return analyzers.find(a => a.id === id)?.name || id;
    };

    const baselineOptions = batches.filter(batch =>
        batch.status === 'completed' &&
        (!selectedAnalyzerId || resolveBatchAnalyzerId(batch) === selectedAnalyzerId)
    );
    const selectedDataset = datasets.find(ds => ds._id === selectedDatasetId);

    return (
        <GcdsContainer size="xl" centered className="my-400">
            <header className="mb-400">
                <GcdsHeading tag="h1">
                    {selectedDataset?.name || t('experimental.analysis.title')}
                </GcdsHeading>
                {selectedDataset?.description && (
                    <GcdsText className="mb-200">
                        {selectedDataset.description}
                    </GcdsText>
                )}
                <GcdsLink href={`/${lang}/experimental/datasets`}>
                    {t('experimental.datasets.backToList')}
                </GcdsLink>
            </header>
            

            
                    <section>
                        <GcdsHeading tag="h2">Configuration</GcdsHeading>

                        {/* Analyzer selector */}
                        <div className="mb-400">
                            <label htmlFor="analyzer-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                {t('experimental.analysis.selectAnalyzers')}
                            </label>
                            <select
                                id="analyzer-select"
                                value={selectedAnalyzerId}
                                onChange={(e) => setSelectedAnalyzerId(e.target.value)}
                                style={{ padding: '8px', width: '100%' }}
                            >
                                <option value="">{t('experimental.analysis.messages.selectAnalyzer')}</option>
                                {analyzers.map(a => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                    </option>
                                ))}
                            </select>
                            {selectedAnalyzerId && (
                                <GcdsText className="mt-200">
                                    {analyzers.find(a => a.id === selectedAnalyzerId)?.description || ''}
                                </GcdsText>
                            )}
                        </div>

                        {/* Dataset Selection */}
                        <div className="mb-400">
                            <label htmlFor="dataset-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                Use Existing Dataset
                            </label>
                            <select
                                id="dataset-select"
                                value={selectedDatasetId}
                                onChange={(e) => setSelectedDatasetId(e.target.value)}
                                style={{ padding: '8px', width: '100%' }}
                            >
                                <option value="">-- Select an existing dataset --</option>
                                {datasets.map(ds => (
                                    <option key={ds._id} value={ds._id}>{ds.name} ({ds.rowCount} rows)</option>
                                ))}
                            </select>
                            {!selectedDatasetId && (
                                <GcdsText className="mt-200">
                                    Upload and manage datasets through the Datasets page, then select one here.
                                </GcdsText>
                            )}
                        </div>

                        {selectedDatasetId && (
                            <div className="mb-400">
                                <label htmlFor="baseline-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                    {t('experimental.analysis.selectBaseline') || 'Select Baseline Run (Comparison)'}
                                </label>
                                <select
                                    id="baseline-select"
                                    value={baselineBatchId}
                                    onChange={(e) => setBaselineBatchId(e.target.value)}
                                    style={{ padding: '8px', width: '100%' }}
                                >
                                    <option value="">{t('experimental.analysis.noBaseline') || '-- No baseline (Standalone Evaluation) --'}</option>
                                    {baselineOptions.map(batch => (
                                        <option key={batch._id} value={batch._id}>
                                            {getAnalyzerLabel(batch)} - {new Date(batch.createdAt).toLocaleString()}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <GcdsButton onClick={handleRunAnalysis} disabled={loading || !selectedAnalyzerId}>
                            {loading ? t('experimental.analysis.starting') : t('experimental.analysis.run')}
                        </GcdsButton>
                        {message && <GcdsText className="mt-200" role="status"><strong>{message}</strong></GcdsText>}
                    </section>

                    {Object.keys(batchProgress).length > 0 && (
                        <section>
                            <GcdsHeading tag="h2">Running Status</GcdsHeading>
                            {Object.entries(batchProgress).map(([id, prog]) => (
                                <div key={id} className="border p-200 mb-200 rounded bg-light">
                                    <div><strong>Batch {id.slice(-6)}</strong>: {prog.status}</div>
                                    <div style={{ width: '100%', backgroundColor: '#eee', height: '10px', marginTop: '5px' }}>
                                        <div style={{
                                            width: `${prog.percentComplete}%`,
                                            backgroundColor: prog.status === 'failed' ? '#d30800' : '#26374a',
                                            height: '100%',
                                            transition: 'width 0.5s ease-in-out'
                                        }}></div>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', marginTop: '5px' }}>
                                        Completed: {prog.completed} | Failed: {prog.failed} | Total: {prog.total}
                                    </div>
                                </div>
                            ))}
                        </section>
                    )}
                    {Object.keys(batchProgress).length === 0 && (
                        <section>
                            <GcdsText>{t('experimental.analysis.noActiveRuns')}</GcdsText>
                        </section>
                    )}
                
            

            {/* History List */}
            <GcdsHeading tag="h2" className="mt-600">{t('experimental.analysis.previousRuns') || 'Previous Runs'}</GcdsHeading>
            <div className="overflow-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                            <th className="p-300">{t('experimental.analysis.columns.name')}</th>
                            <th className="p-300">{t('experimental.analysis.columns.analyzer')}</th>
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
                                <td className="p-200">{batch.name}</td>
                                <td className="p-200">{getAnalyzerLabel(batch)}</td>
                                <td className="p-300">
                                    <span style={{
                                        color: batch.status === 'completed' ? 'green' : (batch.status === 'failed' ? 'red' : 'orange'),
                                        fontWeight: 'bold'
                                    }}>
                                        {batch.status}
                                    </span>
                                </td>
                                <td className="p-300">{batch.summary?.completed ?? 0}</td>
                                <td className="p-300">{batch.summary?.failed ?? 0}</td>
                                <td className="p-300">{batch.summary?.total ?? 0}</td>
                                <td className="p-300">{batch.createdBy?.email || t('common.na')}</td>
                                <td className="p-300">
                                    {batch.summary?.flagged > 0 ? (
                                        <span style={{ color: '#d30800', fontWeight: 'bold' }}>⚠ {batch.summary.flagged}</span>
                                    ) : (
                                        <span>0</span>
                                    )}
                                </td>
                                <td className="p-300">{new Date(batch.createdAt).toLocaleDateString()}</td>
                                <td className="p-200">
                                    <div className="flex gap-200">
                                        <GcdsButton size="small" onClick={() => handleExport(batch._id)}>Export</GcdsButton>
                                        {batch.status === 'processing' && (
                                            <GcdsButton size="small" buttonRole="secondary" onClick={() => handleResumeBatch(batch._id)}>
                                                {t('experimental.analysis.resume')}
                                            </GcdsButton>
                                        )}
                                        {batch.status === 'completed' && (
                                            <GcdsButton size="small" buttonRole={baselineBatchId === batch._id ? 'primary' : 'secondary'} onClick={() => handleUseAsBaseline(batch._id)}>
                                                {baselineBatchId === batch._id ? 'Baseline Selected' : 'Use as Baseline'}
                                            </GcdsButton>
                                        )}
                                        <GcdsButton size="small" buttonRole="danger" onClick={() => handleDeleteBatch(batch._id)}>Delete</GcdsButton>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </GcdsContainer>
    );
}
