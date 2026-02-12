import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mock auth wrapper so tests invoke the inner handler directly (use absolute path)
vi.mock('../middleware/auth.js', () => ({
  withProtection: (handler, ...rest) => (req, res) => handler(req, res),
  authMiddleware: {},
  partnerOrAdminMiddleware: {}
}));
// Mock DB connect to avoid real DB connections during unit tests
vi.mock('../api/db/db-connect.js', () => ({ __esModule: true, default: async () => { } }));
import handler from '../api/chat/chat-dashboard.js';
import * as ChatModel from '../models/chat.js';

describe('api/chat/chat-dashboard - per-filter pipeline creation', () => {
  let capturedPipeline;

  beforeEach(() => {
    capturedPipeline = null;
    ChatModel.Chat.aggregate = vi.fn().mockImplementationOnce((pipeline) => {
      capturedPipeline = pipeline;
      return { allowDiskUse: () => Promise.resolve([]) };
    }).mockImplementationOnce(() => ({ allowDiskUse: () => Promise.resolve([]) }));
  });

  const runHandler = async (query) => {
    const req = { method: 'GET', query };
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) };
    try {
      await handler(req, res);
    } catch (e) {
      // handler may throw; tests only assert aggregate invocation
    }
  };

  const pipelineIncludes = (needle) => {
    return Array.isArray(capturedPipeline) && JSON.stringify(capturedPipeline).includes(needle);
  };

  it('renders date range into pipeline when startDate/endDate provided', async () => {
    const start = '2025-12-01';
    const end = '2025-12-10';
    const timezoneOffsetMinutes = 300; // UTC-05:00 local time
    await runHandler({ startDate: start, endDate: end, timezoneOffsetMinutes });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    const matchStage = Array.isArray(capturedPipeline) ? capturedPipeline.find((stage) => stage && stage.$match && stage.$match.createdAt) : null;
    expect(matchStage?.$match?.createdAt?.$gte?.toISOString()).toBe('2025-12-01T05:00:00.000Z');
    expect(matchStage?.$match?.createdAt?.$lte?.toISOString()).toBe('2025-12-11T04:59:59.999Z');
  });

  it('includes department when provided', async () => {
    const dept = 'CDS-SNC';
    await runHandler({ department: dept, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(dept)).toBe(true);
  });

  it('includes urlEn when provided', async () => {
    // chat-dashboard supports referringUrl; simulate an English URL via referringUrl
    const urlEn = '/en/some/page';
    await runHandler({ referringUrl: urlEn, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(urlEn)).toBe(true);
  });

  it('includes urlFr when provided', async () => {
    // chat-dashboard supports referringUrl; simulate a French URL via referringUrl
    const urlFr = '/fr/quelque/page';
    await runHandler({ referringUrl: urlFr, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(urlFr)).toBe(true);
  });

  it('includes userType when provided', async () => {
    const userType = 'public';
    await runHandler({ userType, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes('creatorEmail')).toBe(true);
  });

  it('includes answerType when provided', async () => {
    const answerType = 'normal';
    await runHandler({ answerType, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(answerType)).toBe(true);
  });

  it('includes partnerEval when provided', async () => {
    const partnerEval = 'correct';
    await runHandler({ partnerEval, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(partnerEval)).toBe(true);
  });

  it('includes aiEval when provided', async () => {
    const aiEval = 'hasError';
    await runHandler({ aiEval, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(aiEval)).toBe(true);
  });

  it('includes noEval null/empty condition for partnerEval', async () => {
    await runHandler({ partnerEval: 'noEval', startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    // Should include a condition matching null for partnerEval
    const pipelineStr = JSON.stringify(capturedPipeline);
    expect(pipelineStr).toContain('"interactions.partnerEval":null');
  });

  it('includes noEval null/empty condition for aiEval', async () => {
    await runHandler({ aiEval: 'noEval', startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    const pipelineStr = JSON.stringify(capturedPipeline);
    expect(pipelineStr).toContain('"interactions.aiEval":null');
  });

  it('combines noEval with other partnerEval categories', async () => {
    await runHandler({ partnerEval: 'noEval,correct', startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    const pipelineStr = JSON.stringify(capturedPipeline);
    // Should contain both null match and the category
    expect(pipelineStr).toContain('"interactions.partnerEval":null');
    expect(pipelineStr).toContain('"interactions.partnerEval":"correct"');
  });

  it('includes interactionCount in $group stage', async () => {
    await runHandler({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    const groupStage = capturedPipeline.find(stage => stage && stage.$group);
    expect(groupStage).toBeDefined();
    expect(groupStage.$group.interactionCount).toEqual({ $sum: 1 });
  });

  it('includes redactedQuestion in $group stage', async () => {
    await runHandler({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    const groupStage = capturedPipeline.find(stage => stage && stage.$group);
    expect(groupStage).toBeDefined();
    expect(groupStage.$group.redactedQuestion).toEqual({ $first: '$interactions.redactedQuestion' });
  });

  it('includes questions collection lookup in pipeline', async () => {
    await runHandler({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    const questionLookup = capturedPipeline.find(stage =>
      stage && stage.$lookup && stage.$lookup.from === 'questions'
    );
    expect(questionLookup).toBeDefined();
    expect(questionLookup.$lookup.localField).toBe('interactions.question');
    expect(questionLookup.$lookup.foreignField).toBe('_id');
  });

  it('includes interactionCount and redactedQuestion in final $project', async () => {
    await runHandler({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    // Find the $project stage that has interactionCount (the final projection)
    const projectStages = capturedPipeline.filter(stage => stage && stage.$project);
    const finalProject = projectStages.find(stage => stage.$project.interactionCount);
    expect(finalProject).toBeDefined();
    expect(finalProject.$project.interactionCount).toBe(1);
    expect(finalProject.$project.redactedQuestion).toBe(1);
  });

  it('includes interactionCount in sortFieldMap', async () => {
    await runHandler({
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      orderBy: 'interactionCount',
      start: 0,
      length: 10
    });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    const sortStage = capturedPipeline.find(stage => stage && stage.$sort);
    expect(sortStage).toBeDefined();
    expect(sortStage.$sort.interactionCount).toBeDefined();
  });
});
