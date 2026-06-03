import mongoose from "mongoose";
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
let activeDocumentDbVersion = normalizeDocumentDbVersion(process.env.DOCDB_ACTIVE_VERSION);

function normalizeDocumentDbVersion(value) {
  return String(value || '5').trim() === '8' ? '8' : '5';
}

function getDocumentDbUri(version = activeDocumentDbVersion) {
  const normalizedVersion = normalizeDocumentDbVersion(version);
  if (normalizedVersion === '8') {
    return process.env.DOCDB_8_URI || process.env.DOCDB_URI;
  }
  return process.env.DOCDB_5_URI || process.env.DOCDB_URI;
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

  const version = activeDocumentDbVersion;
  const connectionString = getDocumentDbUri(version);

  return {
    connectionString,
    targetKey: `docdb${version}:${connectionString}`,
    opts: {
      tls: true,
      tlsCAFile: "/app/global-bundle.pem",
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

async function switchDocumentDbVersion(version) {
  const nextVersion = normalizeDocumentDbVersion(version);
  if (process.env.MONGODB_URI) {
    activeDocumentDbVersion = nextVersion;
    return;
  }

  const previousTarget = cached.targetKey;
  activeDocumentDbVersion = nextVersion;
  const nextTarget = getConnectionConfig().targetKey;

  if (previousTarget && previousTarget !== nextTarget) {
    cached = { conn: null, promise: null, targetKey: null };
    await mongoose.disconnect();
  }
}

function getActiveDocumentDbVersion() {
  return activeDocumentDbVersion;
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
      console.log(`Connecting to DocumentDB version ${activeDocumentDbVersion}`);
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
  getActiveDocumentDbVersion,
  getDocumentDbUri,
  normalizeDocumentDbVersion,
  switchDocumentDbVersion,
};
