// src/components/admin/Evaluator.js
import React, { useState, useCallback, useEffect } from 'react';
import {
    GcdsContainer,
    GcdsHeading,
    GcdsText
} from '@cdssnc/gcds-components-react';
import LoggingService from '../../services/LoggingService';
import ClaudeService from '../../services/ClaudeService';
import ChatGPTService from '../../services/ChatGPTService';
import RedactionService from '../../services/RedactionService';
import { parseEvaluationResponse } from '../../utils/evaluationParser';
import loadSystemPrompt from '../../services/systemPrompt.js';

const MAX_POLLING_DURATION = 5 * 60 * 1000; // 5 minutes for testing (in milliseconds)
const POLLING_INTERVAL = 5000; // 5 seconds (in milliseconds)   

const Evaluator = () => {
    const [file, setFile] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const [processedCount, setProcessedCount] = useState(0);
    const [totalEntries, setTotalEntries] = useState(0);
    const [selectedAI, setSelectedAI] = useState('claude');
    const [fileUploaded, setFileUploaded] = useState(false);

    const [useBatchProcessing, setUseBatchProcessing] = useState(true);
    const [batchId, setBatchId] = useState(null);
    const [batchStatus, setBatchStatus] = useState(null);
    const [batchResults, setBatchResults] = useState(null);
    const [isPolling, setIsPolling] = useState(false);
    const [pollStartTime, setPollStartTime] = useState(null);

    const handleFileChange = (event) => {
        setError(null);
        const uploadedFile = event.target.files[0];
        
        if (!uploadedFile) {
            setFile(null);
            return;
        }
    
        if (!uploadedFile.name.endsWith('.csv')) {
            setError('Please upload a CSV file that you downloaded from the Feedback Viewer');
            setFile(null);
            return;
        }
    
        setFile(uploadedFile);
        setResults(null);
        setProcessedCount(0);
        setFileUploaded(false);
    };

    const handleAIToggle = (e) => {
        setSelectedAI(e.target.value);
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        
        if (!file) {
            setError('Please select a file first');
            return;
        }

        try {
            await file.text();
            setFileUploaded(true);
            setError(null);
        } catch (err) {
            setError('Failed to read the file. Please try uploading again.');
            console.error('Error reading file:', err);
        }
    };

    const isValidLine = (line) => {
        // Remove all commas and whitespace
        const cleanLine = line.replace(/,/g, '').trim();
        return cleanLine.length > 0;
    };

    const parseCSVLine = (line) => {
        const values = [];
        let currentValue = '';
        let withinQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                withinQuotes = !withinQuotes;
                continue;
            }
            
            if (char === ',' && !withinQuotes) {
                values.push(currentValue.trim());
                currentValue = '';
                continue;
            }
            
            currentValue += char;
        }
        
        values.push(currentValue.trim());
        return values;
    };

    const processCSV = (csvText) => {
        try {
            const lines = csvText
                .split(/\r?\n/)
                .filter(line => isValidLine(line));
            
            const headers = parseCSVLine(lines[0]);
            const problemDetailsIndex = headers.findIndex(h => h.trim() === 'Problem Details');
            const urlIndex = headers.findIndex(h => h.trim() === 'URL');

            if (problemDetailsIndex === -1 || urlIndex === -1) {
                throw new Error('Required columns "Problem Details" and "URL" not found in CSV file. Please ensure you are using a file with those columns ordownloaded from the Feedback Viewer.');
            }

            const entries = lines.slice(1)
                .map(line => {
                    const values = parseCSVLine(line);
                    const question = values[problemDetailsIndex]?.trim();
                    const url = values[urlIndex]?.trim();

                    if (question && url) {
                        console.log('Processing valid entry:', { question, url });
                    }

                    return {
                        question: question || '',
                        referringUrl: url || ''
                    };
                })
                .filter(entry => entry.question && entry.referringUrl);

            console.log(`Found ${entries.length} valid entries to process`);
            return entries;
        } catch (error) {
            console.error('Error processing CSV:', error);
            throw new Error(`Failed to process CSV file: ${error.message}`);
        }
    };

    const processEntry = async (entry) => {
        try {
            const { redactedText } = RedactionService.redactText(entry.question);
            const messageWithUrl = `<evaluation>${redactedText}\n<referring-url>${entry.referringUrl}</referring-url></evaluation>`;

            const aiResponse = selectedAI === 'claude' 
                ? await ClaudeService.sendMessage(messageWithUrl)
                : await ChatGPTService.sendMessage(messageWithUrl);

            const { citationUrl, confidenceRating } = parseEvaluationResponse(aiResponse, selectedAI);

            const logEntry = {
                redactedQuestion: redactedText,
                aiResponse,
                aiService: selectedAI,
                referringUrl: entry.referringUrl,
                citationUrl,
                confidenceRating
            };

            await LoggingService.logInteraction(logEntry, true);
            setProcessedCount(prev => prev + 1);
        } catch (error) {
            console.error('Error processing entry:', error);
            throw error;
        }
    };

    const handleBatchToggle = (e) => {
        setUseBatchProcessing(e.target.checked);
    };

    const processBatch = async (entries) => {
        try {
            console.log(`Starting batch processing for ${entries.length} entries...`);
            
            // Load the proper system prompt
            const systemPrompt = await loadSystemPrompt();
            
            // Format entries for batch processing
            const requests = entries.map((entry, index) => {
                const { redactedText } = RedactionService.redactText(entry.question);
                const messageWithUrl = `<evaluation>${redactedText}\n<referring-url>${entry.referringUrl}</referring-url></evaluation>`;
                console.log(`Entry ${index + 1} formatted:`, messageWithUrl);
                return messageWithUrl;
            });

            const payload = {
                requests,
                systemPrompt
            };
            
            console.log('Payload being sent to API:', {
                requestCount: requests.length,
                systemPromptLength: systemPrompt.length
            });

            const response = await fetch('/api/claude-batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API error: ${errorData.details || errorData.error || response.statusText}`);
            }

            const data = await response.json();
            
            if (data.batchId) {
                console.log(`Batch created successfully. Batch ID: ${data.batchId}`);
                setBatchId(data.batchId);
                setBatchStatus('processing');
                setIsPolling(true);
            } else {
                throw new Error('No batch ID received from API');
            }
        } catch (error) {
            console.error('Error processing batch:', error);
            setError(`Failed to start batch processing: ${error.message}`);
        }
    };

    const processResults = async (results) => {
        console.log(`Processing ${results.length} results from batch...`);
        for (const [index, result] of results.entries()) {
            try {
                const { citationUrl, confidenceRating } = parseEvaluationResponse(
                    result.message.content,
                    'claude'
                );

                console.log(`Result ${index + 1}/${results.length}:`, {
                    citationUrl,
                    confidenceRating
                });

                const logEntry = {
                    redactedQuestion: result.original_request.params.messages[0].content,
                    aiResponse: result.message.content,
                    aiService: 'claude',
                    referringUrl: result.original_request.params.messages[0].content.match(/<referring-url>(.*?)<\/referring-url>/)[1],
                    citationUrl,
                    confidenceRating
                };

                await LoggingService.logInteraction(logEntry, true);
                setProcessedCount(prev => prev + 1);
            } catch (error) {
                console.error(`Error processing result ${index + 1}:`, error);
            }
        }
        console.log('Batch processing complete!');
    };

    const handleProcessFile = async () => {
        if (!file) return;

        setProcessing(true);
        setError(null);
        setProcessedCount(0);

        try {
            const text = await file.text();
            const entries = processCSV(text);
            setTotalEntries(entries.length);

            if (entries.length === 0) {
                throw new Error('No valid entries found in the CSV file');
            }

            if (useBatchProcessing) {
                await processBatch(entries);
            } else {
                const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                for (const entry of entries) {
                    await processEntry(entry);
                    if (selectedAI === 'chatgpt') {
                        await delay(2000);
                    }
                }
            }

            setResults({
                fileName: file.name,
                size: file.size,
                entriesProcessed: entries.length
            });

        } catch (err) {
            setError(err.message);
            console.error('Error processing file:', err);
        } finally {
            setProcessing(false);
        }
    };

    const checkBatchStatus = useCallback(async () => {
        if (!batchId) return;
        
        try {
            const response = await fetch(`/api/claude-batch-status?batchId=${batchId}`);
            const data = await response.json();
            
            setBatchStatus(data.status);
            
            if (data.status === 'ended' && data.results) {
                setIsPolling(false);
                // Parse JSONL results
                const results = data.results.split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
                setBatchResults(results);
                
                // Process the results and log them
                await processResults(results);
            }
        } catch (error) {
            console.error('Error checking batch status:', error);
            setIsPolling(false);
        }
    }, [batchId]);

    const handleCancel = async () => {
        if (!batchId) return;
        
        try {
            const response = await fetch('/api/claude-batch-cancel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ batchId })
            });
            
            if (!response.ok) {
                throw new Error('Failed to cancel batch');
            }
            
            setIsPolling(false);
            setBatchStatus('canceling');
        } catch (error) {
            console.error('Error canceling batch:', error);
            setError('Failed to cancel batch: ' + error.message);
        }
    };

    useEffect(() => {
        let pollInterval;
        
        if (isPolling && batchId) {
            setPollStartTime(Date.now());
            pollInterval = setInterval(() => {
                const elapsedTime = Date.now() - pollStartTime;
                
                if (elapsedTime > MAX_POLLING_DURATION) {
                    console.log('Maximum polling duration reached');
                    setIsPolling(false);
                    setError('Polling timeout reached. Please check batch status manually.');
                    return;
                }
                
                checkBatchStatus();
            }, POLLING_INTERVAL);
        }
        
        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [isPolling, batchId, pollStartTime, checkBatchStatus]);

    return (
        <GcdsContainer className="mb-600">
            <div className="steps-container">
                <div className="step">
                    <GcdsHeading tag="h3">Step 1: Select Settings</GcdsHeading>
                    <GcdsText>Select the AI service and CSV file that you've downloaded and cleaned from the Feedback viewer. You can use any CSV file as long as there are columns labelled 'Problem Details' and 'URL' with the question and referral URL.</GcdsText>

                    <form onSubmit={handleUpload} className="mt-400">
                        <div className="ai-toggle" style={{ marginBottom: '20px' }}>
                            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <legend style={{ marginRight: '10px' }}>AI Service:</legend>
                                    <div style={{ display: 'flex', alignItems: 'center', marginRight: '15px' }}>
                                        <input
                                            type="radio"
                                            id="claude"
                                            name="ai-selection"
                                            value="claude"
                                            checked={selectedAI === 'claude'}
                                            onChange={handleAIToggle}
                                            style={{ marginRight: '5px' }}
                                        />
                                        <label htmlFor="claude" style={{ marginRight: '15px' }}>Anthropic Claude 3.5 Sonnet</label>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <input
                                            type="radio"
                                            id="chatgpt"
                                            name="ai-selection"
                                            value="chatgpt"
                                            checked={selectedAI === 'chatgpt'}
                                            onChange={handleAIToggle}
                                            style={{ marginRight: '5px' }}
                                        />
                                        <label htmlFor="chatgpt">OpenAI ChatGPT 4</label>
                                    </div>
                                </div>
                            </fieldset>
                        </div>

                        <div className="batch-toggle" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <input
                                    type="checkbox"
                                    id="batchProcessing"
                                    checked={useBatchProcessing}
                                    onChange={handleBatchToggle}
                                    style={{ marginRight: '5px' }}
                                />
                                <label htmlFor="batchProcessing">
                                    Use batch processing (recommended for large files)
                                </label>
                            </div>
                        </div>

                        <div className="file-input-container" style={{ marginBottom: '20px' }}>
                            <label htmlFor="csvFile" style={{ display: 'block', marginBottom: '10px' }}>
                                Select feedback CSV file:
                            </label>
                            <input
                                type="file"
                                id="csvFile"
                                accept=".csv"
                                onChange={handleFileChange}
                                style={{ marginBottom: '10px' }}
                            />
                            {file && (
                                <div>Selected file: {file.name}</div>
                            )}
                        </div>

                        {error && (
                            <div className="error-message" style={{ color: 'red', marginBottom: '10px' }}>
                                {error}
                            </div>
                        )}

                        {file && !fileUploaded && (
                            <button 
                                type="submit"
                                className="primary-button"
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#26374a',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                Upload File
                            </button>
                        )}

                        {processing && (
                            <div className="processing-status mt-400">
                                {useBatchProcessing ? (
                                    <>
                                        <GcdsText>Batch Status: {batchStatus || 'Preparing'}</GcdsText>
                                        <GcdsText>Processed: {processedCount} of {totalEntries}</GcdsText>
                                        {batchStatus === 'processing' && (
                                            <>
                                                <GcdsText>
                                                    Polling for results every 5 seconds... 
                                                    This may take several minutes for large batches.
                                                </GcdsText>
                                                <button 
                                                    onClick={handleCancel}
                                                    className="secondary-button"
                                                    style={{
                                                        marginTop: '10px',
                                                        padding: '8px 16px',
                                                        backgroundColor: '#dc3545',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Cancel Batch
                                                </button>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <GcdsText>Processing entries: {processedCount} of {totalEntries}</GcdsText>
                                )}
                            </div>
                        )}

                        {results && (
                            <div className="results-section mt-400">
                                <GcdsHeading tag="h3">Processing Complete</GcdsHeading>
                                <GcdsText>File: {results.fileName}</GcdsText>
                                <GcdsText>Entries processed: {results.entriesProcessed}</GcdsText>
                            </div>
                        )}

                        {fileUploaded && (
                            <button 
                                onClick={handleProcessFile}
                                className="primary-button"
                                disabled={processing}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#26374a',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: processing ? 'not-allowed' : 'pointer',
                                    marginTop: '20px'
                                }}
                            >
                                {processing ? 'Processing...' : 'Start Processing'}
                            </button>
                        )}

                        {batchStatus && (
                            <div className="mt-4">
                                <h3>Batch Status: {batchStatus}</h3>
                                {batchStatus === 'processing' && (
                                    <div className="text-gray-600">
                                        Processing your requests... This may take several minutes.
                                    </div>
                                )}
                            </div>
                        )}

                        {batchResults && (
                            <div className="results-section mt-400">
                                <GcdsHeading tag="h3">Processing Complete</GcdsHeading>
                                <GcdsText>Total entries processed: {processedCount}</GcdsText>
                                <GcdsText>Successfully logged to database</GcdsText>
                                <details>
                                    <summary>View Processing Details</summary>
                                    <pre style={{ whiteSpace: 'pre-wrap' }}>
                                        {JSON.stringify(batchResults.slice(0, 3), null, 2)}... 
                                        {batchResults.length > 3 && `\n(${batchResults.length - 3} more results)`}
                                    </pre>
                                </details>
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </GcdsContainer>
    );
};

export default Evaluator;