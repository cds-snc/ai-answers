import { ChatWorkflowService, ShortQueryValidation, RedactionError } from './ChatWorkflowService.js';
import AuthService from './AuthService.js';
import { getApiUrl } from '../utils/apiToUrl.js';

/**
 * Client-side batch runner that treats each spreadsheet row as its own chat.
 * It calls ChatWorkflowService.processResponse for each row and returns a summary.
 *
 * Usage:
 *   import BatchClientService from '../services/BatchClientService.js';
 *   await BatchClientService.runBatch({ entries, batchName, selectedAI, lang, searchProvider, concurrency, onProgress });
 */

const DEFAULT_RETRIES = 2;
const DEFAULT_CONCURRENCY = 1; // default sequential to avoid provider rate limits

class BatchService {
  constructor() {
    // Map of batchId -> AbortController for running client-side batches
    this._controllers = new Map();
  }
  /**
   * Start a batch: decide whether to derive context or send batch messages.
   * Returns whatever the underlying service returns (usually an object with batchId).
   */
  async startBatch({ entries = [], selectedAI = 'openai', selectedLanguage = 'en', batchName = '', selectedSearch = 'google', concurrency = DEFAULT_CONCURRENCY, retries = DEFAULT_RETRIES, onProgress = () => { }, onStatusUpdate = () => { }, abortSignal = null, statsPollingIntervalMs = 5000, batchId = null } = {}) {
    if (!entries || !entries.length) throw new Error('No entries provided to startBatch');
    if (!batchId) throw new Error('startBatch requires a server-persisted batchId; call persistBatch first');

    // Delegate batch processing to the local runner which uses ChatWorkflowService.processResponse
    // The batchId must already reference a Batch document in the DB.
    const result = await this.runBatch({
      entries,
      batchName: batchName || `client-batch-${Date.now()}`,
      selectedAI,
      lang: selectedLanguage,
      searchProvider: selectedSearch,
      concurrency,
      retries,
      onProgress,
      onStatusUpdate,
      abortSignal,
      batchId,
      statsPollingIntervalMs,
    });

    return result;
  }

  /**
   * Retrieve a batch from the API by id.
   */
  async retrieveBatch(batchId) {
    if (!batchId) throw new Error('batchId required');
    const url = getApiUrl(`batch-retrieve?batchId=${encodeURIComponent(batchId)}`);
    const res = await fetch(url, { headers: AuthService.getAuthHeader() });
    if (!res.ok) throw new Error(`Failed to retrieve batch: ${res.status} ${res.statusText}`);
    const result = await res.json();
    console.log(`[batch] retrieveBatch ${batchId}:`, result);
    return result;
  }


