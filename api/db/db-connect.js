import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../../models/interaction.js";
import "../../models/question.js";
import "../../models/answer.js";
import "../../models/citation.js";
import "../../models/expertFeedback.js";
import "../../models/publicFeedback.js";
import "../../models/context.js";
import "../../models/chat.js";
import "../../models/batch.js";
import "../../models/scenarioOverride.js";
import "../../models/tool.js";
import "../../models/eval.js";
import "../../models/user.js";
import "../../models/logs.js";
import "../../models/embedding.js";
import "../../models/setting.js";
import "../../models/batchItem.js";
import "../../models/sentenceEmbedding.js";

// api/db/db-connect.js

// Cache the connection and promise at the module level. This is safe for
// worker threads, as each thread gets its own module instance.
let cached = { conn: null, promise: null };

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../../");

function resolveDocumentDbCaFile() {
  const configuredCaFile = process.env.DOCDB_CA_FILE || process.env.DOCDB_TLS_CA_FILE;
  if (configuredCaFile) {
    return configuredCaFile;
  }

  const candidatePaths = [
    path.resolve(repoRoot, "global-bundle.pem"),
    "/app/global-bundle.pem",
  ];

  return candidatePaths.find((candidatePath) => fs.existsSync(candidatePath));
}

function shouldAllowInvalidDocumentDbHostnames(connectionString) {
  if (process.env.DOCDB_TLS_ALLOW_INVALID_HOSTNAMES === "true") {
    return true;
  }

  try {
    const { hostname } = new URL(connectionString);
    return ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

function shouldUseDirectConnectionForDocumentDb(connectionString) {
  if (process.env.DOCDB_DIRECT_CONNECTION === "true") {
    return true;
  }

  try {
    const { hostname } = new URL(connectionString);
    return ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

function getDocumentDbUri() {
  return process.env.DOCDB_URI;
}

function getConnectionConfig() {
  if (process.env.MONGODB_URI) {
    return {
      connectionString: process.env.MONGODB_URI,
      targetKey: `mongo:${process.env.MONGODB_URI}`,
      opts: {
        bufferCommands: false,
        connectTimeoutMS: 60000, // 60 seconds timeout
        socketTimeoutMS: 300000, // 5 minutes timeout for operations
        serverSelectionTimeoutMS: 60000, // 60 seconds timeout for server selection
        heartbeatFrequencyMS: 10000, // How often to check the connection
        maxPoolSize: 100, // Maximum number of connections
        minPoolSize: 1, // Minimum number of connections
        directConnection: true,
      },
    };
  }

  const connectionString = getDocumentDbUri();
  const tlsCAFile = resolveDocumentDbCaFile();
  const tlsAllowInvalidHostnames = shouldAllowInvalidDocumentDbHostnames(connectionString);
  const directConnection = shouldUseDirectConnectionForDocumentDb(connectionString);

  return {
    connectionString,
    targetKey: `docdb8:${connectionString}`,
    opts: {
      tls: true,
      ...(tlsCAFile ? { tlsCAFile } : {}),
      ...(tlsAllowInvalidHostnames ? { tlsAllowInvalidHostnames: true } : {}),
      ...(directConnection ? { directConnection: true } : {}),
      retryWrites: false,
      bufferCommands: false,
      connectTimeoutMS: 60000, // 60 seconds timeout
      socketTimeoutMS: 300000, // 5 minutes timeout for operations
      serverSelectionTimeoutMS: 60000, // 60 seconds timeout for server selection
      heartbeatFrequencyMS: 10000, // How often to check the connection
      minPoolSize: 10, // Keep 20 connections ready
      maxPoolSize: 1000, // Allow up to 1000 connections
    },
  };
}

async function dbConnect() {
  const { connectionString, opts, targetKey } = getConnectionConfig();

  if (cached.conn && cached.targetKey === targetKey) {
    return cached.conn;
  }

  if (!cached.promise) {
    if (process.env.MONGODB_URI) {
      console.log('Connecting to MongoDB via MONGODB_URI');
    } else {
      console.log('Connecting to DocumentDB via DOCDB_URI');
    }
    console.log("DB Connection Options:", opts);

    cached.promise = mongoose
      .connect(connectionString, opts)
      .then((mongoose) => {
        return mongoose;
      });
    cached.targetKey = targetKey;
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
export {
  getDocumentDbUri,
  resolveDocumentDbCaFile,
  shouldAllowInvalidDocumentDbHostnames,
  shouldUseDirectConnectionForDocumentDb,
};
