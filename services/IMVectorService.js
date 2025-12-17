// services/IMVectorService.js — drop-in replacement for DocDBVectorService (Option B compatible)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { VectorDB } = require('imvectordb');

import mongoose from 'mongoose';
import dbConnect from '../api/db/db-connect.js';
import ServerLoggingService from './ServerLoggingService.js';
import { Embedding } from '../models/embedding.js';
import { SentenceEmbedding } from '../models/sentenceEmbedding.js';
import { Interaction } from '../models/interaction.js';

function isValidVector(vec) {
  return Array.isArray(vec) && vec.every((x) => typeof x === 'number' && Number.isFinite(x));
}
function toPlainNumberArray(vec) {
  if (!Array.isArray(vec)) return Array.from(vec);
  return vec.map((v, i) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : Number(v);
    if (!Number.isFinite(n)) throw new Error(`Invalid element at ${i}: ${v}`);
    return n;
  });
}

function isFrenchLanguage(lang) {
  if (!lang) return false;
  const v = String(lang).trim().toLowerCase();
  return v === 'fr' || v === 'fra' || v === 'french';
}

function desiredPageLang(lang) {
  return isFrenchLanguage(lang) ? 'fr' : 'en';
}

class IMVectorService {
  /**
   * @param {{filterQuery?: object, preCheck?: boolean}} opts
   *  - filterQuery: applied to Embedding (QA) selection (e.g., limit to certain interactions)
   *  - preCheck: validate vectors before building in-memory indexes
   */
  constructor({ filterQuery = {}, preCheck = false } = {}) {
    this.qaDB = new VectorDB();
    this.questionsDB = new VectorDB();
    this.sentenceDB = new VectorDB();
    this.isInitialized = false;
    this.initializingPromise = null;

    this.filterQuery = filterQuery;
    this.preCheck = preCheck;

    // Minimal metadata to mirror DocDBVectorService search() outputs
    this.qaMeta = new Map();       // id -> { interactionId, expertFeedbackId }
    this.sentMeta = new Map();     // id -> { interactionId, sentenceIndex, expertFeedbackId }

    this.stats = {
      searches: 0,
      qaSearches: 0,
      sentenceSearches: 0,
      totalSearchTime: 0,
      lastInitTime: null,
      embeddings: 0,
      questions: 0,
      sentences: 0,
      vectorMemoryUsage: {},
      initDurationMs: 0,
    };
  }

