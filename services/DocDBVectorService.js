// services/DocDBVectorService.js
// DocumentDB vector search service (Option B: separate sentence_embeddings collection)

import mongoose from 'mongoose';
import dbConnect from '../api/db/db-connect.js';
import ServerLoggingService from './ServerLoggingService.js';
import { Embedding } from '../models/embedding.js';
import cosineSimilarity from 'compute-cosine-similarity';
import EmbeddingService from './EmbeddingService.js';

function isFrenchLanguage(lang) {
  if (!lang) return false;
  const v = String(lang).trim().toLowerCase();
  return v === 'fr' || v === 'fra' || v === 'french';
}

function desiredPageLang(lang) {
  return isFrenchLanguage(lang) ? 'fr' : 'en';
}

function toCleanVector(vec) {
  if (!Array.isArray(vec)) throw new Error('Query vector must be an array');
  return vec.map((v, i) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : Number(v);
    if (!Number.isFinite(n)) throw new Error(`Invalid element at ${i}: ${v}`);
    return n;
  });
}

class DocDBVectorService {
  /**
   * @param {{filterQuery?: object, preCheck?: boolean}} opts
   */
  constructor({ filterQuery = {}, preCheck = false } = {}) {
    this.filterQuery = filterQuery;           // applied to QA selection only (post-search $match)
    this.preCheck = preCheck;                 // optional data audit before indexing
    this.isInitialized = false;
    this.initializingPromise = null;

    this.collection = null;                   // 'embeddings'
    this.sentenceCollection = null;           // 'sentence_embeddings'

    this.stats = {
      searches: 0,
      qaSearches: 0,
      sentenceSearches: 0,
      totalSearchTime: 0,
      lastInitTime: null,
      embeddings: 0,
      sentences: 0,
    };
  }

  async _ensureVectorIndex(collectionName, keySpec, options, indexName) {
    const db = mongoose.connection.db;
    const list = await db.command({ listIndexes: collectionName });
    const exists = list.cursor.firstBatch.some((i) => i.name === indexName);
    if (exists) return;
    await db.command({
      createIndexes: collectionName,
      indexes: [{ key: keySpec, name: indexName, vectorOptions: options }],
    });
  }

  async initialize() {
    if (this.isInitialized) return;
    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = (async () => {
      await dbConnect();
      this.collection = mongoose.connection.collection('embeddings');
      this.sentenceCollection = mongoose.connection.collection('sentence_embeddings');

      // Optional precheck (raw driver to avoid Mongoose casting issues)
      if (this.preCheck) {
        // Type checks: vectors must be arrays of doubles
        const badQAType = await this.collection.find({
          ...this.filterQuery,
          $or: [
            { questionsAnswerEmbedding: { $exists: false } },
            { questionsAnswerEmbedding: { $size: 0 } },
            { questionsAnswerEmbedding: { $elemMatch: { $not: { $type: 1 } } } }, // 1 = double
          ],
        }).project({ _id: 1 }).toArray();

        const badSentType = await this.sentenceCollection.find({
          $or: [
            { embedding: { $exists: false } },
            { embedding: { $size: 0 } },
            { embedding: { $elemMatch: { $not: { $type: 1 } } } },
          ],
        }).project({ _id: 1 }).toArray();

        if (badQAType.length || badSentType.length) {
          ServerLoggingService.error('Precheck (type) failed', 'vector-service', { badQAType: badQAType.length, badSentType: badSentType.length });
          throw new Error('Vector precheck failed: invalid numeric types detected');
        }
      }

      // Infer dims from samples
      const qaSample = await Embedding.findOne({
        questionsAnswerEmbedding: { $exists: true, $not: { $size: 0 } },
        ...this.filterQuery,
      }).lean();
      if (!qaSample) throw new Error('No QA embeddings found to infer dimension');
      const qaDim = qaSample.questionsAnswerEmbedding.length;

      const sentSample = await this.sentenceCollection.findOne(
        { embedding: { $exists: true, $ne: null } },
        { projection: { embedding: 1 } }
      );
      const sentenceDim = sentSample?.embedding?.length ?? qaDim;

      // Optional precheck: strict dimension consistency across all indexed docs
      if (this.preCheck) {
        const badQADim = await this.collection.find({
          ...this.filterQuery,
          questionsAnswerEmbedding: { $exists: true, $not: { $size: 0 } },
          $expr: { $ne: [{ $size: '$questionsAnswerEmbedding' }, qaDim] },
        }).project({ _id: 1 }).toArray();

        const badSentDim = await this.sentenceCollection.find({
          embedding: { $exists: true, $not: { $size: 0 } },
          $expr: { $ne: [{ $size: '$embedding' }, sentenceDim] },
        }).project({ _id: 1 }).toArray();

        if (badQADim.length || badSentDim.length) {
          ServerLoggingService.error('Precheck (dimension) failed', 'vector-service', { badQADim: badQADim.length, badSentDim: badSentDim.length, qaDim, sentenceDim });
          throw new Error(`Vector precheck failed: dimension mismatch QA=${badQADim.length}, Sentences=${badSentDim.length}`);
        }
      }

      // Ensure vector indexes (HNSW + cosine to match client-side cosine)
      const qaOptions = { type: 'hnsw', similarity: 'cosine', dimensions: qaDim, m: 16, efConstruction: 64 };
      const sentOptions = { type: 'hnsw', similarity: 'cosine', dimensions: sentenceDim, m: 16, efConstruction: 64 };
      try { await this._ensureVectorIndex('embeddings', { questionsAnswerEmbedding: 'vector' }, qaOptions, 'qa_vector_index'); } catch { }
      // Ensure a dedicated vector index for questions-only embeddings so
      // matchQuestions can search against questionsEmbedding separately.
      try { await this._ensureVectorIndex('embeddings', { questionsEmbedding: 'vector' }, qaOptions, 'questions_vector_index'); } catch { }
      try { await this._ensureVectorIndex('sentence_embeddings', { embedding: 'vector' }, sentOptions, 'sentence_vector_index'); } catch { }


      this.stats.lastInitTime = new Date();
      this.isInitialized = true;
      this.initializingPromise = null;
    })();

    return this.initializingPromise;
  }

