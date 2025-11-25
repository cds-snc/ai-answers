import bodyParser from 'body-parser';
import dbDeleteExpertEvalHandler from '../api/db/db-delete-expert-eval.js';
import checkUrlHandler from '../api/util/util-check-url.js';
import similarChatsHandler from '../api/vector/vector-similar-chats.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import chatMessageHandler from '../api/chat/chat-message.js';
import chatContextHandler from '../api/chat/chat-context.js';
import dbChatLogsHandler from '../api/db/db-chat-logs.js';
import contextSearchHandler from '../api/search/search-context.js';
import dbBatchListHandler from '../api/batch/batch-list.js';
import dbBatchRetrieveHandler from '../api/batch/batch-retrieve.js';
import dbBatchPersistHandler from '../api/batch/batch-persist.js';
import dbBatchItemsUpsertHandler from '../api/batch/batch-items-upsert.js';
import dbBatchDeleteHandler from '../api/batch/batch-delete.js';
import batchesDeleteAllHandler from '../api/batch/batches-delete-all.js';

import chatSessionHandler from '../api/chat/chat-session.js';
import chatSimilarAnswerHandler from '../api/chat/chat-similar-answer.js';
import chatPIICheckHandler from '../api/chat/chat-pii-check.js';
import chatDetectLanguageHandler from '../api/chat/chat-detect-language.js';
import chatTranslateHandler from '../api/chat/chat-translate.js';
import chatGraphRunHandler from '../api/chat/chat-graph-run.js';
import chatSessionMetricsHandler from '../api/chat/chat-session-metrics.js';
import chatReportHandler from '../api/chat/chat-report.js';
import sessionAvailabilityHandler from '../api/chat/chat-session-availability.js';
import dbVerifyChatSessionHandler from '../api/db/db-verify-chat-session.js';
import dbCheckhandler from '../api/db/db-check.js';
import dbPersistInteraction from '../api/db/db-persist-interaction.js';
import feedbackPersistExpertHandler from '../api/feedback/feedback-persist-expert.js';
import feedbackPersistPublicHandler from '../api/feedback/feedback-persist-public.js';
import feedbackGetExpertHandler from '../api/feedback/feedback-get-expert.js';
import feedbackGetPublicHandler from '../api/feedback/feedback-get-public.js';
import feedbackDeleteExpertHandler from '../api/feedback/feedback-delete-expert.js';
import feedbackExpertNeverStaleHandler from '../api/feedback/feedback-expert-never-stale.js';
import dbLogHandler from '../api/db/db-log.js';
import signupHandler from '../api/auth/auth-signup.js';
import loginHandler from '../api/auth/auth-login.js';
import logoutHandler from '../api/auth/auth-logout.js';
import verify2FAHandler from '../api/auth/auth-verify-2fa.js';
import userSend2FAHandler from '../api/auth/auth-send-2fa.js';
import sendResetHandler from '../api/auth/auth-send-reset.js';
import resetPasswordHandler from '../api/auth/auth-reset-password.js';
import dbConnect from '../api/db/db-connect.js';
import dbUsersHandler from '../api/db/db-users.js';
import deleteChatHandler from '../api/chat/chat-delete.js';
import generateEmbeddingsHandler from '../api/db/db-generate-embeddings.js';
import generateEvalsHandler from '../api/db/db-generate-evals.js';
import dbDatabaseManagementHandler from '../api/db/db-database-management.js';
import dbDeleteSystemLogsHandler from '../api/db/db-delete-system-logs.js';
import dbIntegrityChecksHandler from '../api/db/db-integrity-checks.js';
import settingHandler from '../api/setting/setting-handler.js';
import settingPublicHandler from '../api/setting/setting-public-handler.js';
import dbPublicEvalListHandler from '../api/db/db-public-eval-list.js';
import evalGetHandler from '../api/eval/eval-get.js';
import evalDeleteHandler from '../api/eval/eval-delete.js';
import evalRunHandler from '../api/eval/eval-run.js';
import evalDashboardHandler from '../api/eval/eval-dashboard.js';
import dbChatHandler from '../api/db/db-chat.js';
import dbExpertFeedbackCountHandler from '../api/db/db-expert-feedback-count.js';
import dbEvalNonEmptyCountHandler from '../api/db/db-eval-non-empty-count.js';
import dbEvalMetricsHandler from '../api/db/db-eval-metrics.js';
import dbTableCountsHandler from '../api/db/db-table-counts.js';
import dbRepairTimestampsHandler from '../api/db/db-repair-timestamps.js';
import dbRepairExpertFeedbackHandler from '../api/db/db-repair-expert-feedback.js';
import dbMigratePublicFeedbackHandler from '../api/db/db-migrate-public-feedback.js';
import chatDashboardHandler from '../api/chat/chat-dashboard.js';
import { VectorService, initVectorService } from '../services/VectorServiceFactory.js';
import vectorReinitializeHandler from '../api/vector/vector-reinitialize.js';
import vectorStatsHandler from '../api/vector/vector-stats.js';
import dbBatchStatsHandler from '../api/batch/batch-stats.js';
import scenarioOverrideHandler from '../api/scenario/scenario-overrides.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
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

