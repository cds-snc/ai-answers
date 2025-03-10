import { Logs } from '../models/logs.js';
import dbConnect from '../api/db//db-connect.js';

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
        console[level](`[${level.toUpperCase()}][${chatId}] ${message}`, data);
        
        try {
            await dbConnect();
            // If data is null/undefined, use empty string, otherwise process it
            const processedData = data ? JSON.stringify(data) : '';
            const parsedData = processedData ? JSON.parse(processedData) : '';
            
            const log = new Logs({
                chatId,
                logLevel: level,
                message: typeof message === 'object' ? JSON.stringify(message) : message,
                metadata: parsedData
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
    log: (level, message, chatId = 'system', data = {}) => {
        logQueue.add({ level, message, chatId, data });
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

    info: (message, chatId = 'system', data = {}) => {
        ServerLoggingService.log('info', message, chatId, data);
    },

    debug: (message, chatId = 'system', data = {}) => {
        ServerLoggingService.log('debug', message, chatId, data);
    },

    warn: (message, chatId = 'system', data = {}) => {
        ServerLoggingService.log('warn', message, chatId, data);
    },

    error: (message, chatId = 'system', error = null) => {
        const errorData = {
            error: error?.message || error,
            stack: error?.stack
        };
        ServerLoggingService.log('error', message, chatId, errorData);
    }
};

export default ServerLoggingService;