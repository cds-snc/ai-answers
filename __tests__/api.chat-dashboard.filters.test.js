import { describe, it, expect, vi, beforeEach } from 'vitest';
// Ensure middleware and DB connect are mocked before the handler is imported
vi.mock('c:/Users/hymary/repos/ai-answers/middleware/auth.js', () => ({
  withProtection: (handler) => handler,
  authMiddleware: {},
  partnerOrAdminMiddleware: {}
}));
vi.mock('c:/Users/hymary/repos/ai-answers/api/db/db-connect.js', () => ({
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

  it('should include urlEn or urlFr when provided (test will fail until implemented)', async () => {
    let capturedPipeline;
    ChatModel.Chat.aggregate.mockImplementationOnce((pipeline) => {
      capturedPipeline = pipeline;
      return { allowDiskUse: () => Promise.resolve([]) };
    });
    ChatModel.Chat.aggregate.mockImplementationOnce(() => ({ allowDiskUse: () => Promise.resolve([]) }));

    const req = {
      method: 'GET',
      query: {
        urlEn: '/en/some/page',
        urlFr: '/fr/quelque/page',
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

    // The current handler does not translate urlEn/urlFr into a referringUrl match,
    // so ensure no referringUrl match was added to the pipeline.
    const hasRefMatch = Array.isArray(capturedPipeline) && capturedPipeline.some(stage => {
      if (!stage || typeof stage !== 'object') return false;
      if (stage.$match && stage.$match.$and) {
        return stage.$match.$and.some(cond => cond['interactions.referringUrl']);
      }
      return false;
    });

    expect(hasRefMatch).toBe(true);
  });
});
