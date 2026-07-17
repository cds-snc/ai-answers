import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import handler from '../db-integrity-checks.js';
import dbConnect from '../db-connect.js';
import { Interaction } from '../../../models/interaction.js';
import { Question } from '../../../models/question.js';
import { Answer } from '../../../models/answer.js';
import { Context } from '../../../models/context.js';

function createReq(query) {
  return {
    method: 'GET',
    query,
    path: '/api/db-integrity-checks',
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

describe('db-integrity-checks interactionMissingChildren', () => {
  it('ignores optional null feedback refs and still flags missing required refs', async () => {
    await dbConnect();

    const question = await Question.create({ redactedQuestion: 'Interaction integrity question' });
    const answer = await Answer.create({ content: 'Interaction integrity answer' });
    const context = await Context.create({ department: 'test-department' });
    const missingAnswerId = new mongoose.Types.ObjectId();

    const validInteraction = await Interaction.create({
      question: question._id,
      answer: answer._id,
      context: context._id,
      expertFeedback: null,
      publicFeedback: null,
      autoEval: null
    });

    const missingAnswerInteraction = await Interaction.create({
      question: question._id,
      answer: missingAnswerId,
      context: context._id,
      expertFeedback: null,
      publicFeedback: null,
      autoEval: null
    });

    try {
      const res = await runGet({
        check: 'interactionMissingChildren',
        limit: '10'
      });

      expect(res.statusCode).toBe(200);
      expect(res.payload.check).toBe('interactionMissingChildren');
      expect(res.payload.count).toBeGreaterThan(0);
      expect(res.payload.samples.some(sample => String(sample._id) === String(validInteraction._id))).toBe(false);
    } finally {
      await Interaction.deleteMany({ _id: { $in: [validInteraction._id, missingAnswerInteraction._id] } });
      await Question.deleteMany({ _id: question._id });
      await Answer.deleteMany({ _id: answer._id });
      await Context.deleteMany({ _id: context._id });
    }
  });
});
