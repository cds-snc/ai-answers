import { Queue, Worker } from 'bullmq';
import PQueue from 'p-queue';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

const useRedis = !!process.env.REDIS_URL;

class ExperimentalQueueService extends EventEmitter {
    constructor() {
        super();
        this.queues = new Map();
        this.workers = new Map();
        this.inMemoryQueues = new Map(); // Store PQueue instances
    }

    /**
     * Create or retrieve a queue
     * @param {string} name 
     * @param {object} options 
     */
    createQueue(name, options = {}) {
        if (this.queues.has(name)) return this.queues.get(name);

        if (useRedis) {
            const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
            const queue = new Queue(name, { connection, ...options });
            this.queues.set(name, queue);
            return queue;
        } else {
            // In-memory fallback using p-queue
            // PQueue is for concurrency control, not a persistent store, but suitable for dev
            const queue = new PQueue({ concurrency: options.concurrency || 1 });
            this.inMemoryQueues.set(name, queue);
            this.queues.set(name, { type: 'memory', instance: queue });
            return queue;
        }
    }

    /**
     * Add a job to the queue
     * @param {string} queueName 
     * @param {object} data 
     * @param {object} options 
     */
    async enqueue(queueName, data, options = {}) {
        let queue = this.queues.get(queueName);
        if (!queue) {
            queue = this.createQueue(queueName);
        }

        if (useRedis) {
            const jobName = options.jobId || `job-${Date.now()}`;
            return await queue.add(jobName, data, options);
        } else {
            // For in-memory, we can't really "return a job" in the same way BullMQ does
            // We'll simulate a job ID
            const jobId = options.jobId || `mem-job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // If a processor is strictly registered *after* enqueue in p-queue, it might process immediately if idle.
            // But standard PQueue usage is: `queue.add(() => task())`.
            // Since we want to decouple "enqueue" from "processor", we need a mechanism.
            // In-memory mode limitation: Processor must be registered BEFORE enqueue or we need a buffer.
            // For simplicity in this experimental phase: assume processor is registered, or we store tasks in a buffer array if needed?
            // Actually, PQueue .add() takes a function.

            // We need to find the processor for this queue
            const worker = this.workers.get(queueName);
            if (worker && worker.type === 'memory') {
                const queueInstance = this.inMemoryQueues.get(queueName);

                // Wrap the processor fn
                const jobWrapper = async () => {
                    try {
                        this.emit('active', { queueName, jobId });
                        const result = await worker.processor({ data, id: jobId, name: queueName });
                        this.emit('completed', { queueName, jobId, returnvalue: result });
                        return result;
                    } catch (err) {
                        this.emit('failed', { queueName, jobId, failedReason: err.message });
                        throw err;
                    }
                };

                return queueInstance.add(jobWrapper, { priority: options.priority });
            } else {
                // No worker registered yet?
                // In BullMQ you can add jobs before workers. In PQueue (wrapped) we can't easily do that without a custom buffer.
                // For this Experimental service, we will enforce: Register Processor FIRST for in-memory mode, 
                // OR we just store it in a simplified buffer if needed. 
                // Let's throw a warning or handle it.
                console.warn(`[ExperimentalQueueService] In-memory queue '${queueName}' has no processor registered yet. Job ${jobId} dropped or deferred (not implemented). Register processor first!`);
                // Ideally we'd push to a pending array, but for now let's assume startup registers queues.
            }
            return { id: jobId, data };
        }
    }

    /**
     * Register a worker/processor for a queue
     * @param {string} queueName 
     * @param {function} processorFn 
     * @param {object} options 
     */
    registerProcessor(queueName, processorFn, options = {}) {
        if (useRedis) {
            const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
            const worker = new Worker(queueName, processorFn, {
                connection,
                concurrency: options.concurrency || 1,
                ...options
            });

            worker.on('completed', (job) => {
                this.emit('completed', { queueName, jobId: job.id, returnvalue: job.returnvalue });
            });
            worker.on('failed', (job, err) => {
                this.emit('failed', { queueName, jobId: job.id, failedReason: err.message });
            });

            this.workers.set(queueName, worker);
            return worker;
        } else {
            // In-memory
            // Check if queue exists, if not create
            if (!this.inMemoryQueues.has(queueName)) {
                // Use concurrency from options
                this.createQueue(queueName, { concurrency: options.concurrency || 1 });
            } else {
                // update concurrency if needed? PQueue allows setting concurrency dynamically
                const q = this.inMemoryQueues.get(queueName);
                if (options.concurrency) q.concurrency = options.concurrency;
            }

            this.workers.set(queueName, { type: 'memory', processor: processorFn });
            return { type: 'memory' };
        }
    }

    async close() {
        if (useRedis) {
            for (const worker of this.workers.values()) {
                await worker.close();
            }
            for (const queue of this.queues.values()) {
                await queue.close();
            }
        } else {
            this.inMemoryQueues.forEach(q => q.clear());
        }
    }
}

export default new ExperimentalQueueService();