  async _searchSentence(cleanVector, k, opts, start) {
    const { threshold = null, efSearch = 200, candidateMultiplier = 2 } = opts;
    const engineK = k * candidateMultiplier;
    ServerLoggingService.debug('Using sentence index', 'DocDBVectorService');
    const pipeline = [
      { $search: { vectorSearch: { vector: cleanVector, path: 'embedding', similarity: 'cosine', k: engineK, efSearch } } },
      { $limit: engineK },
      { $lookup: { from: 'embeddings', localField: 'parentEmbeddingId', foreignField: '_id', as: 'parent' } },
      { $unwind: '$parent' },
      { $lookup: { from: 'interactions', localField: 'parent.interactionId', foreignField: '_id', as: 'inter' } },
      { $unwind: { path: '$inter', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, parentEmbeddingId: 1, sentenceIndex: 1, interactionId: '$parent.interactionId', expertFeedbackId: '$inter.expertFeedback', embedding: 1 } },
    ];
    ServerLoggingService.debug('Sentence pipeline', 'DocDBVectorService', { pipeline });
    let docs;
    try {
      docs = await this.sentenceCollection.aggregate(pipeline).toArray();
      ServerLoggingService.debug('Sentence pipeline result', 'DocDBVectorService', { docsCount: docs.length });
    } catch (err) {
      ServerLoggingService.error('Error running sentence pipeline', 'DocDBVectorService', err);
      throw err;
    }
    const rescored = [];
    for (const r of docs) {
      let sim = 0;
      try {
        sim = cosineSimilarity(cleanVector, r.embedding) ?? 0;
      } catch (err) {
        ServerLoggingService.error('Error computing cosine similarity (sentence)', 'DocDBVectorService', err);
      }
      ServerLoggingService.debug(`Similarity for sentence _id=${r._id}: ${sim}`, 'DocDBVectorService');
      if (threshold === null || sim >= threshold) {
        rescored.push({
          id: r._id.toString(),
          interactionId: r.interactionId?.toString?.() || r.interactionId,
          sentenceIndex: r.sentenceIndex,
          expertFeedbackId: r.expertFeedbackId || null,
          similarity: sim,
        });
        if (rescored.length >= k) {
          break;
        }
      }
    }
    rescored.sort((a, b) => b.similarity - a.similarity);
    ServerLoggingService.debug('Sorted similarity list (sentence)', 'DocDBVectorService', { rescored });
    this.stats.sentenceSearches++;
    this.stats.searches++;
    this.stats.totalSearchTime += Date.now() - start;
    ServerLoggingService.debug('Sentence search finished', 'DocDBVectorService', { outLength: rescored.slice(0, k).length });
    return rescored.slice(0, k);
  }

