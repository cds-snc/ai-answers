import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChatSessionService from '../ChatSessionService.js';
import { SettingsService } from '../SettingsService.js';
import { SessionState } from '../../models/sessionState.js';

// Mock dependencies
vi.mock('../SettingsService.js', () => ({
    SettingsService: {
        get: vi.fn(),
    },
}));

vi.mock('../../api/db/db-connect.js', () => ({
    default: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../models/sessionState.js', () => ({
    SessionState: {
        findOne: vi.fn(),
        findOneAndUpdate: vi.fn(),
        deleteOne: vi.fn(),
    },
}));

vi.mock('../../middleware/rate-limiter.js', () => ({
    rateLimiters: {
        public: { get: vi.fn() },
        auth: { get: vi.fn() }
    }
}));

describe('SessionManagementService - Lambda Persistence', () => {
    const mockSessionId = 'test-session-id';
    const mockChatId = 'test-chat-id';

    beforeEach(() => {
        vi.clearAllMocks();
        ChatSessionService.shutdown();

        // Default settings
        SettingsService.get.mockImplementation((key) => {
            if (key === 'session.persistence') return 'mongo';
            if (key === 'session.managementEnabled') return 'true';
            return null;
        });
    });

    it('should load session from DB if missing from memory during registerChat', async () => {
        // Setup: Session exists in DB but not in memory
        const dbSession = {
            sessionId: mockSessionId,
            chatIds: [mockChatId],
            createdAt: new Date(),
            lastSeen: new Date(),
            ttl: 3600000,
            isAuthenticated: false,
            requestCount: 5,
            errorCount: 0,
            totalLatencyMs: 1000,
            lastLatencyMs: 200,
            requestTimestamps: [],
            errorTypes: {},
            chatMetrics: {}
        };

        // Mock the Mongoose query chain - findOne().lean()
        SessionState.findOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue(dbSession)
        });
        SessionState.findOneAndUpdate.mockResolvedValue(dbSession);

        // Act: Register with the existing sessionId
        const result = await ChatSessionService.registerChat(mockSessionId);

        // Assert
        expect(result.ok).toBe(true);
        expect(SessionState.findOne).toHaveBeenCalledWith({ sessionId: mockSessionId });
        // Should have loaded the chatIds from DB
        expect(result.session.chatIds).toContain(mockChatId);
        // Should have restored request count
        expect(result.session.requestCount).toBe(5);
    });

    it('should create new session if not in DB', async () => {
        // Setup: Session does not exist in DB
        SessionState.findOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue(null)
        });
        SessionState.findOneAndUpdate.mockResolvedValue(null);

        // Act
        const result = await ChatSessionService.registerChat(mockSessionId);

        // Assert
        expect(result.ok).toBe(true);
        expect(SessionState.findOne).toHaveBeenCalledWith({ sessionId: mockSessionId });
        // Should be a new session
        expect(result.session.chatIds).toEqual([]);
    });

    it('should sync session from express-session', async () => {
        const expressSession = {
            user: { id: 'user1' },
            chatIds: ['chat1']
        };

        await ChatSessionService.syncSession(expressSession, mockSessionId);

        const info = await ChatSessionService.getInfo(mockSessionId);
        expect(info).toBeDefined();
        expect(info.isAuthenticated).toBe(true);
        expect(info.chatIds).toContain('chat1');
    });
});
