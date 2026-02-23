import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ExperimentalQueueService from '../ExperimentalQueueService.js';

// Mock environment to ensure in-memory mode
vi.stubEnv('REDIS_URL', '');

describe('ExperimentalQueueService (In-Memory)', () => {
    const queueName = 'test-queue';

    beforeEach(async () => {
        // Clean up
        await ExperimentalQueueService.close();
        ExperimentalQueueService.queues.clear();
        ExperimentalQueueService.workers.clear();
        ExperimentalQueueService.inMemoryQueues.clear();
    });

    it('should create an in-memory queue', () => {
        const queue = ExperimentalQueueService.createQueue(queueName);
        expect(queue).toBeDefined();
        expect(ExperimentalQueueService.inMemoryQueues.has(queueName)).toBe(true);
    });

    it('should register a processor and process a job', async () => {
        const jobData = { foo: 'bar' };
        const processor = vi.fn().mockResolvedValue('success');

        // Register processor first
        ExperimentalQueueService.registerProcessor(queueName, processor);

        // Subscribe to events
        const completedPromise = new Promise(resolve => {
            ExperimentalQueueService.once('completed', resolve);
        });

        // Enqueue
        await ExperimentalQueueService.enqueue(queueName, jobData);

        // Wait for completion
        const event = await completedPromise;

        expect(processor).toHaveBeenCalled();
        const calledArg = processor.mock.calls[0][0];
        // Ensure the job argument passed to processor has a BullMQ-like structure
        expect(calledArg).toHaveProperty('data', jobData);
        expect(calledArg).toHaveProperty('id');
        expect(calledArg).toHaveProperty('name', queueName);

        // Ensure the emitted 'completed' event matches what BullMQ consumers expect
        expect(event).toHaveProperty('queueName', queueName);
        expect(event).toHaveProperty('jobId');
        expect(event).toHaveProperty('returnvalue', 'success');
    });

    it('should handle failed jobs', async () => {
        const processor = vi.fn().mockRejectedValue(new Error('Job failed'));
        ExperimentalQueueService.registerProcessor(queueName, processor);

        const failedPromise = new Promise(resolve => {
            ExperimentalQueueService.once('failed', resolve);
        });

        try {
            await ExperimentalQueueService.enqueue(queueName, { fail: true });
        } catch (e) {
            // Enqueue might throw if p-queue throws, but we want to catch the emitted event
        }

        const event = await failedPromise;
        expect(event).toMatchObject({
            queueName,
            failedReason: 'Job failed'
        });
    });
});