  /**
   * Build in-memory vector stores from Mongo data (QA from Embedding, sentences from SentenceEmbedding)
   */
  async initialize() {
    if (this.isInitialized) return;
    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = (async () => {
      const t0 = Date.now();
      ServerLoggingService.info('Initializing IMVectorService (local vector store)...', 'vector-service');
      await dbConnect();

      // ----- Load QA docs (Embedding) -----
      const qaQuery = {
        questionsAnswerEmbedding: { $exists: true, $not: { $size: 0 } },
        ...this.filterQuery,
      };
      const qaDocs = await Embedding.find(qaQuery)
        .select('_id interactionId questionsAnswerEmbedding questionsEmbedding createdAt')
        .lean();

      if (!qaDocs.length) {
        ServerLoggingService.warn('IMVectorService: No QA embeddings found—service remains empty.', 'vector-service');
        this.isInitialized = true;
        this.initializingPromise = null;
        return;
      }

      // Map parentEmbeddingId -> interactionId for sentence join later
      const parentToInteraction = new Map(qaDocs.map(d => [d._id.toString(), d.interactionId?.toString()]));

      // Load Interactions to get expertFeedbackId and answer.citation
      const interactionIds = [...new Set(qaDocs.map(d => d.interactionId?.toString()).filter(Boolean))];
      // Populate expertFeedback so we can capture totalScore for runtime filtering
      const interactions = await Interaction.find({ _id: { $in: interactionIds } })
        .select('_id expertFeedback answer')
        .populate('expertFeedback')
        .populate({ path: 'answer', populate: { path: 'citation', model: 'Citation' } })
        .lean();
      const interactionToEF = new Map(interactions.map(i => [i._id.toString(), i.expertFeedback ? (i.expertFeedback._id?.toString?.() || i.expertFeedback.toString?.() || null) : null]));
      const interactionToEFScore = new Map(interactions.map(i => [i._id.toString(), (i.expertFeedback && typeof i.expertFeedback.totalScore === 'number') ? Number(i.expertFeedback.totalScore) : null]));
      const interactionToCitation = new Map(interactions.map(i => [i._id.toString(), i.answer && i.answer.citation ? {
        providedCitationUrl: i.answer.citation.providedCitationUrl || null,
        aiCitationUrl: i.answer.citation.aiCitationUrl || null,
        citationHead: i.answer.citation.citationHead || null,
        confidenceRating: i.answer.citation.confidenceRating || null
      } : null]));

      // Filter out QA docs without expertFeedback
      // Keep QA docs that have an expertFeedback id associated; we'll also track its score
      const qaDocsWithEF = qaDocs.filter(doc => {
        const efId = interactionToEF.get(doc.interactionId?.toString() || '');
        return !!efId;
      });

      // Precheck QA if enabled (pure numbers)
      if (this.preCheck) {
        const bad = qaDocsWithEF.filter(d => !isValidVector(d.questionsAnswerEmbedding));
        if (bad.length) {
          ServerLoggingService.error('Precheck failed for QA embeddings', 'vector-service', { count: bad.length, sample: bad[0]?._id });
          throw new Error('Vector precheck (QA) failed: non-number values present');
        }
      }

      // Insert QA vectors into local VectorDB
      for (const doc of qaDocsWithEF) {
        const id = doc._id.toString(); // mirror DocDB returning _id
        const vec = toPlainNumberArray(doc.questionsAnswerEmbedding);
        this.qaDB.add({ id, embedding: vec });
        this.qaMeta.set(id, {
          interactionId: doc.interactionId?.toString() || null,
          expertFeedbackId: interactionToEF.get(doc.interactionId?.toString() || '') || null,
          expertFeedbackScore: interactionToEFScore.get(doc.interactionId?.toString() || '') ?? null,
          citation: interactionToCitation.get(doc.interactionId?.toString() || '') || null,
        });
      }

      // Also populate questions-only index when available
      for (const doc of qaDocsWithEF) {
        if (Array.isArray(doc.questionsEmbedding) && doc.questionsEmbedding.length) {
          const qid = `${doc._id.toString()}:q`;
          const qvec = toPlainNumberArray(doc.questionsEmbedding);
          this.questionsDB.add({ id: qid, embedding: qvec });
          this.qaMeta.set(qid, {
            interactionId: doc.interactionId?.toString() || null,
            expertFeedbackId: interactionToEF.get(doc.interactionId?.toString() || '') || null,
            expertFeedbackScore: interactionToEFScore.get(doc.interactionId?.toString() || '') ?? null,
            citation: interactionToCitation.get(doc.interactionId?.toString() || '') || null,
          });
        }
      }

      // ----- Load Sentence docs (SentenceEmbedding) -----
      const sentenceDocs = await SentenceEmbedding.find({
        parentEmbeddingId: { $in: qaDocsWithEF.map(d => d._id) },
      })
        .select('_id parentEmbeddingId sentenceIndex embedding')
        .lean();

      if (this.preCheck) {
        const badS = sentenceDocs.filter(d => !isValidVector(d.embedding));
        if (badS.length) {
          ServerLoggingService.error('Precheck failed for sentence embeddings', 'vector-service', { count: badS.length, sample: badS[0]?._id });
          throw new Error('Vector precheck (sentence) failed: non-number values present');
        }
      }

      for (const row of sentenceDocs) {
        const id = row._id.toString();
        const vec = toPlainNumberArray(row.embedding);
        this.sentenceDB.add({ id, embedding: vec });

        const parentId = row.parentEmbeddingId?.toString();
        const interactionId = parentToInteraction.get(parentId) || null;
        const expertFeedbackId = interactionId ? interactionToEF.get(interactionId) || null : null;

        this.sentMeta.set(id, {
          interactionId,
          sentenceIndex: row.sentenceIndex,
          expertFeedbackId,
          expertFeedbackScore: interactionToEFScore.get(interactionId) ?? null,
          citation: interactionToCitation.get(interactionId) || null,
        });
      }

      // stats
      // counts reflect what was loaded into the in-memory indexes
      this.stats.embeddings = qaDocsWithEF.length;
      this.stats.questions = qaDocsWithEF.filter(d => Array.isArray(d.questionsEmbedding) && d.questionsEmbedding.length).length;
      this.stats.sentences = sentenceDocs.length;
      this.stats.lastInitTime = new Date();
      this.stats.initDurationMs = Date.now() - t0;

      // quick memory usage estimate (optional)
      this._calculateVectorMemoryUsage(
        qaDocsWithEF[0]?.questionsAnswerEmbedding?.length || 0,
        qaDocsWithEF[0]?.questionsEmbedding?.length || 0,
        sentenceDocs[0]?.embedding?.length || 0
      );

      this.isInitialized = true;
      this.initializingPromise = null;
      ServerLoggingService.info(
        `IMVectorService initialized: ${this.stats.embeddings} QA, ${this.stats.questions} questions, ${this.stats.sentences} sentences. Init took ${this.stats.initDurationMs}ms.`,
        'vector-service'
      );
    })();

    return this.initializingPromise;
  }

