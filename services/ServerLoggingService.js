import { Logs } from '../models/logs.js';
import dbConnect from '../api/db/db-connect.js';
import storageService from './Storage.js';
import util from 'util';

// Safe stringify that avoids throwing on circular refs. Prefer JSON when possible,
// otherwise fall back to util.inspect which gives a readable representation.
function safeStringify(obj) {
    if (obj === null || obj === undefined) return '';
    try {
        return JSON.stringify(obj);
    } catch (e) {
        try {
            return util.inspect(obj, { depth: 4, breakLength: 120 });
        } catch (e2) {
            return String(obj);
        }
    }
}

class LogQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.processingInterval = null;
        this.startProcessingLoop();
    }

    startProcessingLoop() {
        // Check queue every 1 second for new items or retry processing
        this.processingInterval = setInterval(() => {
            if (!this.isProcessing && this.queue.length > 0) {
                this.processQueue().catch(error => {
                    console.error('Error in processing loop:', error);
                });
            }
        }, 1000);
    }

    stopProcessingLoop() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
    }

    async add(logEntry) {
        this.queue.push(logEntry);
        // Try to process immediately, but don't wait for it
        if (!this.isProcessing) {
            this.processQueue().catch(error => {
                console.error('Error processing queue:', error);
            });
        }
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        try {
            while (this.queue.length > 0) {
                const entry = this.queue[0];
                try {
                    await this.processLogEntry(entry);
                    this.queue.shift(); // Remove only after successful processing
                } catch (error) {
                    console.error('Error processing log entry:', error);
                    // Move failed entry to end of queue to retry later
                    const failedEntry = this.queue.shift();
                    if (!failedEntry.retryCount || failedEntry.retryCount < 3) {
                        failedEntry.retryCount = (failedEntry.retryCount || 0) + 1;
                        this.queue.push(failedEntry);
                        console.warn(`Retrying failed log entry later. Attempt ${failedEntry.retryCount}/3`);
                    } else {
                        console.error('Failed to process log entry after 3 attempts:', failedEntry);
                    }
                    // Add small delay before next attempt
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    async processLogEntry({ level, message, chatId, data }) {

        // Only save to storage if chatId is present and not "system"
        if (!chatId || chatId === 'system') {
            return;
        }

        try {
            const interactionId = data?.interactionId || 'system';
            const timestamp = Date.now();
            const key = `${chatId}/${interactionId}/${timestamp}.json`;

            const logEntry = {
                chatId,
                logLevel: level,
                message: typeof message === 'object' ? safeStringify(message) : message,
                metadata: data,
                createdAt: new Date().toISOString()
            };

            await storageService.put(key, JSON.stringify(logEntry));

        } catch (error) {
            console.error('Failed to save log to storage:', error);
        }
    }
}

const logQueue = new LogQueue();

// Ensure cleanup on process exit
process.on('beforeExit', () => {
    logQueue.stopProcessingLoop();
});

// Handle remaining logs on shutdown
process.on('SIGTERM', async () => {
    logQueue.stopProcessingLoop();
    if (logQueue.queue.length > 0) {
        console.log(`Processing ${logQueue.queue.length} remaining logs before shutdown...`);
        await logQueue.processQueue();
    }
    process.exit(0);
});

const ServerLoggingService = {
    log: async (level, message, chatId = 'system', data = {}) => {
        // Log directly to console
        console[level](`[${level.toUpperCase()}][${chatId}] ${message}`, data);

        // Always add to queue for storage (removed Settings check)
        logQueue.add({ level, message, chatId, data });
    },

    getLogs: async ({ level = null, chatId = null, skip = 0, limit = 100 }) => {
        // Normalize and constrain potentially user-controlled values
        if (chatId !== null && chatId !== undefined) {
            // Ignore non-primitive values to avoid injecting query operators
            if (typeof chatId === 'object') {
                chatId = null;
            } else {
                chatId = String(chatId);
            }
        }

        if (level !== null && level !== undefined) {
            if (typeof level === 'object') {
                level = null;
            } else {
                level = String(level).toLowerCase();
            }
        }

        let storageLogs = [];
        let mongoLogs = [];
        let totalStorage = 0;
        let totalMongo = 0;

        // 1. Fetch from Storage (S3/FS)
        if (chatId) {
            try {
                // Get all keys for this chatId using Flydrive's listAll
                const listResult = await storageService.listAll(`${chatId}/`, { recursive: true });
                const files = [];

                for (const file of listResult.objects) {
                    if (file.isFile) {
                        files.push(file.key);
                    }
                }
                files.sort((a, b) => {
                    const timeA = parseInt(a.split('/').pop().replace('.json', '')) || 0;
                    const timeB = parseInt(b.split('/').pop().replace('.json', '')) || 0;
                    return timeB - timeA;
                });

                totalStorage = files.length;

                // Determine which keys to fetch based on pagination
                if (skip < totalStorage) {
                    const keysToFetch = files.slice(skip, skip + limit);
                    const itemPromises = keysToFetch.map(async k => {
                        const content = await storageService.get(k);
                        return content ? JSON.parse(content) : null;
                    });
                    storageLogs = (await Promise.all(itemPromises)).filter(Boolean).map(log => ({
                        ...log,
                        source: 'bucket'
                    }));
                }
            } catch (e) {
                console.error('Failed to fetch logs from storage:', e);
            }
        }

        // 2. Fetch from MongoDB (Legacy Fallback)
        // Only fetch if we haven't filled the limit with storage logs
        if (storageLogs.length < limit) {
            const mongoSkip = Math.max(0, skip - totalStorage);
            const mongoLimit = limit - storageLogs.length;

            await dbConnect();
            const query = {};
            if (level && level !== 'all') query.logLevel = level;
            if (chatId) query.chatId = chatId;

            mongoLogs = (await Logs.find(query)
                .sort({ createdAt: -1 })
                .skip(mongoSkip)
                .limit(mongoLimit)).map(l => {
                    const log = l.toObject ? l.toObject() : l;
                    return { ...log, source: 'database' };
                });

            totalMongo = await Logs.countDocuments(query);
        } else {
            // Just get count for total
            await dbConnect();
            const query = {};
            if (level && level !== 'all') query.logLevel = level;
            if (chatId) query.chatId = chatId;
            totalMongo = await Logs.countDocuments(query);
        }

        const combinedLogs = [...storageLogs, ...mongoLogs.map(l => l.toObject ? l.toObject() : l)];
        // Optional: Ensure overall sort if there's overlap in time (unlikely with this architecture)
        // combinedLogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return {
            logs: combinedLogs,
            total: totalStorage + totalMongo,
            hasMore: (totalStorage + totalMongo) > (skip + combinedLogs.length)
        };
    },

    info: async (message, chatId = 'system', data = {}) => {
        await ServerLoggingService.log('info', message, chatId, data);
    },

    debug: async (message, chatId = 'system', data = {}) => {
        await ServerLoggingService.log('debug', message, chatId, data);
    },

    warn: async (message, chatId = 'system', data = {}) => {
        await ServerLoggingService.log('warn', message, chatId, data);
    },

    error: async (message, chatId = 'system', error = null) => {
        const errorData = {
            error: error?.message || error,
            stack: error?.stack
        };
        await ServerLoggingService.log('error', message, chatId, errorData);
    }
};

export default ServerLoggingService;