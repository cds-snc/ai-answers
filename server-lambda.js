// server-lambda.js - Express app for Lambda
import express from "express";
import path, { dirname } from "path";
import fileUpload from "express-fileupload";
import { fileURLToPath } from "url";
import openAIHandler from "./api/openai/openai-message.js";
import azureHandler from "./api/azure/azure-message.js";
import azureContextHandler from "./api/azure/azure-context.js";
import anthropicAgentHandler from "./api/anthropic/anthropic-message.js";
import dbChatLogsHandler from "./api/db/db-chat-logs.js";
import contextSearchHandler from "./api/search/search-context.js";
import dbBatchListHandler from "./api/db/db-batch-list.js";
import dbBatchRetrieveHandler from "./api/db/db-batch-retrieve.js";
import anthropicContextAgentHandler from "./api/anthropic/anthropic-context.js";
import openAIContextAgentHandler from "./api/openai/openai-context.js";
import dbChatSessionHandler from "./api/db/db-chat-session.js";
import dbVerifyChatSessionHandler from "./api/db/db-verify-chat-session.js";
import dbCheckhandler from "./api/db/db-check.js";
import dbPersistInteraction from "./api/db/db-persist-interaction.js";
import dbPersistFeedback from "./api/db/db-persist-feedback.js";
import dbLogHandler from "./api/db/db-log.js";
import signupHandler from "./api/db/db-auth-signup.js";
import loginHandler from "./api/db/db-auth-login.js";
import dbUsersHandler from "./api/db/db-users.js";
import deleteChatHandler from "./api/db/db-delete-chat.js";
import dbSettingsHandler from "./api/db/db-settings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("Initializing Express app for Lambda...");
const app = express();
console.log("Express app created");
app.use(express.json({ limit: "10mb" }));
app.use(fileUpload());
app.use(express.static(path.join(__dirname, "build")));

// Set higher timeout limits for all routes
app.use((req, res, next) => {
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
});

// Logging middleware
app.use((req, res, next) => {
  console.log(
    `${new Date().toISOString()} - ${req.method} request to ${req.url}`
  );
  next();
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "Healthy" });
});

// API routes
app.post("/api/db/db-persist-feedback", dbPersistFeedback);
app.post("/api/db/db-persist-interaction", dbPersistInteraction);
app.get("/api/db/db-chat-session", dbChatSessionHandler);
app.get("/api/db/db-verify-chat-session", dbVerifyChatSessionHandler);
app.get("/api/db/db-batch-list", dbBatchListHandler);
app.get("/api/db/db-batch-retrieve", dbBatchRetrieveHandler);
app.get("/api/db/db-check", dbCheckhandler);
app.post("/api/db/db-log", dbLogHandler);
app.get("/api/db/db-log", dbLogHandler);
app.get("/api/db/db-chat-logs", dbChatLogsHandler);
app.post("/api/db/db-auth-signup", signupHandler);
app.post("/api/db/db-auth-login", loginHandler);
app.all("/api/db/db-users", dbUsersHandler);
app.delete("/api/db/db-delete-chat", deleteChatHandler);
app.all("/api/db/db-settings", dbSettingsHandler);

app.post("/api/openai/openai-message", openAIHandler);
app.post("/api/openai/openai-context", openAIContextAgentHandler);
app.post("/api/anthropic/anthropic-message", anthropicAgentHandler);
app.post("/api/anthropic/anthropic-context", anthropicContextAgentHandler);
app.post("/api/azure/azure-message", azureHandler);
app.post("/api/azure/azure-context", azureContextHandler);
app.post("/api/search/search-context", contextSearchHandler);

// Serve React app for all other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

export default app;
