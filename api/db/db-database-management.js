import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dbConnect from './db-connect.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import mongoose from 'mongoose';
import fs from 'fs';
import crypto from 'crypto'; // Import crypto for generating UUIDs

async function databaseManagementHandler(req, res) {
  if (!['GET', 'POST', 'DELETE', 'PUT', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', ['GET', 'POST', 'DELETE', 'PUT', 'PATCH']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const connection = await dbConnect();

    // Get all registered models from Mongoose
    const collections = Object.keys(mongoose.models).reduce((acc, modelName) => {
      acc[modelName.toLowerCase()] = mongoose.models[modelName];
      return acc;
    }, {});

    if (req.method === 'GET') {
      // Efficient chunked export using lastId (id-based pagination)
      // Treat collection=All as no collection filter (return list of collections)
      const { collection, limit = 1000, startDate, endDate, lastId } = req.query;
      console.log(`Exporting collection: ${collection}, limit: ${limit}, startDate: ${startDate}, endDate: ${endDate}, lastId: ${lastId}`);
      const dateField = 'updatedAt';
      if (!collection || collection === 'All') {
        // Return list of available collections
        return res.status(200).json({
          collections: Object.keys(collections)
        });
      }
      const model = collections[collection.toLowerCase()];
      if (!model) {
        return res.status(400).json({ message: `Collection '${collection}' not found` });
      }
      // Build date filter if provided
      let queryFilter = {};
      // Only apply date filter if the model schema has updatedAt
      const hasUpdatedAt = model.schema && model.schema.paths && model.schema.paths.updatedAt;
      if ((startDate || endDate) && hasUpdatedAt) {
        queryFilter[dateField] = {};
        if (startDate) queryFilter[dateField].$gte = new Date(startDate);
        if (endDate) queryFilter[dateField].$lte = new Date(endDate);
      }
      // Efficient id-based pagination
      if (lastId) {
        queryFilter._id = { $gt: lastId };
      }
      // Paginated export for a single collection with optional date filter
      const docs = await model.find(queryFilter)
        .sort({ _id: 1 }) // Ensure consistent ordering between chunks
        .limit(Number(limit))
        .lean();
      const total = await model.countDocuments(queryFilter);
      console.log(`Exported ${docs.length} documents from collection '${collection}'`);
      return res.status(200).json({
        collection,
        total,
        limit: Number(limit),
        lastId: docs.length ? docs[docs.length - 1]._id : null,
        data: docs
      });
    } else if (req.method === 'POST') {
      // Support chunked upload via req.body.chunkPayload
      const { chunkIndex, totalChunks, fileName, chunkPayload, collection: requestedCollection } = req.body;
      if (!chunkPayload || typeof chunkPayload !== 'string' || chunkIndex === undefined || totalChunks === undefined || !fileName) {
        return res.status(400).json({ message: 'Chunked upload required. Missing chunkPayload, chunkIndex, totalChunks, or fileName.' });
      }
      try {
        // Assume chunkPayload is a UTF-8 string containing only complete lines (JSONL)
        const chunkText = chunkPayload;
        const lines = chunkText.split(/\r?\n/).filter(line => line.trim().startsWith('{'));

        // Initialize stats for this chunk
        // support skipped count when client asks to import only a subset of collections
        let stats = { inserted: 0, failed: 0, skipped: 0 };

        // Build a collection filter based on requestedCollection: All (default) | AllButLogs | specific collection or array of collections
        let collectionFilter = () => true;
        if (requestedCollection && requestedCollection !== 'All') {
          if (requestedCollection === 'AllButLogs') {
            collectionFilter = (name) => {
              const n = String(name || '').toLowerCase();
              return !(n.endsWith('log') || n.endsWith('logs'));
            };
          } else if (Array.isArray(requestedCollection)) {
            const set = new Set(requestedCollection.map(s => String(s).toLowerCase()));
            collectionFilter = (name) => set.has(String(name || '').toLowerCase());
          } else {
            const rc = String(requestedCollection).toLowerCase();
            collectionFilter = (name) => String(name || '').toLowerCase() === rc;
          }
        }

        // Initialize skipped examples container (up to 10)
        if (!stats.skippedExamples) stats.skippedExamples = [];
        // Process all complete lines in this chunk, applying the optional collectionFilter
        await processLines(lines, collections, stats, collectionFilter);

        // If this is the last chunk, the client should have sent any remaining incomplete line as a complete line
        const responsePayload = {
          message: `Chunk ${parseInt(chunkIndex) + 1} of ${totalChunks} uploaded and processed`,
          stats
        };

        if (parseInt(chunkIndex) + 1 === parseInt(totalChunks)) {
          responsePayload.message = 'Database import completed.';
        }
        return res.status(200).json(responsePayload);
      } catch (err) {
        console.error('Error processing chunk:', err);
        return res.status(500).json({ message: 'Error processing upload chunk', error: err.message });
      }
    } else if (req.method === 'DELETE') {
      // Drop all indexes
      const results = {
        success: [],
        failed: []
      };

      await Promise.all(Object.values(collections).map(async model => {
        try {
          await model.collection.dropIndexes();
          results.success.push(model.modelName);
          console.log(`Dropped indexes for ${model.modelName}`);
        } catch (error) {
          results.failed.push({
            collection: model.modelName,
            error: error.message
          });
          console.warn(`Error dropping indexes for ${model.modelName}:`, error.message);
        }
      }));

      return res.status(200).json({
        message: 'Database indexes dropped successfully',
        results
      });
    } else if (req.method === 'PUT') {
      // Create/Rebuild indexes
      const results = {
        success: [],
        failed: []
      };

      await Promise.all(Object.values(collections).map(async model => {
        try {
          await model.createIndexes();
          results.success.push(model.modelName);
          console.log(`Created indexes for ${model.modelName}`);
        } catch (error) {
          results.failed.push({
            collection: model.modelName,
            error: error.message
          });
          console.warn(`Error creating indexes for ${model.modelName}:`, error.message);
        }
      }));

      return res.status(200).json({
        message: 'Database indexes created successfully',
        results
      });
    } else if (req.method === 'PATCH') {
      // Check index status for all collections
      const indexStatus = [];

      for (const model of Object.values(collections)) {
        try {
          const indexes = await model.collection.indexes();
          // Get expected indexes from schema
          const schemaIndexes = model.schema.indexes() || [];
          const expectedCount = schemaIndexes.length + 1; // +1 for _id index

          indexStatus.push({
            collection: model.modelName,
            currentIndexCount: indexes.length,
            expectedIndexCount: expectedCount,
            indexes: indexes.map(idx => ({
              name: idx.name,
              keys: Object.keys(idx.key || {})
            })),
            status: indexes.length >= expectedCount ? 'complete' : 'incomplete'
          });
        } catch (error) {
          indexStatus.push({
            collection: model.modelName,
            error: error.message,
            status: 'error'
          });
        }
      }

      const allComplete = indexStatus.every(s => s.status === 'complete');
      return res.status(200).json({
        message: allComplete ? 'All indexes are complete' : 'Some indexes may be incomplete',
        allComplete,
        collections: indexStatus
      });
    }
  } catch (error) {
    console.error('Database management error:', error);
    return res.status(500).json({
      message: 'Database operation failed',
      error: error.message
    });
  }
}

async function processLines(lines, collections, stats, collectionFilter = () => true) {
  // Group operations by collection for bulk processing
  const operationsByCollection = {};

  // Prepare bulk operations
  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const { collection, doc } = JSON.parse(line);
      if (!collection) {
        stats.failed++;
        continue;
      }
      const collectionName = String(collection).toLowerCase();

      // If client requested a subset of collections, skip others
      if (!collectionFilter(collectionName)) {
        stats.skipped++;
        try {
          if (stats.skippedExamples && stats.skippedExamples.length < 10) {
            stats.skippedExamples.push(line.trim());
          }
        } catch (e) {
          // ignore push errors
        }
        continue;
      }

      if (!collections[collectionName]) {
        stats.failed++;
        continue;
      }

      // Ensure createdAt and updatedAt are Date objects if they exist as strings
      if (doc.createdAt && typeof doc.createdAt === 'string') {
        doc.createdAt = new Date(doc.createdAt);
      }
      if (doc.updatedAt && typeof doc.updatedAt === 'string') {
        doc.updatedAt = new Date(doc.updatedAt);
      }

      // Initialize operations array for this collection if needed
      if (!operationsByCollection[collectionName]) {
        operationsByCollection[collectionName] = [];
      }

      // Collections with unique fields should use those fields as the filter
      // to prevent duplicate imports when _id differs but unique field matches
      const uniqueKeyMap = {
        user: 'email',
        setting: 'key',
        sessionstate: 'sessionId'
      };

      const uniqueField = uniqueKeyMap[collectionName];
      let filter;
      if (uniqueField && doc[uniqueField]) {
        filter = { [uniqueField]: doc[uniqueField] };
      } else {
        filter = { _id: doc._id };
      }

      // Use $set to preserve timestamps for all collections
      operationsByCollection[collectionName].push({
        updateOne: {
          filter,
          update: { $set: doc }, // doc now has Date objects for timestamps if they were strings
          upsert: true
        }
      });

    } catch (err) {
      stats.failed++;
      console.error('Import parsing error:', err.message);
    }
  }

  // Execute bulk operations for each collection
  const BATCH_SIZE = 500; // Optimal batch size for MongoDB

  for (const [collectionName, operations] of Object.entries(operationsByCollection)) {
    const model = collections[collectionName];

    try {
      // Process in optimized batches
      for (let i = 0; i < operations.length; i += BATCH_SIZE) {
        const batch = operations.slice(i, i + BATCH_SIZE);
        // Disable timestamps so createdAt/updatedAt are preserved for all collections
        const bulkOptions = { ordered: false, timestamps: false };
        const result = await model.bulkWrite(batch, bulkOptions);

        // Update stats with batch results
        stats.inserted += (result.upsertedCount + result.modifiedCount);
      }
    } catch (err) {
      stats.failed += operations.length;
      console.error(`Bulk import error for ${collectionName}:`, err.message);
    }
  }
}

export default function handler(req, res) {
  return withProtection(databaseManagementHandler, authMiddleware, adminMiddleware)(req, res);
}