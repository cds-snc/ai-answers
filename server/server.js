import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';

import dbDeleteExpertEvalHandler from '../api/db/db-delete-expert-eval.js';
import checkUrlHandler from '../api/util/util-check-url.js';
import similarChatsHandler from '../api/vector/vector-similar-chats.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

import dbChatLogsHandler from '../api/db/db-chat-logs.js';

import dbBatchListHandler from '../api/batch/batch-list.js';
import dbBatchRetrieveHandler from '../api/batch/batch-retrieve.js';
import dbBatchPersistHandler from '../api/batch/batch-persist.js';
import dbBatchItemsUpsertHandler from '../api/batch/batch-items-upsert.js';
import dbBatchDeleteHandler from '../api/batch/batch-delete.js';
import batchesDeleteAllHandler from '../api/batch/batches-delete-all.js';
import experimentalBatchCreateHandler from '../api/experimental/experimental-batch-create.js';
import experimentalBatchListHandler from '../api/experimental/experimental-batch-list.js';
import experimentalBatchProcessHandler from '../api/experimental/experimental-batch-process.js';
import experimentalBatchStatusHandler from '../api/experimental/experimental-batch-status.js';
import experimentalBatchExportHandler from '../api/experimental/experimental-batch-export.js';
import experimentalBatchDeleteHandler from '../api/experimental/experimental-batch-delete.js';
import experimentalAnalyzersListHandler from '../api/experimental/experimental-analyzers-list.js';
import experimentalBatchCancelHandler from '../api/experimental/experimental-batch-cancel.js';
import experimentalBatchProgressHandler from '../api/experimental/experimental-batch-progress.js';
import experimentalDatasetUploadHandler from '../api/experimental/experimental-dataset-upload.js';
import experimentalDatasetListHandler from '../api/experimental/experimental-dataset-list.js';
import experimentalDatasetDeleteHandler from '../api/experimental/experimental-dataset-delete.js';
import experimentalDatasetRowsHandler from '../api/experimental/experimental-dataset-rows.js';

import chatGraphRunHandler from '../api/chat/chat-graph-run.js';
import chatSessionMetricsHandler from '../api/chat/chat-session-metrics.js';
import chatReportHandler from '../api/chat/chat-report.js';
import chatSessionAvailabilityHandler from '../api/chat/chat-session-availability.js';
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
import meHandler from '../api/auth/auth-me.js';
import dbConnect from '../api/db/db-connect.js';
import dbUsersHandler from '../api/user/user-users.js';
import userStatsHandler from '../api/user/user-stats.js';
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
import usageMetricsHandler from '../api/metrics/metrics-usage.js';
import sessionMetricsHandler from '../api/metrics/metrics-sessions.js';
import expertMetricsHandler from '../api/metrics/metrics-expert-feedback.js';
import aiEvalMetricsHandler from '../api/metrics/metrics-ai-eval.js';
import publicFeedbackMetricsHandler from '../api/metrics/metrics-public-feedback.js';
import departmentMetricsHandler from '../api/metrics/metrics-departments.js';
import dbTableCountsHandler from '../api/db/db-table-counts.js';
import dbRepairTimestampsHandler from '../api/db/db-repair-timestamps.js';
import dbRepairExpertFeedbackHandler from '../api/db/db-repair-expert-feedback.js';
import dbMigratePublicFeedbackHandler from '../api/db/db-migrate-public-feedback.js';
import chatDashboardHandler from '../api/chat/chat-dashboard.js';
import chatExportLogsHandler from '../api/chat/chat-export-logs.js';
import { SettingsService } from '../services/SettingsService.js';
import { VectorService, initVectorService } from '../services/VectorServiceFactory.js';
import vectorReinitializeHandler from '../api/vector/vector-reinitialize.js';
import { rateLimiterMiddleware, initializeRateLimiter } from '../middleware/rate-limiter.js';
import vectorStatsHandler from '../api/vector/vector-stats.js';
import dbBatchStatsHandler from '../api/batch/batch-stats.js';
import dbCheckhandler from '../api/db/db-check.js';
import scenarioOverrideHandler from '../api/scenario/scenario-overrides.js';
import connectivityHandler from '../api/util/util-connectivity.js';
import createSessionMiddleware from '../middleware/express-session.js';
import botIsBot from '../middleware/bot-isbot.js';
import botDetector from '../middleware/bot-detector.js';
import botFingerprintPresence from '../middleware/bot-fingerprint-presence.js';
import passport from '../config/passport.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));