  _calculateVectorMemoryUsage(qaDim, sentDim) {
    // qaDim: dimension of QA (questionsAnswerEmbedding)
    // questionDim: dimension of questions-only embeddings
    // sentDim: dimension of sentence embeddings
    const questionDim = arguments.length >= 2 ? arguments[1] : 0;
    const sentDimArg = arguments.length >= 3 ? arguments[2] : sentDim;

    const qaVectorMemory = this.stats.embeddings * qaDim * 8;     // 8 bytes/float
    const questionVectorMemory = (this.stats.questions || 0) * questionDim * 8;
    const sentenceVectorMemory = this.stats.sentences * sentDimArg * 8;
    const metadataMemory =
      [...this.qaMeta.values(), ...this.sentMeta.values()]
        .reduce((sum, v) => sum + Buffer.byteLength(JSON.stringify(v), 'utf8'), 0);

    const total = qaVectorMemory + questionVectorMemory + sentenceVectorMemory + metadataMemory;
    this.stats.vectorMemoryUsage = {
      total: `${(total / 1024 / 1024).toFixed(2)} MB`,
      qaVectors: `${(qaVectorMemory / 1024 / 1024).toFixed(2)} MB`,
      questionVectors: `${(questionVectorMemory / 1024 / 1024).toFixed(2)} MB`,
      sentenceVectors: `${(sentenceVectorMemory / 1024 / 1024).toFixed(2)} MB`,
      metadata: `${(metadataMemory / 1024 / 1024).toFixed(2)} MB`,
    };
  }

  /**
   * Find similar chats by embedding using QA search logic (unchanged API)
   */
  async findSimilarChats(embedding, { excludeChatId, limit = 20 } = {}) {
    const config = await import('../config/eval.js');
    const similarityThreshold = config.default.thresholds.questionAnswerSimilarity ?? 0.0;

    // Pass threshold into search so it can short-circuit early
    const neighbors = await this.search(embedding, limit * 2, 'qa', { threshold: similarityThreshold });

    const Chat = mongoose.model('Chat');
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
    return deduped;
  }

  /**
   * Optional: allow appending vectors at runtime (kept for compatibility)
   */
  addExpertFeedbackEmbedding({ interactionId, expertFeedbackId, questionsAnswerEmbedding, questionsEmbedding, sentenceEmbeddings }) {
    // Add QA (questions+answer) embedding
    if (questionsAnswerEmbedding && expertFeedbackId) {
      const qaId = `${interactionId || this.stats.embeddings}:${Date.now()}`; // unique-enough
      const vec = toPlainNumberArray(questionsAnswerEmbedding);
      this.qaDB.add({ id: qaId, embedding: vec });
      this.qaMeta.set(qaId, {
        interactionId: interactionId?.toString() || null,
        expertFeedbackId: expertFeedbackId?.toString() || null,
      });
      this.stats.embeddings++;
    }

    // Add question-only embedding if provided
    if (Array.isArray(questionsEmbedding) && questionsEmbedding.length && expertFeedbackId) {
      const qid = `${interactionId || this.stats.embeddings}:q:${Date.now()}`;
      const qvec = toPlainNumberArray(questionsEmbedding);
      this.questionsDB.add({ id: qid, embedding: qvec });
      this.qaMeta.set(qid, {
        interactionId: interactionId?.toString() || null,
        expertFeedbackId: expertFeedbackId?.toString() || null,
      });
      this.stats.questions = (this.stats.questions || 0) + 1;
    }

    if (Array.isArray(sentenceEmbeddings) && expertFeedbackId) {
      sentenceEmbeddings.forEach((sentVec, idx) => {
        const id = `${interactionId || 'tmp'}:${idx}:${Date.now()}`;
        const vec = toPlainNumberArray(sentVec);
        this.sentenceDB.add({ id, embedding: vec });
        this.sentMeta.set(id, {
          interactionId: interactionId?.toString() || null,
          sentenceIndex: idx,
          expertFeedbackId: expertFeedbackId?.toString() || null,
        });
        this.stats.sentences++;
      });
    }
  }

