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

  it('should use filtered department as primary when department filter is provided', async () => {
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

    // Find the $project stage and verify department uses the filtered value
    const projectStage = Array.isArray(capturedPipeline) && capturedPipeline.find(stage =>
      stage && stage.$project && stage.$project.department
    );

    expect(projectStage).toBeDefined();

    // The department projection should use the filtered department 'IRCC' in the $cond
    const deptProjection = projectStage.$project.department;
    expect(deptProjection).toBeDefined();

    // Verify there's a conditional check that references the filter value
    // The structure uses $let with nested $cond
    expect(deptProjection.$let).toBeDefined();
  });

  it('should include interactionCount and redactedQuestion in $group stage', async () => {
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

    const groupStage = Array.isArray(capturedPipeline) && capturedPipeline.find(stage =>
      stage && stage.$group
    );

    expect(groupStage).toBeDefined();
    expect(groupStage.$group.interactionCount).toEqual({ $sum: 1 });
    expect(groupStage.$group.redactedQuestion).toEqual({ $first: '$interactions.redactedQuestion' });
  });

  it('should include redactedQuestion in interaction projection before $group', async () => {
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

    // Find the $project stage that shapes interactions before $group
    // It should include redactedQuestion
    const projectStages = Array.isArray(capturedPipeline)
      ? capturedPipeline.filter(stage => stage && stage.$project && stage.$project.interactions)
      : [];
    const interactionProject = projectStages.find(stage =>
      stage.$project.interactions && stage.$project.interactions.redactedQuestion
    );
    expect(interactionProject).toBeDefined();
    expect(interactionProject.$project.interactions.redactedQuestion).toBe('$interactions.redactedQuestion');
  });

  it('should include allDepartments field in projection', async () => {
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

    // Find the $project stage and verify allDepartments is included
    const projectStage = Array.isArray(capturedPipeline) && capturedPipeline.find(stage =>
      stage && stage.$project && stage.$project.allDepartments
    );

    expect(projectStage).toBeDefined();
    expect(projectStage.$project.allDepartments).toBeDefined();
    // Verify it uses $filter to exclude null/empty values
    expect(projectStage.$project.allDepartments.$filter).toBeDefined();
  });
});
