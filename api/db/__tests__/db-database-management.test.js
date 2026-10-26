import { describe, it, expect, vi, afterEach } from 'vitest';
import mongoose from 'mongoose';
import handler from '../db-database-management.js';
import dbConnect from '../db-connect.js';
import { Chat } from '../../../models/chat.js';
import { Interaction } from '../../../models/interaction.js';
import { Question } from '../../../models/question.js';
import { Answer } from '../../../models/answer.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';
import { Logs } from '../../../models/logs.js';
import { Eval } from '../../../models/eval.js';

function createReq(query, method = 'GET') {
  return {
    method,
    query,
    path: '/api/db-database-management',
    user: { role: 'admin', userId: 'admin-test' },
    isAuthenticated: () => true
  };
}

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    setHeader: () => {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

async function runGet(query) {
  const res = createRes();
  await handler(createReq(query), res);
  return res;
}

describe('db-database-management expert evaluation chat export', () => {
  it('exports only chats with expert feedback and their associated records', async () => {
    await dbConnect();

    const expertFeedback = await ExpertFeedback.create({ totalScore: 75, type: 'expert' });
    const evalExpertFeedback = await ExpertFeedback.create({ totalScore: 60, type: 'expert' });
    const autoEval = await Eval.create({ expertFeedback: evalExpertFeedback._id });
    const includedQuestion = await Question.create({ redactedQuestion: 'Included expert question' });
    const includedAnswer = await Answer.create({ content: 'Included expert answer' });
    const includedInteraction = await Interaction.create({
      question: includedQuestion._id,
      answer: includedAnswer._id,
      expertFeedback: expertFeedback._id,
      autoEval: autoEval._id
    });

    const includedFollowupQuestion = await Question.create({ redactedQuestion: 'Included follow-up question' });
    const includedFollowupInteraction = await Interaction.create({
      question: includedFollowupQuestion._id
    });

    const excludedQuestion = await Question.create({ redactedQuestion: 'Excluded question' });
    const excludedInteraction = await Interaction.create({ question: excludedQuestion._id });

    await Chat.create({
      chatId: 'included-chat',
      interactions: [includedInteraction._id, includedFollowupInteraction._id]
    });
    await Chat.create({
      chatId: 'excluded-chat',
      interactions: [excludedInteraction._id]
    });

    await Logs.create({ chatId: 'included-chat', logLevel: 'info', message: 'Included log' });
    await Logs.create({ chatId: 'excluded-chat', logLevel: 'info', message: 'Excluded log' });

    const chatRes = await runGet({
      collection: 'chat',
      exportScope: 'expertEvalChats',
      limit: '100'
    });
    expect(chatRes.statusCode).toBe(200);
    expect(chatRes.payload.data.map(chat => chat.chatId)).toEqual(['included-chat']);

    const questionRes = await runGet({
      collection: 'question',
      exportScope: 'expertEvalChats',
      limit: '100'
    });
    expect(questionRes.statusCode).toBe(200);
    expect(questionRes.payload.data.map(question => question.redactedQuestion).sort()).toEqual([
      'Included expert question',
      'Included follow-up question'
    ]);

    const logRes = await runGet({
      collection: 'logs',
      exportScope: 'expertEvalChats',
      limit: '100'
    });
    expect(logRes.statusCode).toBe(200);
    expect(logRes.payload.data.map(log => log.message)).toEqual(['Included log']);

    const expertFeedbackRes = await runGet({
      collection: 'expertfeedback',
      exportScope: 'expertEvalChats',
      limit: '100'
    });
    expect(expertFeedbackRes.statusCode).toBe(200);
    expect(expertFeedbackRes.payload.data.map(feedback => feedback.totalScore).sort()).toEqual([60, 75]);
  });
});

describe('db-database-management index rebuild', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function rebuildStatus() {
    const res = await runGet({ action: 'indexRebuildStatus' });
    expect(res.statusCode).toBe(200);
    return res.payload.rebuild;
  }

  async function startRebuild() {
    const res = createRes();
    await handler(createReq({ action: 'createIndexes' }, 'POST'), res);
    return res;
  }

  async function waitForRebuildToFinish() {
    await vi.waitFor(async () => expect((await rebuildStatus()).running).toBe(false));
    return rebuildStatus();
  }

  it('replies before the rebuild finishes', async () => {
    await dbConnect();
    let finish;
    vi.spyOn(mongoose.models.Chat, 'createIndexes').mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    const res = await startRebuild();

    expect(res.statusCode).toBe(202);
    expect(res.payload.alreadyRunning).toBe(false);
    expect(res.payload.rebuild.running).toBe(true);
    expect((await rebuildStatus()).running).toBe(true);

    finish();
    const rebuild = await waitForRebuildToFinish();
    expect(rebuild.failed).toEqual([]);
    expect(rebuild.success).toContain('Chat');
    expect(rebuild.finishedAt).toBeTruthy();
  });

  it('says already running on a second click', async () => {
    await dbConnect();
    let finish;
    const spy = vi.spyOn(mongoose.models.Chat, 'createIndexes').mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    await startRebuild();
    const second = await startRebuild();

    expect(second.statusCode).toBe(202);
    expect(second.payload.alreadyRunning).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    finish();
    await waitForRebuildToFinish();
  });

  it('keeps the failure reasons for the status check', async () => {
    await dbConnect();
    const error = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    vi.spyOn(mongoose.models.Chat, 'createIndexes').mockRejectedValue(error);

    await startRebuild();
    const rebuild = await waitForRebuildToFinish();

    expect(rebuild.failed).toEqual([{ collection: 'Chat', error: 'E11000 duplicate key', code: 11000 }]);
    expect(rebuild.success).not.toContain('Chat');
  });

  it('keeps collections already building an index apart from failures', async () => {
    await dbConnect();
    const error = Object.assign(new Error('Existing index build in progress on the same collection.'), { code: 40333 });
    vi.spyOn(mongoose.models.Chat, 'createIndexes').mockRejectedValue(error);
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await startRebuild();
    const rebuild = await waitForRebuildToFinish();

    // Still logged in full, same as before
    expect(logError).toHaveBeenCalledWith('[IndexBuildError] Failed to create indexes for Chat:', error);
    expect(rebuild.stillBuilding).toEqual([
      { collection: 'Chat', error: 'Existing index build in progress on the same collection.', code: 40333 },
    ]);
    expect(rebuild.failed).toEqual([]);
    expect(rebuild.success).not.toContain('Chat');
  });

  it('no longer accepts PUT', async () => {
    const res = createRes();
    await handler(createReq({}, 'PUT'), res);

    expect(res.statusCode).toBe(405);
  });
});

describe('db-database-management collection list', () => {
  it('lists collections without updatedAt so the export form can hide its dates', async () => {
    await dbConnect();
    await import('../../../models/sessionState.js');

    const res = await runGet({});
    expect(res.statusCode).toBe(200);
    expect(res.payload.collections).toContain('chat');
    expect(res.payload.collectionsWithoutDates).toContain('sessionstate');
    expect(res.payload.collectionsWithoutDates).not.toContain('chat');
  });
});