  /**
   * Unified search API — mirrors DocDBVectorService output shapes
   * @param {number[]} vector
   * @param {number} k
   * @param {'qa'|'sentence'} indexType
   * @param {{threshold?: number}} opts
   */
  async search(vector, k, indexType = 'qa', opts = {}) {
    if (!this.isInitialized && !this.initializingPromise) {
      this.initialize();
    }
    if (!this.isInitialized) await this.initializingPromise;

    const { threshold = null } = opts;
    const plainVector = toPlainNumberArray(vector);

    let db, metaMap, statKey;
    if (indexType === 'qa') {
      db = this.qaDB; metaMap = this.qaMeta; statKey = 'qaSearches';
    } else if (indexType === 'sentence') {
      db = this.sentenceDB; metaMap = this.sentMeta; statKey = 'sentenceSearches';
    } else {
      throw new Error('Unknown indexType for VectorService.search');
    }

    const start = Date.now();
    let results = await db.query(plainVector, k); // imvectordb returns { document: { id }, similarity }
    // Ensure sorted by similarity desc (most libs already do, but cheap to enforce)
    results = results.sort((a, b) => b.similarity - a.similarity);

    this.stats.searches++;
    this.stats[statKey]++;
    this.stats.totalSearchTime += Date.now() - start;

    // Map to DocDB-compatible shapes with short-circuit on threshold
    const out = [];
    for (const r of results) {
      const id = r.document.id;
      const meta = metaMap.get(id) || {};
      const sim = r.similarity;

      if (threshold !== null && sim < threshold) break;

      if (indexType === 'qa') {
        out.push({
          id,
          interactionId: meta.interactionId || null,
          expertFeedbackId: meta.expertFeedbackId || null,
          similarity: sim,
          citation: meta.citation || null,
        });
      } else {
        out.push({
          id,
          interactionId: meta.interactionId || null,
          sentenceIndex: meta.sentenceIndex,
          expertFeedbackId: meta.expertFeedbackId || null,
          similarity: sim,
          citation: meta.citation || null,
        });
      }

      if (out.length >= k) break; // safety; results length can still be <= k after threshold cut
    }

    return out;
  }

