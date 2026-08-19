import { describe, it, expect, vi, beforeEach } from 'vitest';
// Ensure middleware and DB connect are mocked before the handler is imported
vi.mock('../middleware/auth.js', () => ({
  withProtection: (handler) => handler,
  authMiddleware: {},
  partnerOrAdminMiddleware: {}
}));
vi.mock('../api/db/db-connect.js', () => ({
  __esModule: true,
  default: async () => Promise.resolve()
}));
import * as ChatModel from '../models/chat.js';
let handler;

describe('api/chat/chat-dashboard filter handling', () => {
  let originalAggregate;

  beforeEach(async () => {
    // preserve original if present
    originalAggregate = ChatModel.Chat && ChatModel.Chat.aggregate;
    // stub aggregate to capture pipeline
    ChatModel.Chat.aggregate = vi.fn();
    // import handler after mocks are in place
    const mod = await import('../api/chat/chat-dashboard.js');
    handler = mod && (mod.default || mod);
  });

  it('includes referringUrl match when `referringUrl` query param is provided', async () => {
    let capturedPipeline;
    // First call (results) should capture pipeline
    ChatModel.Chat.aggregate.mockImplementationOnce((pipeline) => {
      capturedPipeline = pipeline;
      return { allowDiskUse: () => Promise.resolve([]) };
    });
    // Second call (count) return empty count
    ChatModel.Chat.aggregate.mockImplementationOnce(() => ({ allowDiskUse: () => Promise.resolve([]) }));

    const req = {
      method: 'GET',
      query: {
        referringUrl: 'example.com',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString()
      }
    };

    const res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res)
    };

    try {
      await handler(req, res);
    } catch (e) {
      // Handler may throw due to DB/auth; ignore as long as aggregate was invoked
    }

    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    // Expect a $match stage that filters on interactions.referringUrl
    const hasRefMatch = Array.isArray(capturedPipeline) && capturedPipeline.some(stage => {
      if (!stage || typeof stage !== 'object') return false;
      if (stage.$match && stage.$match.$and) {
        return stage.$match.$and.some(cond => cond['interactions.referringUrl']);
      }
      return false;
    });

    expect(hasRefMatch).toBe(true);
  });

  // Chat Dashboard now returns one row per interaction (question/answer
  // pair) rather than one row per chat, so there's no cross-interaction
  // "primary department" pick anymore — department is a direct per-row
  // field reference.
  it('should project department as a direct per-interaction field reference', async () => {
    let capturedPipeline;
    ChatModel.Chat.aggregate.mockImplementationOnce((pipeline) => {
      capturedPipeline = pipeline;
      return { allowDiskUse: () => Promise.resolve([]) };
    });
    ChatModel.Chat.aggregate.mockImplementationOnce(() => ({ allowDiskUse: () => Promise.resolve([]) }));

    const req = {
      method: 'GET',
      query: {
        department: 'IRCC',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString()
      }
    };

    const res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res)
    };

    try {
      await handler(req, res);
    } catch (e) {
      // ignore errors as long as aggregate was invoked
    }

    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();

    const finalProject = Array.isArray(capturedPipeline) && capturedPipeline.find(stage =>
      stage && stage.$project && stage.$project.department
    );

    expect(finalProject).toBeDefined();
    expect(finalProject.$project.department).toBe('$interactions.department');
    // program (the "Service" column) is projected alongside department
    expect(finalProject.$project.program).toBe('$interactions.program');
  });

  it('should add redactedQuestion onto interactions via $addFields', async () => {
    let capturedPipeline;
    ChatModel.Chat.aggregate.mockImplementationOnce((pipeline) => {
      capturedPipeline = pipeline;
      return { allowDiskUse: () => Promise.resolve([]) };
    });
    ChatModel.Chat.aggregate.mockImplementationOnce(() => ({ allowDiskUse: () => Promise.resolve([]) }));

    const req = {
      method: 'GET',
      query: {
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString()
      }
    };

    const res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res)
    };

    try {
      await handler(req, res);
    } catch (e) {
      // ignore errors as long as aggregate was invoked
    }

    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();

    const redactedQuestionStage = Array.isArray(capturedPipeline)
      ? capturedPipeline.find(stage =>
        stage && stage.$addFields && stage.$addFields['interactions.redactedQuestion']
      )
      : null;
    expect(redactedQuestionStage).toBeDefined();

    const finalProject = capturedPipeline.find(stage => stage && stage.$project && stage.$project.redactedQuestion);
    expect(finalProject).toBeDefined();
    expect(finalProject.$project.redactedQuestion).toBe('$interactions.redactedQuestion');
  });

  it('should project answerContent and citationUrl as direct per-interaction fields', async () => {
    let capturedPipeline;
    ChatModel.Chat.aggregate.mockImplementationOnce((pipeline) => {
      capturedPipeline = pipeline;
      return { allowDiskUse: () => Promise.resolve([]) };
    });
    ChatModel.Chat.aggregate.mockImplementationOnce(() => ({ allowDiskUse: () => Promise.resolve([]) }));

    const req = {
      method: 'GET',
      query: {
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString()
      }
    };

    const res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res)
    };

    try {
      await handler(req, res);
    } catch (e) {
      // ignore errors as long as aggregate was invoked
    }

    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();

    // Citation link column: a lookup into 'citations', joined off the
    // answer's citation ref
    const citationLookup = capturedPipeline.find(stage =>
      stage && stage.$lookup && stage.$lookup.from === 'citations'
    );
    expect(citationLookup).toBeDefined();
    expect(citationLookup.$lookup.localField).toBe('interactions.citationRef');

    const finalProject = capturedPipeline.find(stage => stage && stage.$project && stage.$project.answerContent);
    expect(finalProject).toBeDefined();
    expect(finalProject.$project.answerContent).toBe('$interactions.answerContent');
    expect(finalProject.$project.citationUrl).toBe('$interactions.citationUrl');
  });

  it('should no longer group interactions into a single row per chat', async () => {
    let capturedPipeline;
    ChatModel.Chat.aggregate.mockImplementationOnce((pipeline) => {
      capturedPipeline = pipeline;
      return { allowDiskUse: () => Promise.resolve([]) };
    });
    ChatModel.Chat.aggregate.mockImplementationOnce(() => ({ allowDiskUse: () => Promise.resolve([]) }));

    const req = {
      method: 'GET',
      query: {
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString()
      }
    };

    const res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res)
    };

    try {
      await handler(req, res);
    } catch (e) {
      // ignore errors as long as aggregate was invoked
    }

    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();

    const groupStage = Array.isArray(capturedPipeline) && capturedPipeline.find(stage => stage && stage.$group);
    expect(groupStage).toBeUndefined();
  });
});
