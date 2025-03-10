// server/server.js - this is only used for local development NOT for Vercel
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import openAIHandler from '../api/openai/openai-message.js';
import azureHandler from '../api/azure/azure-message.js';
import azureContextHandler from '../api/azure/azure-context.js';
import azureBatchProcessResultsHandler from '../api/azure/azure-batch-process-results.js';
import anthropicAgentHandler from '../api/anthropic/anthropic-message.js';
import dbChatLogsHandler from '../api/db/db-chat-logs.js';
import anthropicBatchHandler from '../api/anthropic/anthropic-batch.js';
import openAIBatchHandler from '../api/openai/openai-batch.js';
import anthropicBatchStatusHandler from '../api/anthropic/anthropic-batch-status.js';
import openAIBatchStatusHandler from '../api/openai/openai-batch-status.js';
import contextSearchHandler from '../api/search/search-context.js';
import anthropicBatchContextHandler from '../api/anthropic/anthropic-batch-context.js';
import openAIBatchContextHandler from '../api/openai/openai-batch-context.js';
import dbBatchListHandler from '../api/db/db-batch-list.js';
import anthropicBatchProcessResultsHandler from '../api/anthropic/anthropic-batch-process-results.js';
import openAIBatchProcessResultsHandler from '../api/openai/openai-batch-process-results.js';
import dbBatchRetrieveHandler from '../api/db/db-batch-retrieve.js';
import anthropicBatchCancelHandler from '../api/anthropic/anthropic-batch-cancel.js';
import openAIBatchCancelHandler from '../api/openai/openai-batch-cancel.js';
import anthropicContextAgentHandler from '../api/anthropic/anthropic-context.js';
import openAIContextAgentHandler from '../api/openai/openai-context.js';
import dbChatSessionHandler from '../api/db/db-chat-session.js';
import dbVerifyChatSessionHandler from '../api/db/db-verify-chat-session.js';
import dbCheckhandler from '../api/db/db-check.js';
import dbPersistInteraction from '../api/db/db-persist-interaction.js';
import dbPersistFeedback from '../api/db/db-persist-feedback.js';
import dbLogHandler from '../api/db/db-log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use(express.static(path.join(__dirname, '../build')));
app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api')) {
    next();
    return;
  }
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

app.post('/api/db-persist-feedback', dbPersistFeedback);
app.post('/api/db-persist-interaction', dbPersistInteraction);
app.get('/api/db-chat-session', dbChatSessionHandler);
app.get('/api/db-verify-chat-session', dbVerifyChatSessionHandler);
app.post("/api/openai-message", openAIHandler);
app.post("/api/azure-message", azureHandler);  // Updated Azure endpoint
app.post('/api/anthropic-message', anthropicAgentHandler);
app.post('/api/anthropic-context', anthropicContextAgentHandler);
app.post("/api/openai/openai-context", azureContextHandler);
app.post("/api/azure-context", azureContextHandler);
app.get('/api/db-chat-logs', dbChatLogsHandler);
app.post('/api/anthropic-batch', anthropicBatchHandler);
app.post('/api/openai-batch', openAIBatchHandler);
//app.post('/api/azure/azure-batch', azureBatchHandler);
//app.get('/api/anthropic-batch-status', anthropicBatchStatusHandler);
//app.get('/api/openai-batch-status', openAIBatchStatusHandler);
//app.get('/api/azure/azure-batch-status', azureBatchStatusHandler);
app.post('/api/search-context', contextSearchHandler);
app.post('/api/anthropic-batch-context', anthropicBatchContextHandler);
//app.post('/api/azure/azure-batch-context', azureBatchContextHandler);
app.get('/api/anthropic-batch-cancel', anthropicBatchCancelHandler);
app.get('/api/openai-batch-cancel', openAIBatchCancelHandler);
//app.get('/api/azure/azure-batch-cancel', azureBatchCancelHandler);
app.post('/api/openai-batch-context', openAIBatchContextHandler);
app.get('/api/db-batch-list', dbBatchListHandler);
app.get('/api/anthropic-batch-status', anthropicBatchStatusHandler);
app.get('/api/azure/azure-batch-process-results', azureBatchProcessResultsHandler);
app.get('/api/anthropic-batch-process-results', anthropicBatchProcessResultsHandler);
app.get('/api/openai-batch-process-results', openAIBatchProcessResultsHandler);
app.get('/api/db-batch-retrieve', dbBatchRetrieveHandler);
app.get('/api/db-check', dbCheckhandler);
app.get('/api/db-log', dbLogHandler);
app.post('/api/db-log', dbLogHandler);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Healthy' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));