  /**
   * Match an array of plain question strings against the in-memory QA index.
   * Returns an array where each entry corresponds to the top-k neighbors for
   * the respective question.
   * @param {string[]} questions
   * @param {{provider?:string, modelName?:string, k?:number, threshold?:number}} opts
   */
  async matchQuestions(questions = [], opts = {}) {
    const { provider = 'openai', modelName = null, k = 5, threshold = null, expertFeedbackRating = null, expertFeedbackComparison = 'eq', language = null } = opts;
    if (!Array.isArray(questions) || questions.length === 0) return [];

    // Ensure vectors are loaded
    if (!this.isInitialized) await this.initialize();

    // Use EmbeddingService to format and embed
    const EmbeddingService = (await import('./EmbeddingService.js')).default;
    const formatted = EmbeddingService.formatQuestionsForEmbedding(questions);
    if (!formatted || !formatted.length) return [];

    const client = EmbeddingService.createEmbeddingClient(provider, modelName);
    if (!client) throw new Error('Failed to create embedding client');

    const embeddings = await client.embedDocuments([formatted]);

  const resultsPerQuestion = [];
    for (const emb of embeddings) {
      // Prefer questionsDB (questions-only embeddings) if populated, else fall back to qaDB
      const searchDb = (this.questionsDB && this.questionsDB.size && this.questionsDB.size() > 0) ? this.questionsDB : this.qaDB;
      let results = await searchDb.query(emb, k * 2);
      results = results.sort((a, b) => b.similarity - a.similarity);

      // Map the top results to the simplified shape but do NOT apply a client-side
      // similarity threshold. We trust the underlying index to return nearest
      // neighbors in order. Keep up to k*2 items so we can promote expert-backed
      // items and then slice down to k.
      const mapped = [];
      for (const r of results) {
        const id = r.document.id;
        const meta = this.qaMeta.get(id) || {};
        const sim = r.similarity;
        const expertFeedbackId = meta.expertFeedbackId || null;
        mapped.push({ id, interactionId: meta.interactionId || null, expertFeedbackId, expertFeedbackRating: expertFeedbackId ? expertFeedbackRating : null, similarity: sim });
        if (mapped.length >= k * 2) break;
      }

      // Attach citation from prepopulated qaMeta (populated during initialize)
      for (const m of mapped) {
        const meta = this.qaMeta.get(m.id) || {};
        m.citation = meta.citation || null;
      }
      // Language filtering: if a language was provided, resolve chats for
      // the candidate interactionIds and filter mapped results to only those
      // whose chat.pageLanguage matches the desired one. If no language was
      // provided, keep existing behavior.
      let filtered = mapped;
      if (language) {
        const pageLang = desiredPageLang(language);
        const interactionIds = Array.from(new Set(mapped.map(m => m.interactionId).filter(Boolean)));
        if (interactionIds.length) {
          // Find chats that contain these interactions and map interactionId -> pageLanguage
          const Chat = mongoose.model('Chat');
          const chats = await Chat.find({ interactions: { $in: interactionIds } }).select('interactions pageLanguage').lean();
          const interactionToLang = {};
          for (const c of chats) {
            const lang = c.pageLanguage || '';
            for (const iid of (c.interactions || [])) {
              interactionToLang[iid.toString?.() || iid] = lang;
            }
          }

          filtered = mapped.filter(m => {
            const lang = interactionToLang[m.interactionId?.toString?.() || m.interactionId] || '';
            return lang === pageLang;
          });
        } else {
          // no interaction ids -> no matches
          filtered = [];
        }
      }

      // If a specific expertFeedbackRating was requested, filter by comparison (default eq for compatibility).
      if (typeof expertFeedbackRating === 'number') {
        filtered = filtered.filter(m => {
          const meta = this.qaMeta.get(m.id) || {};
          const score = typeof meta.expertFeedbackScore === 'number' ? meta.expertFeedbackScore : null;
          if (score === null) return false;
          if (expertFeedbackComparison === 'lt') return score < expertFeedbackRating;
          if (expertFeedbackComparison === 'lte') return score <= expertFeedbackRating;
          return score === expertFeedbackRating; // eq
        });
      }

      // Promote the first expert-feedback-backed item, preserving the remaining order
      const withEF = filtered.find(s => s.expertFeedbackId);
      if (withEF) {
        const rest = filtered.filter(s => s.id !== withEF.id).slice(0, Math.max(0, k - 1));
        resultsPerQuestion.push([withEF, ...rest]);
      } else {
        resultsPerQuestion.push(filtered.slice(0, k));
      }
    }
    return resultsPerQuestion;
  }

  getStats() {
    const { searches, qaSearches, sentenceSearches, totalSearchTime, lastInitTime, embeddings, questions, sentences, initDurationMs } = this.stats;
    return {
      isInitialized: this.isInitialized,
      embeddings,
      questions,
      sentences,
      searches,
      qaSearches,
      sentenceSearches,
      averageSearchTimeMs: searches ? totalSearchTime / searches : 0,
      uptimeSeconds: lastInitTime ? (Date.now() - lastInitTime) / 1000 : 0,
      initDurationMs,
      vectorMemoryUsage: this.stats.vectorMemoryUsage,
    };
  }
}

export default IMVectorService;
