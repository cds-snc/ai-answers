import dbDeleteExpertEvalHandler from '../api/db/db-delete-expert-eval.js';
import checkUrlHandler from '../api/util/util-check-url.js';
import similarChatsHandler from '../api/vector/vector-similar-chats.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import openAIHandler from '../api/openai/openai-message.js';
import azureHandler from '../api/azure/azure-message.js';
import azureContextHandler from '../api/azure/azure-context.js';
import anthropicAgentHandler from '../api/anthropic/anthropic-message.js';
import dbChatLogsHandler from '../api/db/db-chat-logs.js';
import contextSearchHandler from '../api/search/search-context.js';
import dbBatchListHandler from '../api/batch/batch-list.js';
import dbBatchRetrieveHandler from '../api/batch/batch-retrieve.js';
import dbBatchPersistHandler from '../api/batch/batch-persist.js';
import dbBatchItemsUpsertHandler from '../api/batch/batch-items-upsert.js';
import dbBatchDeleteHandler from '../api/batch/batch-delete.js';
import batchesDeleteAllHandler from '../api/batch/batches-delete-all.js';
import anthropicContextAgentHandler from '../api/anthropic/anthropic-context.js';
import openAIContextAgentHandler from '../api/openai/openai-context.js';
import dbChatSessionHandler from '../api/db/db-chat-session.js';
import chatSimilarAnswerHandler from '../api/chat/chat-similar-answer.js';
import chatPIICheckHandler from '../api/chat/chat-pii-check.js';
import chatDetectLanguageHandler from '../api/chat/chat-detect-language.js';
import chatTranslateHandler from '../api/chat/chat-translate.js';
import dbVerifyChatSessionHandler from '../api/db/db-verify-chat-session.js';
import dbCheckhandler from '../api/db/db-check.js';
import dbPersistInteraction from '../api/db/db-persist-interaction.js';
import feedbackPersistExpertHandler from '../api/feedback/feedback-persist-expert.js';
import feedbackPersistPublicHandler from '../api/feedback/feedback-persist-public.js';
import dbLogHandler from '../api/db/db-log.js';
import signupHandler from '../api/db/db-auth-signup.js';
import loginHandler from '../api/db/db-auth-login.js';
import logoutHandler from '../api/db/db-auth-logout.js';
import userLogoutHandler from '../api/user/user-auth-logout.js';
import dbConnect from '../api/db/db-connect.js';
import dbUsersHandler from '../api/db/db-users.js';
import deleteChatHandler from '../api/chat/chat-delete.js';
import generateEmbeddingsHandler from '../api/db/db-generate-embeddings.js';
import generateEvalsHandler from '../api/db/db-generate-evals.js';
import dbDatabaseManagementHandler from '../api/db/db-database-management.js';
import dbDeleteSystemLogsHandler from '../api/db/db-delete-system-logs.js';
import settingHandler from '../api/setting/setting-handler.js';
import settingPublicHandler from '../api/setting/setting-public-handler.js';
import dbPublicEvalListHandler from '../api/db/db-public-eval-list.js';
import dbChatHandler from '../api/db/db-chat.js';
import dbExpertFeedbackCountHandler from '../api/db/db-expert-feedback-count.js';
import dbEvalNonEmptyCountHandler from '../api/db/db-eval-non-empty-count.js';
import dbTableCountsHandler from '../api/db/db-table-counts.js';
import dbRepairTimestampsHandler from '../api/db/db-repair-timestamps.js';
import dbRepairExpertFeedbackHandler from '../api/db/db-repair-expert-feedback.js';
import dbMigratePublicFeedbackHandler from '../api/db/db-migrate-public-feedback.js';
import { VectorService, initVectorService } from '../services/VectorServiceFactory.js';
import vectorReinitializeHandler from '../api/vector/vector-reinitialize.js';
import vectorStatsHandler from '../api/vector/vector-stats.js';
import dbBatchStatsHandler from '../api/batch/batch-stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "../build")));