  async _searchQA(cleanVector, k, opts, start) {
    const { threshold = null, efSearch = 200, candidateMultiplier = 2 } = opts;
    const engineK = k * candidateMultiplier;
    ServerLoggingService.debug('Using QA index', 'DocDBVectorService');
    const pipeline = [
      { $search: { vectorSearch: { vector: cleanVector, path: 'questionsAnswerEmbedding', similarity: 'cosine', k: engineK, efSearch } } },
      { $limit: engineK },
      ...(this.filterQuery && Object.keys(this.filterQuery).length ? [{ $match: this.filterQuery }] : []),
      { $lookup: { from: 'interactions', localField: 'interactionId', foreignField: '_id', as: 'inter' } },
      { $unwind: { path: '$inter', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, interactionId: 1, expertFeedbackId: '$inter.expertFeedback', questionsAnswerEmbedding: 1 } },
    ];
    ServerLoggingService.debug('QA pipeline', 'DocDBVectorService', { pipeline });
    let docs;
    try {
      docs = await this.collection.aggregate(pipeline).toArray();
      ServerLoggingService.debug('QA pipeline result', 'DocDBVectorService', { docsCount: docs.length });
    } catch (err) {
      ServerLoggingService.error('Error running QA pipeline', 'DocDBVectorService', err);
      throw err;
    }
    const rescored = [];
    for (const r of docs) {
      let sim = 0;
      try {
        sim = cosineSimilarity(cleanVector, r.questionsAnswerEmbedding) ?? 0;
      } catch (err) {
        ServerLoggingService.error('Error computing cosine similarity (QA)', 'DocDBVectorService', err);
      }
      ServerLoggingService.debug(`Similarity for QA _id=${r._id}: ${sim}`, 'DocDBVectorService');
      if (threshold === null || sim >= threshold) {
        rescored.push({
          id: r._id.toString(),
          interactionId: r.interactionId?.toString?.() || r.interactionId,
          expertFeedbackId: r.expertFeedbackId || null,
          similarity: sim,
        });
        if (rescored.length >= k) {
          break;
        }
      }
    }
    rescored.sort((a, b) => b.similarity - a.similarity);
    ServerLoggingService.debug('Sorted similarity list (QA)', 'DocDBVectorService', { rescored });
    this.stats.qaSearches++;
    this.stats.searches++;
    this.stats.totalSearchTime += Date.now() - start;
    ServerLoggingService.debug('QA search finished', 'DocDBVectorService', { outLength: rescored.slice(0, k).length });
    return rescored.slice(0, k);
  }

  /**
   * Vector search
   * @param {number[]} vector - query vector
   * @param {number} k - max neighbors to return
   * @param {'qa'|'sentence'} indexType
   * @param {{threshold?: number, efSearch?: number, candidateMultiplier?: number}} opts
   */
  async search(vector, k, indexType = 'qa', opts = {}) {
    ServerLoggingService.debug('search() called', 'DocDBVectorService', { k, indexType, opts });
    if (!this.isInitialized) {
      ServerLoggingService.debug('Not initialized, calling initialize()', 'DocDBVectorService');
      await this.initialize();
    }

    // Clean & validate query vector
    let cleanVector;
    try {
      cleanVector = toCleanVector(vector);
      ServerLoggingService.debug('Cleaned vector', 'DocDBVectorService', { cleanVectorLength: cleanVector.length });
    } catch (err) {
      ServerLoggingService.error('Error cleaning vector', 'DocDBVectorService', err);
      throw err;
    }

    const start = Date.now();

    if (indexType === 'sentence') {
      return await this._searchSentence(cleanVector, k, opts, start);
    } else {
      return await this._searchQA(cleanVector, k, opts, start);
    }
  }