app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../build"), { index: false }));

// Ensure `/api` never caches anything
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Short-circuit health checks to avoid bot detection blocking them.
// This returns a fast 200 response for `GET /health` before session
// and bot-detection middleware are executed.
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path === '/health') {
    res.status(200).json({ status: 'Healthy' });
    return;
  }
  next();
});

app.use(createSessionMiddleware(app));
// Initialize Passport for authentication
app.use(passport.initialize());
app.use(passport.session());

// Unified chat availability endpoint
app.get('/api/chat/chat-session-availability', chatSessionAvailabilityHandler);

// Ensure a visitor fingerprint (hashed) is present in the session for all requests
app.use('/api', botFingerprintPresence);
// Block requests with known bot User-Agent strings
app.use('/api', botIsBot);
// Additional detection using `bot-detector` (runs after isbot)
app.use('/api', botDetector);

// Rate limiter middleware (waits for async init internally)
app.use('/api', rateLimiterMiddleware);


app.use((req, res, next) => {
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
});

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} request to ${req.url}`);
  next();
});
app.get("/config.js", (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.RUNTIME_CONFIG={ADOBE_ANALYTICS_URL:${JSON.stringify(process.env.REACT_APP_ADOBE_ANALYTICS_URL || '')}};`);
});

app.get(/.*/, (req, res, next) => {
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
app.get('/api/chat/chat-session-metrics', chatSessionMetricsHandler);
app.post('/api/chat/chat-report', chatReportHandler);
app.get('/api/batch/batch-list', dbBatchListHandler);
app.get('/api/batch/batch-retrieve', dbBatchRetrieveHandler);
app.post('/api/batch/batch-persist', dbBatchPersistHandler);
app.post('/api/batch/batch-items-upsert', dbBatchItemsUpsertHandler);
app.delete('/api/batch/batch-delete', dbBatchDeleteHandler);
app.delete('/api/batch/batch-delete-all', batchesDeleteAllHandler);
app.get('/api/batch/batch-stats', dbBatchStatsHandler);

// Experimental Batch Endpoints
app.post('/api/experimental/experimental-batch-create', experimentalBatchCreateHandler);
app.get('/api/experimental/experimental-batch-list', experimentalBatchListHandler);
app.post('/api/experimental/experimental-batch-process/:id', experimentalBatchProcessHandler);
app.get('/api/experimental/experimental-batch-status/:id', experimentalBatchStatusHandler);
app.get('/api/experimental/experimental-batch-export/:id', experimentalBatchExportHandler);
app.delete('/api/experimental/experimental-batch-delete/:id', experimentalBatchDeleteHandler);
app.get('/api/experimental/experimental-analyzers', experimentalAnalyzersListHandler);
app.post('/api/experimental/experimental-batch-cancel/:id', experimentalBatchCancelHandler);
app.get('/api/experimental/experimental-batch-progress/:id', experimentalBatchProgressHandler);
app.post('/api/experimental/experimental-dataset-upload', experimentalDatasetUploadHandler);
app.get('/api/experimental/experimental-dataset-list', experimentalDatasetListHandler);
app.get('/api/experimental/experimental-dataset-rows', experimentalDatasetRowsHandler);
app.delete('/api/experimental/experimental-dataset-delete/:id', experimentalDatasetDeleteHandler);
app.get('/api/db/db-check', dbCheckhandler);
app.post('/api/db/db-log', dbLogHandler);
app.get('/api/db/db-log', dbLogHandler);
app.get('/api/db/db-chat-logs', dbChatLogsHandler);
app.post('/api/db/db-delete-expert-eval', dbDeleteExpertEvalHandler);
app.post('/api/auth/auth-signup', signupHandler);
app.post('/api/auth/auth-login', loginHandler);
app.post('/api/auth/auth-logout', logoutHandler);
app.get('/api/auth/auth-me', meHandler);
app.post('/api/auth/auth-verify-2fa', verify2FAHandler);
app.post('/api/auth/auth-send-2fa', userSend2FAHandler);
app.post('/api/auth/auth-send-reset', sendResetHandler);
app.post('/api/auth/auth-reset-password', resetPasswordHandler);
app.all('/api/user/user-users', dbUsersHandler);
app.get('/api/user/user-stats', userStatsHandler);
app.delete('/api/chat/chat-delete', deleteChatHandler);
app.get('/api/chat/chat-dashboard', chatDashboardHandler);
app.get('/api/chat/chat-export-logs', chatExportLogsHandler);
app.post('/api/db/db-generate-embeddings', generateEmbeddingsHandler);
app.post('/api/db/db-generate-evals', generateEvalsHandler);
app.all('/api/db/db-database-management', dbDatabaseManagementHandler);
app.delete('/api/db/db-delete-system-logs', dbDeleteSystemLogsHandler);
app.all('/api/db/db-integrity-checks', dbIntegrityChecksHandler);
app.all('/api/setting/setting-handler', settingHandler);
app.get('/api/setting/setting-public-handler', settingPublicHandler);
app.get('/api/db/db-expert-feedback-count', dbExpertFeedbackCountHandler);
app.get('/api/db/db-eval-metrics', dbEvalMetricsHandler);
app.get('/api/metrics/metrics-usage', usageMetricsHandler);
app.get('/api/metrics/metrics-sessions', sessionMetricsHandler);
app.get('/api/metrics/metrics-expert-feedback', expertMetricsHandler);
app.get('/api/metrics/metrics-ai-eval', aiEvalMetricsHandler);
app.get('/api/metrics/metrics-public-feedback', publicFeedbackMetricsHandler);
app.get('/api/metrics/metrics-departments', departmentMetricsHandler);
app.get('/api/db/db-eval-non-empty-count', dbEvalNonEmptyCountHandler);
app.get('/api/db/db-table-counts', dbTableCountsHandler);
app.post('/api/db/db-repair-timestamps', dbRepairTimestampsHandler);
app.post('/api/db/db-repair-expert-feedback', dbRepairExpertFeedbackHandler);
app.post('/api/db/db-migrate-public-feedback', dbMigratePublicFeedbackHandler);

app.post('/api/chat/chat-graph-run', chatGraphRunHandler);
app.all('/api/scenario/scenario-overrides', scenarioOverrideHandler);
app.get('/api/util/util-connectivity', connectivityHandler);


const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await dbConnect();
    console.log("Database service started...");

    await SettingsService.loadAll();
    console.log("Settings service started...");

    // Initialize rate limiter middleware (depends on settings).
    // The middleware registered above will wait for this promise to resolve.
    try {
      await initializeRateLimiter();
      console.log('Rate limiter middleware initialized');
    } catch (rlErr) {
      console.error('Failed to initialize rate limiter middleware:', rlErr);
    }

    initVectorService()
      .then(() => {
        console.log("Vector service started...");
        if (VectorService && typeof VectorService.getStats === 'function') {
          console.log('Vector Service Stats:', VectorService.getStats());
        }
      })
      .catch((vectorError) => {
        console.error("Vector service initialization failed:", vectorError);
      });
    const memoryUsage = process.memoryUsage();
    console.log(`Total application memory usage (RSS): ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
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



