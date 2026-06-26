import { describe, it, expect } from 'vitest';
import handler from '../db-database-management.js';
import dbConnect from '../db-connect.js';
import { Chat } from '../../../models/chat.js';
import { Interaction } from '../../../models/interaction.js';
import { Question } from '../../../models/question.js';
import { Answer } from '../../../models/answer.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';
import { Logs } from '../../../models/logs.js';
import { Eval } from '../../../models/eval.js';

function createReq(query) {
  return {
    method: 'GET',
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
