import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsDetails, GcdsInput } from '@cdssnc/gcds-components-react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';
import * as XLSX from 'xlsx';

export default function ExperimentalAnalysisPage({ lang = 'en' }) {
    const { t } = useTranslations(lang);

    // State
    const [analyzers, setAnalyzers] = useState([]);
    const [selectedAnalyzerIds, setSelectedAnalyzerIds] = useState([]);

    const [datasets, setDatasets] = useState([]);
    const [selectedDatasetId, setSelectedDatasetId] = useState('');

    const [inputFile, setInputFile] = useState(null);
    const [comparisonFile, setComparisonFile] = useState(null);
    const [iterations, setIterations] = useState(1);

    const [loading, setLoading] = useState(false);
    const [batches, setBatches] = useState([]);
    const [message, setMessage] = useState('');

    // Progress tracking
    const [batchProgress, setBatchProgress] = useState({});
    const eventSourceRef = useRef(null);

    useEffect(() => {
        fetchInitialData();
        return () => {
            if (eventSourceRef.current) eventSourceRef.current.close();
        };
    }, []);

    const fetchInitialData = async () => {
        try {
            const [az, ds, bt] = await Promise.all([
                ExperimentalBatchClientService.listAnalyzers(),
                ExperimentalBatchClientService.listDatasets(),
                ExperimentalBatchClientService.listBatches(1, 20, 'analysis')
            ]);
            setAnalyzers(az);
            setDatasets(ds.data || []);
            setBatches(bt.data);
        } catch (err) {
            console.error('Failed to fetch initial data:', err);
        }
    };

    const fetchBatches = async () => {
        try {
            const result = await ExperimentalBatchClientService.listBatches(1, 20, 'analysis');
            setBatches(result.data);

            // Auto-track progress for any processing batches on page load
            const processingBatch = result.data?.find(b => b.status === 'processing');
            if (processingBatch && (!batchProgress[processingBatch._id] || batchProgress[processingBatch._id].status !== 'completed')) {
                trackProgress(processingBatch._id);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const toggleAnalyzer = (id) => {
        setSelectedAnalyzerIds(prev =>
            prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
        );
    };

    const readExcel = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                resolve(jsonData);
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    const handleRunAnalysis = async () => {
        if (selectedAnalyzerIds.length === 0) {
            setMessage('Please select at least one analyzer.');
            return;
        }

        if (!selectedDatasetId && !inputFile) {
            setMessage('Please select a dataset or upload a file.');
            return;
        }

        const isComparison = selectedAnalyzerIds.some(id =>
            analyzers.find(a => a.id === id)?.inputType === 'comparison'
        );

        if (isComparison && !comparisonFile && !selectedDatasetId) {
            setMessage('Comparison analysis requires a second file or a specific dataset type.');
            return;
        }

        setLoading(true);
        setMessage('');

        try {
            let items = [];

            if (selectedDatasetId) {
                // Backend will handle fetching rows by datasetId if we pass it in config
                // For now, let's assume we want to send items if we follow the existing API
                // Better: update batch-create to support datasetId
                items = []; // Placeholder, we'll send datasetId in config
            } else {
                const inputData = await readExcel(inputFile);
                if (isComparison) {
                    const comparisonData = await readExcel(comparisonFile);
                    items = inputData.map((row, index) => ({
                        question: row.question || row.Question || `Row ${index + 1}`,
                        baselineAnswer: row.answer || row.Answer || '',
                        comparisonAnswer: comparisonData[index]?.answer || comparisonData[index]?.Answer || '',
                        originalData: { baseline: row, comparison: comparisonData[index] }
                    }));
                } else {
                    items = inputData.map((row, index) => ({
                        question: row.question || row.Question || `Row ${index + 1}`,
                        answer: row.answer || row.Answer || '',
                        originalData: row
                    }));
                }
            }

            // Create Batch
            const batchData = {
                name: `Analysis - ${new Date().toLocaleString()}`,
                description: `Analyzers: ${selectedAnalyzerIds.join(', ')}`,
                type: 'analysis',
                config: {
                    analyzerIds: selectedAnalyzerIds,
                    datasetId: selectedDatasetId || undefined,
                    pageLanguage: 'en',
                },
                items: items.length > 0 ? items : []
            };

            const result = await ExperimentalBatchClientService.createBatch(batchData);

            // Start SSE tracking
            trackProgress(result._id);

            // Trigger Processing
            await ExperimentalBatchClientService.processBatch(result._id);

            setMessage(`Analysis started! Batch ID: ${result._id}`);
            fetchBatches();

        } catch (err) {
            console.error(err);
            setMessage(`Error: ${err.message || 'Failed to start analysis'}`);
        } finally {
            setLoading(false);
        }
    };

    const fetchDatasets = async () => {
        try {
            const ds = await ExperimentalBatchClientService.listDatasets();
            setDatasets(ds.data || []);
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteBatch = async (batchId) => {
        if (!window.confirm('Are you sure you want to delete this batch?')) return;
        try {
            await ExperimentalBatchClientService.deleteBatch(batchId);
            fetchBatches();
        } catch (err) {
            console.error('Delete error:', err);
            alert('Failed to delete batch');
        }
    };

    const handleExport = async (batchId) => {
        try {
            const data = await ExperimentalBatchClientService.exportBatch(batchId);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `batch-${batchId}-results.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export error:', err);
            alert('Failed to export batch');
        }
    };

    const handlePromote = async (batch) => {
        const name = window.prompt('Enter a name for the new dataset:', `Results from ${batch.name}`);
        if (!name) return;
        try {
            await ExperimentalBatchClientService.promoteBatch(batch._id, {
                name,
                description: `Promoted from batch: ${batch.name} (${batch._id})`
            });
            alert('Batch promoted to dataset successfully!');
            fetchDatasets();
        } catch (err) {
            console.error('Promote error:', err);
            alert('Failed to promote batch');
        }
    };

    const trackProgress = (batchId) => {
        if (eventSourceRef.current) clearInterval(eventSourceRef.current);

        const url = ExperimentalBatchClientService.getBatchProgressUrl(batchId);

        const pollProgress = async () => {
            try {
                const res = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    credentials: 'include' // matches AuthService behavior
                });

                if (!res.ok) {
                    throw new Error(`Polling failed with status ${res.status}`);
                }

                const data = await res.json();

                // If the backend returns an error message inside the json payload
                if (data.error) {
                    console.error('Progress Polling Error:', data.error);
                    clearInterval(eventSourceRef.current);
                    return;
                }

                setBatchProgress(prev => ({ ...prev, [batchId]: data }));

                if (['completed', 'failed', 'cancelled'].includes(data.status)) {
                    clearInterval(eventSourceRef.current);
                    fetchBatches();
                }
            } catch (err) {
                console.error('Progress Polling Error:', err);
                clearInterval(eventSourceRef.current);
            }
        };

        // Initial fetch then poll every 5 seconds
        pollProgress();
        eventSourceRef.current = setInterval(pollProgress, 5000);
    };

    return (
        <GcdsContainer size="xl" centered className="my-400">
            <GcdsHeading tag="h1">Experimental Analysis</GcdsHeading>

            <div className="p-400 my-400 border rounded">
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 1fr', gap: '2rem' }}>

                    {/* LEFT: Configuration */}
                    <div>
                        <GcdsHeading tag="h2">Configuration</GcdsHeading>

                        {/* Analyzer Multi-Selector */}
                        <div className="mb-400">
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                Select Analyzers
                            </label>
                            <div className="border p-200 rounded" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                {analyzers.map(a => (
                                    <div key={a.id} className="mb-100">
                                        <input
                                            type="checkbox"
                                            id={`az-${a.id}`}
                                            checked={selectedAnalyzerIds.includes(a.id)}
                                            onChange={() => toggleAnalyzer(a.id)}
                                        />
                                        <label htmlFor={`az-${a.id}`} className="ml-100">
                                            <strong>{a.name}</strong> - {a.description}
                                        </label>
                                    </div>
                                ))}
                            </div>
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
                                <option value="">-- Upload a new file instead --</option>
                                {datasets.map(ds => (
                                    <option key={ds._id} value={ds._id}>{ds.name} ({ds.rowCount} rows)</option>
                                ))}
                            </select>
                        </div>

                        {/* File Upload (Fallback) */}
                        {!selectedDatasetId && (
                            <div className="border p-300 rounded mb-400 bg-light">
                                <GcdsText>Or upload new data:</GcdsText>
                                <div className="my-200">
                                    <label style={{ display: 'block', marginBottom: '5px' }}>Input File (Excel/CSV)</label>
                                    <input type="file" accept=".xlsx, .xls, .csv" onChange={(e) => setInputFile(e.target.files[0])} />
                                </div>
                                <div className="my-200">
                                    <label style={{ display: 'block', marginBottom: '5px' }}>Comparison File (Optional)</label>
                                    <input type="file" accept=".xlsx, .xls, .csv" onChange={(e) => setComparisonFile(e.target.files[0])} />
                                </div>
                            </div>
                        )}

                        <GcdsButton onClick={handleRunAnalysis} disabled={loading || selectedAnalyzerIds.length === 0}>
                            {loading ? 'Starting...' : 'Run Analysis'}
                        </GcdsButton>
                        {message && <GcdsText className="mt-200" role="status"><strong>{message}</strong></GcdsText>}
                    </div>

                    {/* RIGHT: Active Batches / Status */}
                    <div>
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
                        {Object.keys(batchProgress).length === 0 && <GcdsText>No active processing tracked via SSE yet.</GcdsText>}
                    </div>
                </div>
            </div>

            {/* History List */}
            <GcdsHeading tag="h2" className="mt-600">History</GcdsHeading>
            <div className="overflow-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                            <th className="p-200">Name</th>
                            <th className="p-200">Analyzers</th>
                            <th className="p-200">Status</th>
                            <th className="p-200">Progress</th>
                            <th className="p-200">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {batches.map(batch => (
                            <tr key={batch._id} style={{ borderBottom: '1px solid #eee' }}>
                                <td className="p-200">{batch.name}</td>
                                <td className="p-200">{(batch.config?.analyzerIds || [batch.config?.analyzerId] || []).join(', ')}</td>
                                <td className="p-200">
                                    <span style={{
                                        color: batch.status === 'completed' ? 'green' : (batch.status === 'failed' ? 'red' : 'orange'),
                                        fontWeight: 'bold'
                                    }}>
                                        {batch.status}
                                    </span>
                                </td>
                                <td className="p-200">
                                    {batch.summary?.completed}/{batch.summary?.total}
                                </td>
                                <td className="p-200">{new Date(batch.createdAt).toLocaleDateString()}</td>
                                <td className="p-200">
                                    <div className="flex gap-200">
                                        <GcdsButton size="small" onClick={() => handleExport(batch._id)}>Export</GcdsButton>
                                        {batch.status === 'completed' && (
                                            <GcdsButton size="small" buttonRole="secondary" onClick={() => handlePromote(batch)}>Promote</GcdsButton>
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