  async getBatchList() {
    const url = getApiUrl('batch-list');
    const res = await AuthService.fetchWithAuth(url);
    if (!res.ok) throw new Error(`Failed to get batch list: ${res.status} ${res.statusText}`);
    return await res.json();
  }
  // Persist a batch record to the database
  async persistBatch(batchData) {
    console.log(`[batch] persistBatch called with:`, batchData);
    const url = getApiUrl('batch-persist');
    const res = await AuthService.fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchData),
    });
    if (!res.ok) throw new Error(`Failed to persist batch: ${res.status} ${res.statusText}`);
    const result = await res.json();
    console.log(`[batch] persistBatch result:`, result);
    return result;
  }

  // Upsert batch items using the dedicated endpoint
  async upsertBatchItems(batchId, items) {
    if (!batchId) throw new Error('batchId required for upsert');
    if (!Array.isArray(items) || !items.length) return null;
    console.log(`[batch] upsertBatchItems: batchId=${batchId} items=${items.length}`);
    const url = getApiUrl('batch-items-upsert');
    const res = await AuthService.fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, items }),
    });
    if (!res.ok) throw new Error(`Failed to upsert batch items: ${res.status} ${res.statusText}`);
    const result = await res.json();
    console.log(`[batch] upsertBatchItems result:`, result);
    return result;
  }


  async getBatchStatus(batchId) {
    try {
      const url = getApiUrl(`batch-stats?batchId=${encodeURIComponent(batchId)}`);
      const res = await AuthService.fetchWithAuth(url);
      if (!res.ok) {
        if (res.status === 404) return { batchId, status: 'not_found' };
        throw new Error(`Failed to get batch stats: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      console.log(`[batch] getBatchStatus for ${batchId}:`, data);

      // Derive a simple status from counts. Keep initial batches (none processed)
      // marked as 'uploaded' so the UI doesn't show them as actively processing.
      const total = Number(data.total || 0);
      const processed = Number(data.processed || 0);
      let status = 'unknown';
      if (total === 0) status = 'unknown';
      else if (processed === 0) status = 'uploaded';
      else if (processed >= total) status = 'processed';
      else status = 'processing';

      return { batchId, status, stats: data };
    } catch (error) {
      console.error(`Error fetching status for batch ${batchId}:`, error);
      return { batchId, status: 'Error' };
    }
  }

  // Cancel a batch at the provider
  // Cancel a running client-side batch: abort the local processing loop.
  // This intentionally does not call any provider API.
  async cancelBatch(batchId /*, aiProvider - ignored */) {
    try {
      if (!batchId) return { cancelled: false };
      const ctrl = this._controllers.get(batchId);
      if (ctrl) {
        try { ctrl.abort(); } catch (e) { /* ignore */ }
        this._controllers.delete(batchId);
        return { cancelled: true };
      }
      return { cancelled: false };
    } catch (error) {
      console.error('Error canceling batch client-side:', error);
      throw error;
    }
  }

  // Delete a batch record from the server
  async deleteBatch(batchId) {
    if (!batchId) throw new Error('batchId required for delete');
    try {
      const url = getApiUrl(`batch-delete?batchId=${encodeURIComponent(batchId)}`);
      const res = await AuthService.fetchWithAuth(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete batch: ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.error('Error deleting batch:', err);
      throw err;
    }
  }

  // Delete all batches and their batchItems (admin only)
  async deleteAllBatches() {
    try {
      const url = getApiUrl('batch-delete-all');
      const res = await AuthService.fetchWithAuth(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete all batches: ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.error('Error deleting all batches:', err);
      throw err;
    }
  }

  // Given an array of batches, fetch their latest statuses from server (mirrors DataStoreService logic)
  async getBatchStatuses(batches) {
    try {
      const statusPromises = batches.map(async (batch) => {
        if (!batch.status || batch.status !== 'processed') {
          const statusResult = await this.getBatchStatus(batch._id, batch.aiProvider);
          // If the DB reports not_found, don't attempt a provider cancel from the client.
          // Client-side cancel should be done via `cancelBatch` which aborts local processing.
          return statusResult;
        } else {
          // Keep the shape compatible with getBatchStatus results (which use `batchId`)
          // by returning an object where `batchId` is the batch's `_id`.
          return { batchId: batch._id, status: batch.status };
        }
      });
      const statusResults = await Promise.all(statusPromises);
      return batches.map((batch) => {
        const statusResult = statusResults.find((status) => status.batchId === batch._id);
        return {
          ...batch,
          status: statusResult ? statusResult.status : 'Unknown',
          stats: statusResult ? statusResult.stats || {} : batch.stats || {},
        };
      });
    } catch (error) {
      console.error('Error fetching statuses:', error);
      return batches || [];
    }
  }

  /**
   * Perform provider actions like cancel or process-results for a batch.
   */
  // providerAction removed: provider orchestration should be implemented server-side if needed.

  async runBatch({
    entries = [],
    batchName = `client-batch-${Date.now()}`,
    selectedAI = 'openai',
    lang = 'en',
    searchProvider = '',
    batchId = null,
    concurrency = DEFAULT_CONCURRENCY,
    retries = DEFAULT_RETRIES,
    onProgress = () => { }, // ({ index, total, status, chatId, error, result })
    onStatusUpdate = () => { }, // per-item onStatusUpdate forwarded to workflow
    abortSignal = null,
    statsPollingIntervalMs = 5000,
  } = {}) {
    // If caller didn't provide an abortSignal, create one and track it by batchId
    let internalController = null;
    let signal = abortSignal;
    if (!signal) {
      internalController = new AbortController();
      signal = internalController.signal;
      if (batchId) this._controllers.set(String(batchId), internalController);
    }

    const total = entries.length || 0;
    const results = new Array(total);

    let index = 0;
    // We'll poll the server for stats instead of persisting counts from the client.
    let polling = null;
    const startPollingStats = (intervalMs = 5000) => {
      if (!batchId) return;
      polling = setInterval(async () => {
        try {
          const url = getApiUrl(`batch-stats?batchId=${encodeURIComponent(batchId)}`);
          const res = await AuthService.fetchWithAuth(url);
          if (!res.ok) return;
          const stats = await res.json();
          // emit a status update with counts for UI consumers
          onStatusUpdate({ type: 'stats', stats });
        } catch (err) {
          // ignore polling errors
        }
      }, intervalMs);
    };
    const stopPollingStats = () => {
      if (polling) clearInterval(polling);
      polling = null;
    };

    // Coerce concurrency to a number and bound it between 1 and total
    const concurrencyCount = Math.max(1, Math.min(total, Number(concurrency) || DEFAULT_CONCURRENCY));
    console.log(`[batch] runBatch: entries=${total} concurrency=${concurrency} concurrencyCount=${concurrencyCount}`);

    // Temporary instrumentation: count active workers for debugging concurrency
    let activeWorkers = 0;

    // Worker loop: each worker pulls the next index atomically and processes it
    const worker = async () => {
      while (index < total) {
        const i = index++;
        if (i >= total) break;

        if (signal?.aborted) {
          results[i] = { index: i, skipped: true, error: 'aborted' };
          onProgress({ index: i, total, status: 'aborted', chatId: null, error: 'aborted' });
          continue;
        }

        const entry = entries[i];
        // Support two shapes: persisted item wrapper { rowIndex, originalData, chat } or raw original data object
        const original = entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'originalData')
          ? entry.originalData
          : entry;
        const question = this._extractQuestion(original);
        const existingChat = entry && entry.chat ? entry.chat : (original && original.chat ? original.chat : null);
        const idPrefix = batchId || batchName;
        const chatId = existingChat || `${idPrefix}-${i}-${Date.now()}`;

        // If this entry already has a chat id recorded, skip re-processing it
        if (existingChat) {
          results[i] = { index: i, chatId: existingChat, skipped: true };
          onProgress({ index: i, total, status: 'skipped', chatId: existingChat });
          continue;
        }

        // instrumentation: mark worker active and log
        activeWorkers++;
        console.log(`[batch] worker start idx=${i} batchId=${batchId} chatId=${chatId} active=${activeWorkers}`);
        onProgress({ index: i, total, status: 'started', chatId });

        try {
          if (!question || question.trim().length === 0) {
            const err = 'No question text found in row';
            results[i] = { index: i, chatId, error: err };
            onProgress({ index: i, total, status: 'failed', chatId, error: err });
            continue;
          }

          const callWithRetries = async (attempt = 0) => {
            try {
              const perItemStatus = (status) => onStatusUpdate({ index: i, status, chatId });

              // Temporary delay to make concurrency visible
              await this._sleep(2000);

              const res = await ChatWorkflowService.processResponse(
                chatId,
                question,
                0, // userMessageId
                [], // conversationHistory
                lang,
                null, // department
                original?.url || '',
                selectedAI,
                null, // translationF
                perItemStatus,
                searchProvider
              );

              results[i] = { index: i, chatId, result: res };
              onProgress({ index: i, total, status: 'completed', chatId, result: res });

              try {
                const rowIndex = entry?.rowIndex ?? original?.rowIndex ?? i;
                await this.upsertBatchItems(batchId, [
                  { rowIndex, originalData: original, chat: chatId },
                ]);
              } catch (persistErr) {
                console.error('Failed to upsert batch item update:', persistErr);
              }
            } catch (err) {
              if (err instanceof ShortQueryValidation) {
                const message = `Short query: ${err.userMessage}`;
                results[i] = { index: i, chatId, error: message, shortQuery: true, searchUrl: err.searchUrl };
                onProgress({ index: i, total, status: 'skipped', chatId, error: message });

                try {
                  const rowIndex = entry?.rowIndex ?? original?.rowIndex ?? i;
                  await this.upsertBatchItems(batchId, [
                    { rowIndex, shortQuery: true, originalData: original },
                  ]);
                } catch (persistErr) {
                  console.error('Failed to persist shortQuery for batch item:', persistErr);
                }
                return;
              }

              if (err instanceof RedactionError) {
                const message = `Redaction blocked: ${err.message}`;
                results[i] = { index: i, chatId, error: message, redacted: true };
                onProgress({ index: i, total, status: 'failed', chatId, error: message });

                try {
                  const rowIndex = entry?.rowIndex ?? original?.rowIndex ?? i;
                  await this.upsertBatchItems(batchId, [
                    { rowIndex, error: message, originalData: original },
                  ]);
                } catch (persistErr) {
                  console.error('Failed to persist redaction error for batch item:', persistErr);
                }
                return;
              }

              const isTransient = this._isTransientError(err);
              if (isTransient && attempt < retries) {
                const backoffMs = Math.pow(2, attempt) * 500;
                await this._sleep(backoffMs);
                return callWithRetries(attempt + 1);
              }

              const message = err?.message || String(err);
              results[i] = { index: i, chatId, error: message };
              onProgress({ index: i, total, status: 'failed', chatId, error: message });

              try {
                const rowIndex = entry?.rowIndex ?? original?.rowIndex ?? i;
                await this.upsertBatchItems(batchId, [
                  { rowIndex, error: message, originalData: original },
                ]);
              } catch (persistErr) {
                console.error('Failed to persist error for batch item:', persistErr);
              }
            }
          };

          await callWithRetries(0);
        } catch (outerErr) {
          const message = outerErr?.message || String(outerErr);
          results[i] = { index: i, chatId, error: message };
          onProgress({ index: i, total, status: 'failed', chatId, error: message });
        } finally {
          // instrumentation: mark worker finished and log
          activeWorkers--;
          console.log(`[batch] worker end   idx=${i} batchId=${batchId} chatId=${chatId} active=${activeWorkers}`);
        }
      }
    };

    // Start polling stats for UI while processing
    startPollingStats(statsPollingIntervalMs);

    // Start worker pool
    const workers = new Array(concurrencyCount).fill(null).map(() => worker());
    console.log(`[batch] Starting ${workers.length} worker(s)`);
    try {
      await Promise.all(workers);
    } finally {
      // stop polling once finished or if aborted/errored
      stopPollingStats();
      if (internalController && batchId) this._controllers.delete(batchId);
    }

    const summary = this._summarize(results);
    return { results, summary };
  }

  _extractQuestion(original) {
    if (!original) return '';
    const keys = ['REDACTEDQUESTION', 'QUESTION', 'PROBLEM DETAILS', 'PROBLEMDETAILS', 'REDACTED QUESTION'];
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(original, k) && original[k]) return String(original[k]);
    }
    for (const k of Object.keys(original)) {
      const v = original[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return '';
  }

  _isTransientError(err) {
    if (!err) return false;
    const m = (err.status || err.code || '').toString().toLowerCase();
    const msg = (err.message || '').toLowerCase();
    // treat network and 5xx/429 as transient
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
    if (m === '429' || msg.includes('rate limit') || msg.includes('too many requests')) return true;
    return false;
  }

  _summarize(results) {
    const total = results.length;
    const completed = results.filter(r => r && r.result).length;
    const failed = results.filter(r => r && r.error).length;
    const skipped = results.filter(r => r && r.shortQuery).length;
    return { total, completed, failed, skipped };
  }

  _sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  /**
   * Retrieve chat logs for a batch using the server-side db-chat-logs endpoint.
   * Returns an array of chat documents (may be empty).
   */
  async retrieveBatchChats(batchId, limit = 1000) {
    if (!batchId) throw new Error('batchId required');
    try {
      const url = getApiUrl(`db-chat-logs?batchId=${encodeURIComponent(batchId)}&limit=${encodeURIComponent(limit)}`);
      const res = await AuthService.fetchWithAuth(url);
      if (!res.ok) throw new Error(`Failed to retrieve batch chats: ${res.status} ${res.statusText}`);
      const body = await res.json();
      console.log(`[batch] retrieveBatchChats ${batchId}: found ${Array.isArray(body.logs) ? body.logs.length : 0} chats`);
      return Array.isArray(body.logs) ? body.logs : [];
    } catch (err) {
      console.error(`Error retrieving batch chats for ${batchId}:`, err);
      throw err;
    }
  }
}

export default new BatchService();
