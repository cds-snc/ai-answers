import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Heading, Button, Select, Text, FileUploader, Container, Grid, Card } from '@cdssnc/gcds-components-react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';
import * as XLSX from 'xlsx';

export default function ExperimentalAnalysisPage() {
    const { t } = useTranslation();

    // State
    const [analyzers, setAnalyzers] = useState([
        { id: 'semantic-comparison', name: 'Semantic Comparison', inputType: 'comparison' },
        { id: 'bias-detection', name: 'Bias Detection', inputType: 'single' },
        { id: 'safety', name: 'Safety Evaluation', inputType: 'single' }
    ]);
    const [selectedAnalyzerId, setSelectedAnalyzerId] = useState('');

    const [inputFile, setInputFile] = useState(null);
    const [comparisonFile, setComparisonFile] = useState(null);

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
        <Container size="xl" centered className="my-400">
            <Heading tag="h1">{t('experimental.analysis.title', 'Experimental Analysis')}</Heading>

            <Card className="p-400 my-400">
                <Grid columns="1fr" gap="400">

                    {/* Analyzer Selector */}
                    <div>
                        <Select
                            label={t('experimental.analysis.selectAnalyzer', 'Select Analyzer')}
                            value={selectedAnalyzerId}
                            onChange={(e) => setSelectedAnalyzerId(e.target.value)}
                            options={[
                                { value: '', text: 'Choose...' },
                                ...analyzers.map(a => ({ value: a.id, text: a.name }))
                            ]}
                        />
                    </div>

                    {/* Dynamic Uploads */}
                    {selectedAnalyzer && (
                        <div className="border p-300 rounded">
                            <Text><strong>{selectedAnalyzer.name}</strong> requires {selectedAnalyzer.inputType === 'comparison' ? 'two Excel files' : 'one Excel file'}.</Text>

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
                        <Button onClick={handleRunAnalysis} disabled={!selectedAnalyzer || loading}>
                            {loading ? 'Processing...' : 'Run Analysis'}
                        </Button>
                        {message && <Text className="mt-200" role="status">{message}</Text>}
                    </div>

                </Grid>
            </Card>

            {/* Results List */}
            <Heading tag="h2" className="mt-600">Recent Analysis Batches</Heading>
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

        </Container>
    );
}