  /**
   * Match an array of plain question strings against the questionsAnswerEmbedding
   * index. Returns an array where each entry corresponds to the top-k neighbors
   * for the respective question.
   * @param {string[]} questions
   * @param {{provider?:string, modelName?:string, k?:number, threshold?:number}} opts
   */
  async matchQuestions(questions = [], opts = {}) {
  const { provider = 'openai', modelName = null, k = 5, threshold = null, expertFeedbackRating = null, expertFeedbackComparison = 'eq', language = null } = opts;
    if (!Array.isArray(questions) || questions.length === 0) return [];

    // Lazy init DB/collections
    if (!this.isInitialized) await this.initialize();

    // Use top-level EmbeddingService import to format and embed the questions
    const formatted = EmbeddingService.formatQuestionsForEmbedding(questions);
    if (!formatted || !formatted.length) return [];

    const embeddingClient = EmbeddingService.createEmbeddingClient(provider, modelName);
    if (!embeddingClient) throw new Error('Failed to create embedding client');

    const embeddings = await embeddingClient.embedDocuments([formatted]);

    // Build aggregation pipelines for each embedding (do not run them yet)
    const pageLang = desiredPageLang(language);
    const pipelines = embeddings.map((emb) => {
      const pipeline = [];
      pipeline.push({ $search: { vectorSearch: { vector: emb, path: 'questionsEmbedding', similarity: 'cosine', k: k * 2, efSearch: 200 } } });
      pipeline.push({ $limit: k * 2 });
      if (this.filterQuery && Object.keys(this.filterQuery).length) pipeline.push({ $match: this.filterQuery });
      pipeline.push({ $lookup: { from: 'interactions', localField: 'interactionId', foreignField: '_id', as: 'inter' } });
      pipeline.push({ $unwind: { path: '$inter', preserveNullAndEmptyArrays: true } });
      // Populate expertFeedback so we can filter by its totalScore when requested
      pipeline.push({ $lookup: { from: 'expertfeedbacks', localField: 'inter.expertFeedback', foreignField: '_id', as: 'ef' } });
      pipeline.push({ $unwind: { path: '$ef', preserveNullAndEmptyArrays: true } });
      pipeline.push({ $lookup: { from: 'answers', localField: 'inter.answer', foreignField: '_id', as: 'answer' } });
      pipeline.push({ $unwind: { path: '$answer', preserveNullAndEmptyArrays: true } });
      pipeline.push({ $lookup: { from: 'chats', localField: 'inter._id', foreignField: 'interactions', as: 'chat' } });
      pipeline.push({ $unwind: { path: '$chat', preserveNullAndEmptyArrays: true } });
      // If a desired expertFeedbackRating was provided, apply comparison (eq by default for backwards compatibility)
      if (typeof expertFeedbackRating === 'number') {
        const cmp = expertFeedbackComparison || 'eq';
        if (cmp === 'lt') {
          pipeline.push({ $match: { 'ef.totalScore': { $lt: expertFeedbackRating } } });
        } else if (cmp === 'lte') {
          pipeline.push({ $match: { 'ef.totalScore': { $lte: expertFeedbackRating } } });
        } else { // eq
          pipeline.push({ $match: { 'ef.totalScore': expertFeedbackRating } });
        }
      }
      if (pageLang) pipeline.push({ $match: { 'chat.pageLanguage': pageLang } });
      pipeline.push({ $project: { _id: 1, interactionId: 1, expertFeedbackId: '$inter.expertFeedback', questionsEmbedding: 1, providedCitationUrl: '$answer.citation.providedCitationUrl', aiCitationUrl: '$answer.citation.aiCitationUrl', citationHead: '$answer.citation.citationHead', expertFeedbackScore: '$ef.totalScore' } });
      return pipeline;
    });

    // Run all aggregations in parallel and handle per-pipeline errors
    const aggPromises = pipelines.map((p) => this.collection.aggregate(p).toArray().catch((err) => {
      ServerLoggingService.error('Error running QA pipeline in matchQuestions', 'DocDBVectorService', err);
      return [];
    }));

    const allDocs = await Promise.all(aggPromises);

    // Map each pipeline result to the simplified output shape
    const resultsPerQuestion = allDocs.map((docs) => {
      const topDocs = Array.isArray(docs) ? docs.slice(0, k) : [];
      const mapped = topDocs.map((r) => {
        const expertFeedbackId = r.expertFeedbackId || null;
        return {
          id: r._id?.toString?.() || null,
          interactionId: r.interactionId?.toString?.() || r.interactionId,
          expertFeedbackId,
          expertFeedbackRating: expertFeedbackId ? expertFeedbackRating : null,
          similarity: null,
          citation: {
            providedCitationUrl: r.providedCitationUrl || null,
            aiCitationUrl: r.aiCitationUrl || null,
            citationHead: r.citationHead || null,
          },
        };
      });

      const withEF = mapped.find((s) => s.expertFeedbackId);
      if (withEF) {
        const rest = mapped.filter((s) => s.id !== withEF.id).slice(0, Math.max(0, k - 1));
        return [withEF, ...rest];
      }

      return mapped.slice(0, k);
    });

    return resultsPerQuestion;
  }

