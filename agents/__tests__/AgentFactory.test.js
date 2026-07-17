import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock the LLM constructors so no real network calls or env var checks happen
vi.mock('@langchain/openai', () => ({
    ChatOpenAI: vi.fn().mockImplementation(function ChatOpenAI() { return { _type: 'openai' }; }),
    AzureChatOpenAI: vi.fn().mockImplementation(function AzureChatOpenAI() { return { _type: 'azure' }; })
}));

// Import AFTER mocking so the mocks are in place when AgentFactory initializes
const { createSafetyLLM } = await import('../../agents/AgentFactory.js');
const { ChatOpenAI, AzureChatOpenAI } = await import('@langchain/openai');

describe('createSafetyLLM', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('defaults to azure when called with no arguments', async () => {
        // REGRESSION TEST: Before the fix, the default was 'openai' which caused
        // "Missing credentials. Please pass an `apiKey`, or set the `OPENAI_API_KEY`
        //  environment variable." in Azure-only environments (no OPENAI_API_KEY set).
        // This test would have FAILED before changing the default to 'azure'.
        await createSafetyLLM();

        expect(AzureChatOpenAI).toHaveBeenCalledTimes(1);
        expect(ChatOpenAI).not.toHaveBeenCalled();
    });

    it('uses OpenAI when explicitly requested', async () => {
        await createSafetyLLM('openai');

        expect(ChatOpenAI).toHaveBeenCalledTimes(1);
        expect(AzureChatOpenAI).not.toHaveBeenCalled();
    });

    it('uses Azure when explicitly requested', async () => {
        await createSafetyLLM('azure');

        expect(AzureChatOpenAI).toHaveBeenCalledTimes(1);
        expect(ChatOpenAI).not.toHaveBeenCalled();
    });

    it('uses GPT-5 mini without forcing temperature', async () => {
        await createSafetyLLM('openai-gpt5-mini');

        expect(AzureChatOpenAI).toHaveBeenCalledTimes(1);
        expect(ChatOpenAI).not.toHaveBeenCalled();
        expect(AzureChatOpenAI.mock.calls[0][0]).toEqual(expect.objectContaining({
            model: 'gpt-5-mini',
            temperature: undefined,
            maxCompletionTokens: 4096
        }));
    });

    it('throws for unknown provider', async () => {
        await expect(createSafetyLLM('unknown-provider'))
            .rejects.toThrow('Unknown agent type for safety: unknown-provider');
    });
});
