import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChatSessionService from '../ChatSessionService.js';
import ChatSessionMetricsService from '../ChatSessionMetricsService.js';
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
        find: vi.fn(),
        findOneAndUpdate: vi.fn(),
        deleteOne: vi.fn(),
        countDocuments: vi.fn(),
        updateMany: vi.fn(),
        exists: vi.fn(),
    },
}));

vi.mock('../../middleware/rate-limiter.js', () => ({
    rateLimiters: {
        public: { get: vi.fn() },
        auth: { get: vi.fn() }
    },
    getRateLimiterConfig: vi.fn(() => ({
        authCapacity: 100,
        publicCapacity: 10
    }))
}));

describe('SessionManagementService - Lambda Persistence', () => {
    const mockSessionId = 'test-session-id';
    const mockChatId = 'test-chat-id';

    beforeEach(() => {
        vi.clearAllMocks();
        ChatSessionService.shutdown();
        ChatSessionMetricsService.metricsBuffer.clear();
        ChatSessionMetricsService.chatToSession.clear();

        // Default settings
        SettingsService.get.mockImplementation((key) => {
            if (key === 'metrics.type') return 'mongo';
            if (key === 'session.type') return 'mongo';
            if (key === 'session.managementEnabled') return 'true';
            if (key === 'session.defaultTTLMinutes') return '10';
            return null;
        });
    });

    it('should track session metrics when chat is registered', async () => {
        // Act: Register a chat with a session
        ChatSessionMetricsService.registerChat(mockSessionId, mockChatId);

        // Assert
        expect(ChatSessionMetricsService.chatToSession.get(mockChatId)).toBe(mockSessionId);
        expect(ChatSessionMetricsService.metricsBuffer.has(mockSessionId)).toBe(true);
        const metrics = ChatSessionMetricsService.metricsBuffer.get(mockSessionId);
        expect(metrics.chatIds.has(mockChatId)).toBe(true);
    });

    it('should check if session is active', async () => {
        SessionState.exists.mockResolvedValue(true);

        // Act
        const isActive = await ChatSessionService.isSessionActive(mockSessionId);

        // Assert
        expect(isActive).toBe(true);
        expect(SessionState.exists).toHaveBeenCalled();
    });

    it('should count active sessions from database', async () => {
        SessionState.countDocuments.mockResolvedValue(5);

        // Act
        const count = await ChatSessionService.getActiveSessionsCount();

        // Assert
        expect(count).toBe(5);
        expect(SessionState.countDocuments).toHaveBeenCalled();
    });
});