// Serve runtime config for frontend
app.get("/config.js", (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.RUNTIME_CONFIG={ADOBE_ANALYTICS_URL:${JSON.stringify(process.env.REACT_APP_ADOBE_ANALYTICS_URL || '')}};`);
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
app.post('/api/eval/eval-get', evalGetHandler);
app.post('/api/eval/eval-delete', evalDeleteHandler);
app.post('/api/eval/eval-run', evalRunHandler);
app.get('/api/eval/eval-dashboard', evalDashboardHandler);
app.get('/api/db/db-chat', dbChatHandler);
app.post('/api/feedback/feedback-persist-expert', feedbackPersistExpertHandler);
app.post('/api/feedback/feedback-persist-public', feedbackPersistPublicHandler);
app.post('/api/feedback/feedback-get-expert', feedbackGetExpertHandler);
app.post('/api/feedback/feedback-get-public', feedbackGetPublicHandler);
app.post('/api/feedback/feedback-delete-expert', feedbackDeleteExpertHandler);
app.post('/api/feedback/feedback-expert-never-stale', feedbackExpertNeverStaleHandler);
app.post('/api/db/db-persist-interaction', dbPersistInteraction);
app.get('/api/chat/chat-session', chatSessionHandler);
app.get('/api/chat/chat-session-metrics', chatSessionMetricsHandler);
app.get('/api/chat/chat-session-availability', sessionAvailabilityHandler);
app.post('/api/chat/chat-report', chatReportHandler);
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
app.post('/api/auth/signup', signupHandler);
app.post('/api/auth/login', loginHandler);
app.post('/api/auth/logout', logoutHandler);
// Normalize user-facing logout under /api/auth for consistency. Reuse the
// existing `logoutHandler` (from `auth-logout.js`) instead of a missing
// `api/user/user-auth-logout.js` module.
app.post('/api/auth/user-auth-logout', logoutHandler);
// Public user routes for 2FA (send and verify)
// Public user 2FA verification endpoint (token issued after this)
app.post('/api/auth/verify-2fa', verify2FAHandler);
// Also expose the same handlers under /api/auth/auth-* for compatibility
app.post('/api/auth/auth-signup', signupHandler);
app.post('/api/auth/auth-login', loginHandler);
app.post('/api/auth/auth-logout', logoutHandler);
app.post('/api/auth/auth-verify-2fa', verify2FAHandler);
// Legacy /api/db/db-auth-* endpoints have been moved to the canonical /api/auth/*
// and are intentionally not re-registered here to avoid duplicate/ambiguous
// handlers. If a compatibility shim is needed in the future, add explicit
// aliases that forward to the /api/auth handlers.
// Also expose the existing user-send/user-verify handlers under /api/auth
// so client code expecting /api/auth/* variants will work.
// Expose canonical auth 2FA send endpoint. Clients should call the auth-prefixed
// endpoints (no fallbacks). Short and legacy compatibility endpoints were removed
// to avoid ambiguous routing.
app.post('/api/auth/auth-send-2fa', userSend2FAHandler);
// Keep canonical verify alias
app.post('/api/auth/auth-verify-2fa', verify2FAHandler);
// Password reset endpoints
app.post('/api/auth/auth-send-reset', sendResetHandler);
app.post('/api/auth/auth-reset-password', resetPasswordHandler);
// Keep the public users endpoints for compatibility if external callers want
// Compatibility endpoints (public) - also available under /api/auth-send and /api/auth-verify
// Removed legacy user/send endpoints. 2FA is now served via the /api/auth/* endpoints only.
app.all('/api/db/db-users', dbUsersHandler);
app.delete('/api/chat/chat-delete', deleteChatHandler);
app.get('/api/chat/chat-dashboard', chatDashboardHandler);
app.post('/api/db/db-generate-embeddings', generateEmbeddingsHandler);
app.post('/api/db/db-generate-evals', generateEvalsHandler);
app.all('/api/db/db-database-management', dbDatabaseManagementHandler);
app.delete('/api/db/db-delete-system-logs', dbDeleteSystemLogsHandler);
app.get('/api/db/db-integrity-checks', dbIntegrityChecksHandler);
app.all('/api/setting/setting-handler', settingHandler);
app.get('/api/setting/setting-public-handler', settingPublicHandler);
app.get('/api/db/db-expert-feedback-count', dbExpertFeedbackCountHandler);
app.get('/api/db/db-eval-metrics', dbEvalMetricsHandler);
app.get('/api/db/db-eval-non-empty-count', dbEvalNonEmptyCountHandler);
app.get('/api/db/db-table-counts', dbTableCountsHandler);
app.post('/api/db/db-repair-timestamps', dbRepairTimestampsHandler);
app.post('/api/db/db-repair-expert-feedback', dbRepairExpertFeedbackHandler);
app.post('/api/db/db-migrate-public-feedback', dbMigratePublicFeedbackHandler);
app.post('/api/chat/chat-message', chatMessageHandler);
app.post('/api/chat/chat-context', chatContextHandler);
app.post('/api/search/search-context', contextSearchHandler);
app.post('/api/chat/chat-similar-answer', chatSimilarAnswerHandler);
app.post('/api/chat/chat-pii-check', chatPIICheckHandler);
app.post('/api/chat/chat-detect-language', chatDetectLanguageHandler);
app.post('/api/chat/chat-translate', chatTranslateHandler);
app.post('/api/chat/chat-graph-run', chatGraphRunHandler);
app.all('/api/scenario/scenario-overrides', scenarioOverrideHandler);


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




