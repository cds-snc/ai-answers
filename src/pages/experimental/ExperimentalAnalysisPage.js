import React, { useState, useEffect } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText } from '@cdssnc/gcds-components-react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';
import * as XLSX from 'xlsx';

export default function ExperimentalAnalysisPage({ lang = 'en' }) {
    const { t } = useTranslations(lang);

    // State
    const [analyzers, setAnalyzers] = useState([
        { id: 'semantic-comparison', name: 'Semantic Comparison', inputType: 'comparison' },
        { id: 'bias-detection', name: 'Bias Detection', inputType: 'single' },
        { id: 'safety', name: 'Safety Evaluation', inputType: 'single' },
        { id: 'opus-judge', name: 'Opus-as-Judge', inputType: 'single' },
        { id: 'refusal-check', name: 'Refusal', inputType: 'single' }
    ]);
    const [selectedAnalyzerId, setSelectedAnalyzerId] = useState('');

    const [inputFile, setInputFile] = useState(null);
    const [comparisonFile, setComparisonFile] = useState(null);
    const [iterations, setIterations] = useState(1);

    const [loading, setLoading] = useState(false);
    const [batches, setBatches] = useState([]);
    const [message, setMessage] = useState('');

    const selectedAnalyzer = analyzers.find(a => a.id === selectedAnalyzerId);

    useEffect(() => {
        fetchBatches();
    }, []);

    const fetchBatches = async () => {
        try {
            const result = await ExperimentalBatchClientService.listBatches(1, 20, 'analysis');
            setBatches(result.data);
        } catch (err) {
            console.error(err);
        }
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
        if (!selectedAnalyzer || !inputFile) {
            setMessage('Please select an analyzer and upload input file.');
            return;
        }
        if (selectedAnalyzer.inputType === 'comparison' && !comparisonFile) {
            setMessage('Comparison analysis requires a second file.');
            return;
        }

        setLoading(true);
        setMessage('');

        try {
            // Parse files
            const inputData = await readExcel(inputFile);
            let items = [];

            if (selectedAnalyzer.inputType === 'comparison') {
                const comparisonData = await readExcel(comparisonFile);

                // Merge simple index-based matching for now
                // Assuming rows align 1-to-1
                // Expected columns: 'question', 'answer'
                items = inputData.map((row, index) => ({
                    question: row.question || row.Question || `Row ${index + 1}`,
                    baselineAnswer: row.answer || row.Answer || '',
                    comparisonAnswer: comparisonData[index]?.answer || comparisonData[index]?.Answer || '',
                    originalData: { baseline: row, comparison: comparisonData[index] }
                }));
            } else {
                // Single input items
                items = inputData.map((row, index) => ({
                    question: row.question || row.Question || `Row ${index + 1}`,
                    answer: row.answer || row.Answer || '', // Evaluator analyzes the 'answer' field
                    originalData: row
                }));
            }

            // Create Batch
            const batchData = {
                name: `${selectedAnalyzer.name} - ${new Date().toLocaleString()}`,
                description: `Analysis via ${selectedAnalyzer.name}`,
                type: 'analysis',
                config: {
                    analyzerId: selectedAnalyzer.id,
                    pageLanguage: 'en',
                },
                items
            };

            const result = await ExperimentalBatchClientService.createBatch(batchData);

            // Trigger Processing immediately
            await ExperimentalBatchClientService.processBatch(result._id);

            setMessage(`Analysis started! Batch ID: ${result._id}`);
            fetchBatches();

            // Reset
            setInputFile(null);
            setComparisonFile(null);

        } catch (err) {
            console.error(err);
            setMessage(`Error: ${err.message || 'Failed to start analysis'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <GcdsContainer size="xl" centered className="my-400">
            <GcdsHeading tag="h1">{t('experimental.analysis.title')}</GcdsHeading>

            <div className="p-400 my-400 border rounded">
                <div>

                    {/* Analyzer Selector */}
                    <div className="mb-400">
                        <label htmlFor="analyzer-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                            {t('experimental.analysis.selectAnalyzer')}
                        </label>
                        <select
                            id="analyzer-select"
                            value={selectedAnalyzerId}
                            onChange={(e) => setSelectedAnalyzerId(e.target.value)}
                            style={{ padding: '8px', width: '100%', maxWidth: '400px' }}
                        >
                            <option value="">{t('experimental.analysis.choose')}</option>
                            {analyzers.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Iterations Dropdown (Demo) */}
                    <div className="mb-400">
                        <label htmlFor="iterations-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                            Iterations (Run count per row)
                        </label>
                        <select
                            id="iterations-select"
                            value={iterations}
                            onChange={(e) => setIterations(parseInt(e.target.value))}
                            style={{ padding: '8px', width: '100%', maxWidth: '100px' }}
                        >
                            {[1, 2, 3, 5, 10].map(n => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </div>

                    {/* Dynamic Uploads */}
                    {selectedAnalyzer && (
                        <div className="border p-300 rounded mb-400">
                            <GcdsText><strong>{selectedAnalyzer.name}</strong> requires {selectedAnalyzer.inputType === 'comparison' ? 'two Excel files' : 'one Excel file'}.</GcdsText>

                            <div className="my-200">
                                <label style={{ display: 'block', marginBottom: '5px' }}>
                                    {selectedAnalyzer.inputType === 'comparison' ? 'Baseline File (Answer A)' : 'Input File (Questions & Answers)'}
                                </label>
                                <input type="file" accept=".xlsx, .xls" onChange={(e) => setInputFile(e.target.files[0])} />
                            </div>

                            {selectedAnalyzer.inputType === 'comparison' && (
                                <div className="my-200">
                                    <label style={{ display: 'block', marginBottom: '5px' }}>Comparison File (Answer B)</label>
                                    <input type="file" accept=".xlsx, .xls" onChange={(e) => setComparisonFile(e.target.files[0])} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action */}
                    <div>
                        <GcdsButton onClick={handleRunAnalysis} disabled={!selectedAnalyzer || loading}>
                            {loading ? 'Processing...' : 'Run Analysis'}
                        </GcdsButton>
                        {message && <GcdsText className="mt-200" role="status">{message}</GcdsText>}
                    </div>

                </div>
            </div>

            {/* Results List */}
            <GcdsHeading tag="h2" className="mt-600">Recent Analysis Batches</GcdsHeading>
            <div className="overflow-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                            <th className="p-200">Name</th>
                            <th className="p-200">Type</th>
                            <th className="p-200">Status</th>
                            <th className="p-200">Progress</th>
                            <th className="p-200">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {batches.map(batch => (
                            <tr key={batch._id} style={{ borderBottom: '1px solid #eee' }}>
                                <td className="p-200">{batch.name}</td>
                                <td className="p-200">{batch.config?.analyzerId || batch.type}</td>
                                <td className="p-200">{batch.status}</td>
                                <td className="p-200">
                                    {batch.summary?.completed}/{batch.summary?.total}
                                    {batch.summary?.failed > 0 && ` (${batch.summary.failed} failed)`}
                                </td>
                                <td className="p-200">{new Date(batch.createdAt).toLocaleDateString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

        </GcdsContainer>
    );
}
