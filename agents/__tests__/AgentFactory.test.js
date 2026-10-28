import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock the LLM constructors so no real network calls or env var checks happen
vi.mock('@langchain/openai', () => ({
    ChatOpenAI: vi.fn().mockImplementation(function ChatOpenAI() { return { _type: 'openai' }; }),
    AzureChatOpenAI: vi.fn().mockImplementation(function AzureChatOpenAI() {
        return { _type: 'azure', bindTools: (tools, options = {}) => ({ boundToolChoice: options.tool_choice ?? null }) };
    })
}));

vi.mock('@langchain/langgraph/prebuilt', () => ({
    createReactAgent: vi.fn(async ({ tools, llm }) => ({ tools, llm }))
}));

// Import AFTER mocking so the mocks are in place when AgentFactory initializes
const { createChatAgent, createQuestionVariationAgent, createRankerAgent, createSafetyLLM } = await import('../../agents/AgentFactory.js');
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

describe('createQuestionVariationAgent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses the Azure GPT-5 mini deployment', async () => {
        await createQuestionVariationAgent();

        expect(AzureChatOpenAI).toHaveBeenCalledTimes(1);
        expect(ChatOpenAI).not.toHaveBeenCalled();
        expect(AzureChatOpenAI.mock.calls[0][0]).toEqual(expect.objectContaining({
            model: 'gpt-5-mini',
            temperature: undefined,
            maxCompletionTokens: 4096
        }));
    });
});

describe('createRankerAgent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses GPT-5 mini with low reasoning for question-match verification', async () => {
        await createRankerAgent('openai-gpt51');

        expect(AzureChatOpenAI).toHaveBeenCalledTimes(1);
        expect(ChatOpenAI).not.toHaveBeenCalled();
        expect(AzureChatOpenAI.mock.calls[0][0]).toEqual(expect.objectContaining({
            azureOpenAIApiDeploymentName: 'openai-gpt5-mini',
            model: 'gpt-5-mini',
            reasoning: { effort: 'low' },
            temperature: undefined,
            maxCompletionTokens: 4096,
        }));
    });
});

describe('createChatAgent tools', () => {
    const toolNames = (agent) => agent.tools.map((tool) => tool.name);

    it('gives the answer agent the standard tools by default', async () => {
        const agent = await createChatAgent('openai-gpt51', 'chat-1');
        expect(toolNames(agent)).toEqual(['downloadWebPage', 'checkUrl', 'searchOpenData']);
    });

    it('adds retrievePassages only when passageTool is on', async () => {
        const off = await createChatAgent('azure', 'chat-1', { passageTool: false, lang: 'en' });
        expect(toolNames(off)).not.toContain('retrievePassages');

        const on = await createChatAgent('openai-gpt51', 'chat-1', { passageTool: true, lang: 'fr' });
        expect(toolNames(on)).toEqual(['downloadWebPage', 'checkUrl', 'searchOpenData', 'retrievePassages']);
    });

    it('lets the model choose its tools unless passages are forced', async () => {
        const agent = await createChatAgent('openai-gpt51', 'chat-1', { passageTool: true, lang: 'en' });
        expect(typeof agent.llm).not.toBe('function');
    });

    it('forces retrievePassages on the first call, then lets the model choose', async () => {
        const { ToolMessage, HumanMessage } = await import('@langchain/core/messages');
        const agent = await createChatAgent('openai-gpt51', 'chat-1', { passageTool: true, forcePassages: true, lang: 'en' });

        const first = agent.llm({ messages: [new HumanMessage('Q')] });
        expect(first.boundToolChoice).toBe('retrievePassages');

        const later = agent.llm({ messages: [new HumanMessage('Q'), new ToolMessage({ content: 'passages', tool_call_id: 'call-1' })] });
        expect(later.boundToolChoice).toBeNull();
    });

    it('refuses to force passages without the passage tool, or on the Claude agent', async () => {
        await expect(createChatAgent('openai-gpt51', 'chat-1', { passageTool: false, forcePassages: true, lang: 'en' }))
            .rejects.toThrow('forcePassages needs passageTool');
        await expect(createChatAgent('claude', 'chat-1', { passageTool: true, forcePassages: true, lang: 'en' }))
            .rejects.toThrow('only built for the Azure OpenAI agent');
    });
});
