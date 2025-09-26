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
import "../../models/tool.js";
import "../../models/eval.js";
import "../../models/user.js";
import "../../models/logs.js";
import "../../models/embedding.js";
import "../../models/setting.js";

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const mongoDbOpts = {
      bufferCommands: false,
      connectTimeoutMS: 60000, // 60 seconds timeout
      socketTimeoutMS: 300000, // 5 minutes timeout for operations
      serverSelectionTimeoutMS: 60000, // 60 seconds timeout for server selection
      heartbeatFrequencyMS: 10000, // How often to check the connection
      maxPoolSize: 100, // Maximum number of connections
      minPoolSize: 1, // Minimum number of connections
      directConnection: true,
    };

    const docDbOpts = {
      tls: true,
      tlsCAFile: "/app/global-bundle.pem",
      retryWrites: false,
      bufferCommands: false,
      connectTimeoutMS: 60000, // 60 seconds timeout
      socketTimeoutMS: 300000, // 5 minutes timeout for operations
      serverSelectionTimeoutMS: 60000, // 60 seconds timeout for server selection
      heartbeatFrequencyMS: 10000, // How often to check the connection
      minPoolSize: 1, // Keep 20 connections ready
      maxPoolSize: 1000, // Allow up to 1000 connections
    };

    const connectionString = process.env.MONGODB_URI || process.env.DOCDB_URI;
    const opts = process.env.MONGODB_URI ? mongoDbOpts : docDbOpts;

    console.log("DB Connection Options:", opts);

    cached.promise = mongoose
      .connect(connectionString, opts)
      .then((mongoose) => {
        return mongoose;
      });
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
