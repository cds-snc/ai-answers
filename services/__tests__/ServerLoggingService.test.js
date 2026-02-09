import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Storage before importing ServerLoggingService
const mockStorage = {
    put: vi.fn(),
    listAll: vi.fn(),
    get: vi.fn(),
};

vi.mock('../Storage.js', () => ({
    default: mockStorage
}));

// Mock db-connect
vi.mock('../../api/db/db-connect.js', () => ({
    default: vi.fn(),
}));

// Mock Logs model
const mockLogsFind = vi.fn();
const mockLogsCountDocuments = vi.fn();
vi.mock('../../models/logs.js', () => ({
    Logs: {
        find: () => ({
            sort: () => ({
                skip: () => ({
                    limit: () => mockLogsFind(),
                }),
            }),
        }),
        countDocuments: mockLogsCountDocuments,
    },
}));

// Mock SettingsService
vi.mock('../SettingsService.js', () => ({
    SettingsService: {
        get: vi.fn(() => 'yes'),
    },
}));

describe('ServerLoggingService', () => {
    let ServerLoggingService;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Reset console mocks
        vi.spyOn(console, 'info').mockImplementation(() => { });
        vi.spyOn(console, 'debug').mockImplementation(() => { });
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });

        // Dynamic import to get fresh instance
        const module = await import('../ServerLoggingService.js');
        ServerLoggingService = module.default;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('log (write to storage)', () => {
        it('should write log entry to Storage with correct key format: chatId/interactionId/timestamp.json', async () => {
            mockStorage.put.mockResolvedValue(undefined);

            await ServerLoggingService.log('info', 'Test message', 'chat-123', { interactionId: 'int-456' });

            // Allow queue processing
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockStorage.put).toHaveBeenCalledTimes(1);
            const [key, value] = mockStorage.put.mock.calls[0];

            // Key format: {chatId}/{interactionId}/{timestamp}.json
            expect(key).toMatch(/^chat-123\/int-456\/\d+\.json$/);
            expect(JSON.parse(value)).toMatchObject({
                chatId: 'chat-123',
                logLevel: 'info',
                message: 'Test message',
            });
            expect(JSON.parse(value).createdAt).toBeDefined();
        });

        it('should use "system" as interactionId when not provided', async () => {
            mockStorage.put.mockResolvedValue(undefined);

            await ServerLoggingService.log('info', 'System message', 'chat-123', {});

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockStorage.put).toHaveBeenCalledTimes(1);
            const [key] = mockStorage.put.mock.calls[0];

            // Key format: {chatId}/system/{timestamp}.json
            expect(key).toMatch(/^chat-123\/system\/\d+\.json$/);
        });

        it('should fallback to "info" for invalid log level', async () => {
            mockStorage.put.mockResolvedValue(undefined);
            const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => { });

            await ServerLoggingService.log('dangerousMethod', 'Safe message', 'chat-123', {});

            await new Promise(resolve => setTimeout(resolve, 100));

            // Should have called console.info as fallback
            expect(infoSpy).toHaveBeenCalled();

            // Should have used 'info' in storage
            const [key, value] = mockStorage.put.mock.calls[0];
            expect(JSON.parse(value).logLevel).toBe('info');
        });

        it('should NOT write to storage for "system" chatId', async () => {
            await ServerLoggingService.log('info', 'System log', 'system', {});

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockStorage.put).not.toHaveBeenCalled();
        });

        it('should NOT write to storage when chatId is null', async () => {
            await ServerLoggingService.log('info', 'No chat log', null, {});

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockStorage.put).not.toHaveBeenCalled();
        });
    });

    describe('getLogs (read from storage with MongoDB fallback)', () => {
        it('should merge storage logs with MongoDB legacy logs', async () => {
            const storageLogs = [
                { chatId: 'chat-123', logLevel: 'info', message: 'New log', createdAt: '2026-02-06T15:00:00.000Z' },
            ];
            const mongoLogs = [
                {
                    chatId: 'chat-123',
                    logLevel: 'warn',
                    message: 'Legacy log',
                    createdAt: new Date('2026-02-05T10:00:00.000Z'),
                    toObject: () => ({
                        chatId: 'chat-123',
                        logLevel: 'warn',
                        message: 'Legacy log',
                        createdAt: '2026-02-05T10:00:00.000Z'
                    })
                },
            ];

            mockStorage.listAll.mockResolvedValue({ objects: [{ key: 'chat-123/int-1/1707231600000.json' }] });
            mockStorage.get.mockResolvedValue(JSON.stringify(storageLogs[0]));
            mockLogsFind.mockResolvedValue(mongoLogs);
            mockLogsCountDocuments.mockResolvedValue(1);

            const result = await ServerLoggingService.getLogs({ chatId: 'chat-123' });

            expect(mockStorage.listAll).toHaveBeenCalledWith('chat-123/');
            expect(result.logs).toHaveLength(2);
            // Should be sorted by createdAt descending (newest first)
            expect(result.logs[0].message).toBe('New log');
            expect(result.logs[0].source).toBe('bucket');
            expect(result.logs[1].message).toBe('Legacy log');
            expect(result.logs[1].source).toBe('database');
        });

        it('should return only MongoDB logs if storage has no keys', async () => {
            const mongoLogs = [
                {
                    chatId: 'chat-123',
                    logLevel: 'info',
                    message: 'Only legacy',
                    createdAt: new Date('2026-02-01T00:00:00.000Z'),
                    toObject: () => ({
                        chatId: 'chat-123',
                        logLevel: 'info',
                        message: 'Only legacy',
                        createdAt: '2026-02-01T00:00:00.000Z'
                    })
                },
            ];

            mockStorage.listAll.mockResolvedValue({ objects: [] });
            mockLogsFind.mockResolvedValue(mongoLogs);
            mockLogsCountDocuments.mockResolvedValue(1);

            const result = await ServerLoggingService.getLogs({ chatId: 'chat-123' });

            expect(result.logs).toHaveLength(1);
            expect(result.logs[0].message).toBe('Only legacy');
            expect(result.logs[0].source).toBe('database');
        });

        it('should return only storage logs if MongoDB has none', async () => {
            const storageLogs = [
                { chatId: 'chat-123', logLevel: 'debug', message: 'Storage only', createdAt: '2026-02-06T12:00:00.000Z' },
            ];

            mockStorage.listAll.mockResolvedValue({ objects: [{ key: 'chat-123/int-1/1707220800000.json' }] });
            mockStorage.get.mockResolvedValue(JSON.stringify(storageLogs[0]));
            mockLogsFind.mockResolvedValue([]);
            mockLogsCountDocuments.mockResolvedValue(0);

            const result = await ServerLoggingService.getLogs({ chatId: 'chat-123' });

            expect(result.logs).toHaveLength(1);
            expect(result.logs[0].message).toBe('Storage only');
            expect(result.logs[0].source).toBe('bucket');
        });

        it('should handle storage errors gracefully and fall back to MongoDB', async () => {
            const mongoLogs = [
                {
                    chatId: 'chat-123',
                    logLevel: 'error',
                    message: 'Fallback',
                    createdAt: new Date('2026-02-04T00:00:00.000Z'),
                    toObject: () => ({
                        chatId: 'chat-123',
                        logLevel: 'error',
                        message: 'Fallback',
                        createdAt: '2026-02-04T00:00:00.000Z'
                    })
                },
            ];

            mockStorage.listAll.mockRejectedValue(new Error('S3 unavailable'));
            mockLogsFind.mockResolvedValue(mongoLogs);
            mockLogsCountDocuments.mockResolvedValue(1);

            const result = await ServerLoggingService.getLogs({ chatId: 'chat-123' });

            expect(result.logs).toHaveLength(1);
            expect(result.logs[0].message).toBe('Fallback');
            expect(result.logs[0].source).toBe('database');
        });
    });

    describe('convenience methods', () => {
        it('info() should call log with "info" level', async () => {
            mockStorage.put.mockResolvedValue(undefined);
            const logSpy = vi.spyOn(ServerLoggingService, 'log');

            await ServerLoggingService.info('Info message', 'chat-1', { key: 'value' });

            expect(logSpy).toHaveBeenCalledWith('info', 'Info message', 'chat-1', { key: 'value' });
        });

        it('debug() should call log with "debug" level', async () => {
            mockStorage.put.mockResolvedValue(undefined);
            const logSpy = vi.spyOn(ServerLoggingService, 'log');

            await ServerLoggingService.debug('Debug message', 'chat-2', {});

            expect(logSpy).toHaveBeenCalledWith('debug', 'Debug message', 'chat-2', {});
        });

        it('warn() should call log with "warn" level', async () => {
            mockStorage.put.mockResolvedValue(undefined);
            const logSpy = vi.spyOn(ServerLoggingService, 'log');

            await ServerLoggingService.warn('Warn message', 'chat-3', {});

            expect(logSpy).toHaveBeenCalledWith('warn', 'Warn message', 'chat-3', {});
        });

        it('error() should call log with "error" level and error details', async () => {
            mockStorage.put.mockResolvedValue(undefined);
            const logSpy = vi.spyOn(ServerLoggingService, 'log');
            const testError = new Error('Test error');

            await ServerLoggingService.error('Error occurred', 'chat-4', testError);

            expect(logSpy).toHaveBeenCalledWith('error', 'Error occurred', 'chat-4', {
                error: 'Test error',
                stack: testError.stack,
            });
        });
    });
});
