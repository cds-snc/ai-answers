import { Logs } from '../models/logs.js';
import dbConnect from '../api/db//db-connect.js';
import { SettingsService } from './SettingsService.js';
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

        // Only save to DB if chatId is present and not "system"
        if (!chatId || chatId === 'system') {
            // Do not save to DB, just log to console
            return;
        }

        try {
            await dbConnect();
            // If data is null/undefined, use empty string, otherwise process it
            const processedData = data ? safeStringify(data) : '';

            // Try to parse back to an object if processedData starts as JSON; otherwise keep string
            let metadata;
            try {
                metadata = processedData && processedData[0] === '{' ? JSON.parse(processedData) : processedData;
            } catch (e) {
                metadata = processedData;
            }

            const log = new Logs({
                chatId,
                logLevel: level,
                message: typeof message === 'object' ? safeStringify(message) : message,
                metadata
            });
            await log.save();
        } catch (error) {
            console.error('Failed to save log to database:', error);
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
        const logChatsSetting = SettingsService.get('logChatsToDatabase');
        console[level](`[${level.toUpperCase()}][${chatId}] ${message}`, data);
        if (logChatsSetting !== 'no') {
            // Log directly to console and bypass queue
            logQueue.add({ level, message, chatId, data });

        }

    },

    getLogs: async ({ level = null, chatId = null, skip = 0, limit = 100 }) => {
        await dbConnect();

        const query = {};

        if (level && level !== 'all') {
            query.logLevel = level;
        }

        if (chatId) {
            query.chatId = chatId;
        }

        const logs = await Logs.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Logs.countDocuments(query);
        const hasMore = total > skip + logs.length;

        return {
            logs,
            total,
            hasMore
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