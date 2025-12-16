import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mock auth wrapper so tests invoke the inner handler directly (use absolute path)
vi.mock('c:/Users/hymary/repos/ai-answers/middleware/auth.js', () => ({
  withProtection: (handler, ...rest) => (req, res) => handler(req, res),
  authMiddleware: {},
  partnerOrAdminMiddleware: {}
}));
// Mock DB connect to avoid real DB connections during unit tests (absolute path)
vi.mock('c:/Users/hymary/repos/ai-answers/api/db/db-connect.js', () => ({ __esModule: true, default: async () => {} }));
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
    const start = '2025-12-01T00:00:00.000Z';
    const end = '2025-12-10T23:59:59.000Z';
    await runHandler({ startDate: start, endDate: end });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes('2025-12-01')).toBe(true);
    expect(pipelineIncludes('2025-12-10')).toBe(true);
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
});