// Set higher timeout limits for all routes
app.use((req, res, next) => {
  // Set timeout to 5 minutes
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} request to ${req.url}`);
  next();
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "Healthy" });
});


app.get("*", (req, res, next) => {
  if (req.url.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.join(__dirname, "../build", "index.html"));
});

app.get('/api/util/util-check-url', checkUrlHandler);
app.post('/api/vector/vector-reinitialize', vectorReinitializeHandler);
app.get('/api/vector/vector-similar-chats', similarChatsHandler);
app.get('/api/vector/vector-stats', vectorStatsHandler);
app.get('/api/db/db-public-eval-list', dbPublicEvalListHandler);
app.get('/api/db/db-chat', dbChatHandler);
app.post('/api/feedback/feedback-persist-expert', feedbackPersistExpertHandler);
app.post('/api/feedback/feedback-persist-public', feedbackPersistPublicHandler);
app.post('/api/db/db-persist-interaction', dbPersistInteraction);
app.get('/api/db/db-chat-session', dbChatSessionHandler);
app.get('/api/db/db-verify-chat-session', dbVerifyChatSessionHandler);
app.get('/api/batch/batch-list', dbBatchListHandler);
app.get('/api/batch/batch-retrieve', dbBatchRetrieveHandler);

app.post('/api/batch/batch-persist', dbBatchPersistHandler);
app.post('/api/batch/batch-items-upsert', dbBatchItemsUpsertHandler);
app.delete('/api/batch/batch-delete', dbBatchDeleteHandler);
app.delete('/api/batch/batch-delete-all', batchesDeleteAllHandler);
app.get('/api/batch/batch-stats', dbBatchStatsHandler);
app.get('/api/db/db-check', dbCheckhandler);
app.post('/api/db/db-log', dbLogHandler);
app.get('/api/db/db-log', dbLogHandler);
app.get('/api/db/db-chat-logs', dbChatLogsHandler);
app.post('/api/db/db-delete-expert-eval', dbDeleteExpertEvalHandler);
app.post('/api/db/db-auth-signup', signupHandler);
app.post('/api/db/db-auth-login', loginHandler);
app.post('/api/db/db-auth-logout', logoutHandler);
app.post('/api/user/user-auth-logout', userLogoutHandler);
app.all('/api/db/db-users', dbUsersHandler);
app.delete('/api/chat/chat-delete', deleteChatHandler);
app.post('/api/db/db-generate-embeddings', generateEmbeddingsHandler);
app.post('/api/db/db-generate-evals', generateEvalsHandler);
app.all('/api/db/db-database-management', dbDatabaseManagementHandler);
app.delete('/api/db/db-delete-system-logs', dbDeleteSystemLogsHandler);
app.all('/api/setting/setting-handler', settingHandler);
app.get('/api/setting/setting-public-handler', settingPublicHandler);
app.get('/api/db/db-expert-feedback-count', dbExpertFeedbackCountHandler);
app.get('/api/db/db-eval-non-empty-count', dbEvalNonEmptyCountHandler);
app.get('/api/db/db-table-counts', dbTableCountsHandler);
app.post('/api/db/db-repair-timestamps', dbRepairTimestampsHandler);
app.post('/api/db/db-repair-expert-feedback', dbRepairExpertFeedbackHandler);
app.post('/api/db/db-migrate-public-feedback', dbMigratePublicFeedbackHandler);
app.post("/api/openai/openai-message", openAIHandler);
app.post("/api/openai/openai-context", openAIContextAgentHandler);
app.post('/api/anthropic/anthropic-message', anthropicAgentHandler);
app.post('/api/anthropic/anthropic-context', anthropicContextAgentHandler);
app.post("/api/azure/azure-message", azureHandler);  // Updated Azure endpoint
app.post("/api/azure/azure-context", azureContextHandler);
app.post('/api/search/search-context', contextSearchHandler);
app.post('/api/chat/chat-similar-answer', chatSimilarAnswerHandler);
app.post('/api/chat/chat-pii-check', chatPIICheckHandler);
app.post('/api/chat/chat-detect-language', chatDetectLanguageHandler);
app.post('/api/chat/chat-translate', chatTranslateHandler);


const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await dbConnect();
    console.log("Database connected");

    // Initialize VectorService using the factory method (do not await, run async)
    initVectorService()
      .then(() => {
        console.log("Vector service initialized (async)");
        if (VectorService && typeof VectorService.getStats === 'function') {
          console.log('Vector Service Stats:', VectorService.getStats());
        }
      })
      .catch((vectorError) => {
        console.error("Vector service initialization failed:", vectorError);
        // Optionally, set VectorService to null or a stub
      });
    const memoryUsage = process.memoryUsage();
    console.log(`Total application memory usage (RSS): ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
    // Skip the self health check in Lambda environment to avoid startup delays
    if (!process.env.AWS_LAMBDA_RUNTIME_API) {
      fetch(`http://localhost:${PORT}/health`)
        .then((response) => response.json())
        .then((data) => console.log("Health check:", data))
        .catch((error) => console.error("Error:", error));
    }
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();

