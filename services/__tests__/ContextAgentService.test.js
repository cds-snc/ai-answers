import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokeContextAgent } from '../ContextAgentService.js';
import { createContextAgent } from '../../agents/AgentFactory.js';

vi.mock('../../agents/AgentFactory.js');
vi.mock('../../agents/prompts/contextSystemPrompt.js', () => ({
  default: vi.fn(async () => 'SYSTEM PROMPT'),
}));
vi.mock('../ServerLoggingService.js');

// Captures the messages array handed to the agent so we can assert on the tags it carries.
let capturedMessages;

const agentResponse = {
  messages: [
    {
      content: '<department>PrairiesCan</department>',
      response_metadata: {
        role: 'assistant',
        usage: {},
        tokenUsage: { promptTokens: 10, completionTokens: 5 },
        model_name: 'gpt-5.1',
      },
    },
  ],
};

const invokeWith = (overrides = {}) =>
  invokeContextAgent('openai', {
    chatId: 'test-chat-id',
    message: 'How do I apply for funding?',
    searchResults: 'some results',
    ...overrides,
  });

const currentUserMessage = () => capturedMessages[capturedMessages.length - 1];

describe('ContextAgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedMessages = null;
    createContextAgent.mockResolvedValue({
      invoke: vi.fn(async ({ messages }) => {
        capturedMessages = messages;
        return agentResponse;
      }),
    });
  });

  describe('referring URL', () => {
    it('appends a <referring-url> tag to the current user message', async () => {
      const referringUrl =
        'https://test.canada.ca/experimental/en/aia/prairies-economic-development.html';

      await invokeWith({ referringUrl });

      expect(currentUserMessage()).toEqual({
        role: 'user',
        content: `How do I apply for funding?\n<referring-url>${referringUrl}</referring-url>`,
      });
    });

    it('trims surrounding whitespace from the referring URL', async () => {
      await invokeWith({ referringUrl: '  https://www.canada.ca/en/services.html\n' });

      expect(currentUserMessage().content).toBe(
        'How do I apply for funding?\n<referring-url>https://www.canada.ca/en/services.html</referring-url>'
      );
    });

    it.each([
      ['undefined', undefined],
      ['an empty string', ''],
      ['whitespace only', '   '],
    ])('emits no tag when the referring URL is %s', async (_label, referringUrl) => {
      await invokeWith({ referringUrl });

      expect(currentUserMessage().content).toBe('How do I apply for funding?');
      expect(currentUserMessage().content).not.toContain('<referring-url>');
    });

    it('tags only the current message, never conversation history', async () => {
      await invokeWith({
        referringUrl: 'https://www.canada.ca/en/services.html',
        conversationHistory: [
          {
            interaction: {
              question: 'Earlier question',
              answer: { content: 'Earlier answer' },
            },
          },
        ],
      });

      const historyMessages = capturedMessages.filter((m) => m !== currentUserMessage());
      historyMessages.forEach((m) => {
        expect(m.content).not.toContain('<referring-url>');
      });
      expect(currentUserMessage().content).toContain('<referring-url>');
    });
  });

  // Regression: a user-sender entry should never carry `.interaction` at all
  // (src/components/chat/ChatAppContainer.js gives it a plain
  // questionLanguage string instead) - but the one time that contract was
  // silently broken, the user bubble and its paired AI bubble both carried
  // the same `.interaction` object, and this file's only guard was
  // `!entry.interaction`, which both entries satisfied - so every historical
  // turn was pushed here twice.
  it('does not double-count a turn when a user-sender entry also carries the same interaction as its paired AI entry', async () => {
    const sharedInteraction = {
      question: 'Earlier question',
      answer: { content: 'Earlier answer' },
    };

    await invokeWith({
      conversationHistory: [
        { sender: 'user', text: 'Earlier question', interaction: sharedInteraction },
        { sender: 'ai', interaction: sharedInteraction },
      ],
    });

    const historyMessages = capturedMessages.filter((m) => m !== currentUserMessage() && m.role !== 'system');
    expect(historyMessages).toEqual([
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
    ]);
  });

  it('still processes an unlabelled (no sender field) history entry that carries an interaction, for backward compatibility', async () => {
    await invokeWith({
      conversationHistory: [
        {
          interaction: {
            question: 'Earlier question',
            answer: { content: 'Earlier answer' },
          },
        },
      ],
    });

    const historyMessages = capturedMessages.filter((m) => m !== currentUserMessage() && m.role !== 'system');
    expect(historyMessages).toEqual([
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
    ]);
  });

  it('passes search results to the system message', async () => {
    await invokeWith({ referringUrl: 'https://www.canada.ca/en/services.html' });

    expect(capturedMessages[0]).toEqual({
      role: 'system',
      content: 'SYSTEM PROMPT<searchResults>some results</searchResults>',
    });
  });
});
