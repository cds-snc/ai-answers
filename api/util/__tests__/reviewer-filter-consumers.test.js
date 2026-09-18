import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// Guards the wiring, not the logic: each consumer must pass the resolved
// reviewer match into the shared filter builder. Dropping `reviewerMatch`
// from a handler's filters object fails nothing else - the request just
// stops filtering. Same silent-drop shape as the prompt-tag rule in AGENTS.md.

const USER_ID = new mongoose.Types.ObjectId();
const FEEDBACK_ID = new mongoose.Types.ObjectId();

vi.mock('../reviewer-filter.js', () => ({
  resolveReviewerMatch: vi.fn(async () => ({ userIds: [USER_ID], feedbackIds: [FEEDBACK_ID] }))
}));
vi.mock('../../db/db-connect.js', () => ({ default: vi.fn() }));
vi.mock('../../../middleware/auth.js', () => ({
  withProtection: (handler) => handler,
  authMiddleware: (handler) => handler,
  partnerOrAdminMiddleware: (handler) => handler
}));
vi.mock('../../../models/chat.js', () => {
  const aggregate = vi.fn(() => {
    const result = Promise.resolve([]);
    result.allowDiskUse = () => Promise.resolve([]);
    return result;
  });
  return { Chat: { aggregate, find: vi.fn(), populate: vi.fn(async () => []) } };
});

import { Chat } from '../../../models/chat.js';
import chatDashboardHandler from '../../chat/chat-dashboard.js';
import chatExportHandler from '../../chat/chat-export-logs.js';
import chatLogsHandler from '../../db/db-chat-logs.js';
import evalDashboardHandler from '../../eval/eval-dashboard.js';
import EvalAnalysisService from '../../../services/EvalAnalysisService.js';

const DATES = { startDate: '2020-01-01', endDate: '2030-01-01' };

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn()
  };
}

function createReq(query) {
  return { method: 'GET', query, user: { role: 'admin', userId: 'test' }, isAuthenticated: () => true };
}

function pipelinesSent() {
  return Chat.aggregate.mock.calls.map(([pipeline]) => JSON.stringify(pipeline));
}

function expectReviewerMatchInPipeline() {
  const sent = pipelinesSent();
  expect(sent.length).toBeGreaterThan(0);
  expect(sent.some(p => p.includes(String(USER_ID)) && p.includes(String(FEEDBACK_ID)))).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reviewer filter reaches every consumer pipeline', () => {
  it('chat dashboard', async () => {
    const res = createRes();
    await chatDashboardHandler(createReq({ ...DATES, group: 'Military transitions', start: 0, length: 10 }), res);
    expect(res.statusCode).toBe(200);
    expectReviewerMatchInPipeline();
  });

  it('chat export', async () => {
    const res = createRes();
    await chatExportHandler(createReq({ ...DATES, group: 'Military transitions', view: 'default', format: 'json' }), res);
    expect(res.statusCode).toBe(200);
    expectReviewerMatchInPipeline();
  });

  it('chat viewer logs', async () => {
    const res = createRes();
    await chatLogsHandler(createReq({ ...DATES, group: 'Military transitions' }), res);
    expect(res.statusCode).toBe(200);
    expectReviewerMatchInPipeline();
  });

  it('eval dashboard', async () => {
    const res = createRes();
    await evalDashboardHandler(createReq({ ...DATES, group: 'Military transitions', start: 0, length: 10 }), res);
    expect(res.statusCode).toBe(200);
    expectReviewerMatchInPipeline();
  });

  it('eval analysis', async () => {
    await EvalAnalysisService.countEvals({ ...DATES, department: 'IRCC', group: 'Military transitions' });
    expectReviewerMatchInPipeline();
  });
});
