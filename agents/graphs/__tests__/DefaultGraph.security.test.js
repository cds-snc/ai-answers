import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDefaultGraph } from '../DefaultGraph.js';
import { logGraphEvent } from '../GraphEventLogger.js';
import { GraphWorkflowHelper } from '../workflows/GraphWorkflowHelper.js';
import { redactionService } from '../services/redactionService.js';

vi.mock('../GraphEventLogger.js', () => ({
    logGraphEvent: vi.fn(),
    default: { logGraphEvent: vi.fn() }
}));

vi.mock('../workflows/GraphWorkflowHelper.js', () => {
    return {
        GraphWorkflowHelper: vi.fn().mockImplementation(() => ({
            validateShortQuery: vi.fn(),
            processRedaction: vi.fn().mockResolvedValue({
                redactedText: '[REDACTED]',
                redactedItems: [{ type: 'private', match: 'secret' }]
            }),
            translateQuestion: vi.fn().mockResolvedValue({
                translatedText: '[TRANSLATED]',
                originalLanguage: 'en'
            }),
            getContextForFlow: vi.fn().mockResolvedValue({
                context: { searchQuery: 'query' },
                usedExistingContext: false
            }),
            sendAnswerRequest: vi.fn().mockResolvedValue({
                content: 'Answer',
                answerType: 'normal'
            }),
            verifyCitation: vi.fn().mockResolvedValue({
                url: 'http://citation.com'
            }),
            persistInteraction: vi.fn()
        }))
    };
});

describe('DefaultGraph Security Regression', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should never pass raw userMessage to logGraphEvent in any node', async () => {
        const sensitiveMessage = 'MY_PRIVATE_PII_12345';
        const input = {
            chatId: 'test-chat',
            userMessage: sensitiveMessage,
            lang: 'en',
            selectedAI: 'gpt-4'
        };

        try {
            await runDefaultGraph(input);
        } catch (e) {
            // Some nodes might fail due to mocks, but we only care about log calls
        }

        // Check all logGraphEvent calls
        logGraphEvent.mock.calls.forEach(call => {
            const dataArg = call[3]; // The 4th argument is 'data'
            if (dataArg && typeof dataArg === 'object') {
                const serialized = JSON.stringify(dataArg);
                expect(serialized, `Log call for ${call[1]} contains sensitive data`).not.toContain(sensitiveMessage);
            }
        });
    });
});