  async getStats() {
    if (!this.isInitialized) await this.initialize();

    // Get all interactionIds with expertFeedback
    const interactionsWithEF = await mongoose.connection.collection('interactions')
      .find({ expertFeedback: { $exists: true, $ne: null } })
      .project({ _id: 1 }).toArray();
    const validInteractionIds = interactionsWithEF.map(i => i._id);

    const embeddings = await this.collection.countDocuments({
      questionsAnswerEmbedding: { $exists: true, $ne: null },
      interactionId: { $in: validInteractionIds },
      ...this.filterQuery,
    });

    const parentIds = (await this.collection.find({ interactionId: { $in: validInteractionIds } })
      .project({ _id: 1 }).toArray()).map(e => e._id);

    const sentences = await this.sentenceCollection.countDocuments({
      embedding: { $exists: true, $ne: null },
      parentEmbeddingId: { $in: parentIds },
    });

    const { searches, qaSearches, sentenceSearches, totalSearchTime, lastInitTime } = this.stats;
    ServerLoggingService.debug('getStats result', 'DocDBVectorService', {
      isInitialized: this.isInitialized,
      embeddings,
      sentences,
      searches,
      qaSearches,
      sentenceSearches,
      averageSearchTimeMs: searches ? totalSearchTime / searches : 0,
      uptimeSeconds: lastInitTime ? (Date.now() - lastInitTime) / 1000 : 0,
    });
    return {
      isInitialized: this.isInitialized,
      embeddings,
      sentences,
      searches,
      qaSearches,
      sentenceSearches,
      averageSearchTimeMs: searches ? totalSearchTime / searches : 0,
      uptimeSeconds: lastInitTime ? (Date.now() - lastInitTime) / 1000 : 0,
    };
  }

  /**
   * Find similar chats by embedding using QA search logic (matches IMVectorService API)
   */
  async findSimilarChats(embedding, { excludeChatId, limit = 20 } = {}) {
    // pull extra, then re-rank client-side
    const neighbors = await this.search(embedding, limit * 2, 'qa', { efSearch: 200, candidateMultiplier: 4 });

    const Chat = mongoose.model('Chat');
    const config = await import('../config/eval.js');
    const similarityThreshold = config?.default?.thresholds?.questionAnswerSimilarity ?? 0;

    const results = [];
    for (const n of neighbors) {
      if (n.interactionId && n.similarity > similarityThreshold) {
        const chatDoc = await Chat.findOne({ interactions: n.interactionId }, { chatId: 1 }).lean();
        if (chatDoc && chatDoc.chatId !== excludeChatId) {
          results.push({ chatId: chatDoc.chatId, score: n.similarity });
        }
      }
      if (results.length >= limit) break;
    }

    // Dedupe by chatId, keep highest score
    const deduped = Object.values(results.reduce((acc, cur) => {
      if (!acc[cur.chatId] || acc[cur.chatId].score < cur.score) acc[cur.chatId] = cur;
      return acc;
    }, {}));

    deduped.sort((a, b) => b.score - a.score);
    return deduped.slice(0, limit);
  }

  /**
   * No-op in DocDB service; kept for compatibility with IMVectorService
   */
  addExpertFeedbackEmbedding() {
    // Writes/updates should be handled via your Mongoose models/ETL.
    // Intentionally a no-op for DocDB.
    return;
  }
}

export default DocDBVectorService;
