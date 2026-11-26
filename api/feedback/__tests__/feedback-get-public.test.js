import { describe, it, expect } from 'vitest';
import handler from '../feedback-get-public.js';
import dbConnect from '../../db/db-connect.js';
import { Interaction } from '../../../models/interaction.js';
import { PublicFeedback } from '../../../models/publicFeedback.js';

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

async function run(interactionId) {
  const res = createRes();
  await handler({
    method: 'POST',
    body: { interactionId },
    path: '/api/feedback/feedback-get-public',
    user: { role: 'partner', userId: 'partner-test' },
    isAuthenticated: () => true,
  }, res);
  return res;
}

describe('feedback-get-public', () => {
  it('returns the document named only by the recovery pointer', async () => {
    await dbConnect();
    const doc = await PublicFeedback.create({
      feedback: 'yes',
      publicFeedbackReason: 'Saved me time',
      publicFeedbackScore: 3,
    });
    const interaction = await Interaction.create({ publicFeedbackRecover: doc._id });

    const res = await run(interaction._id.toString());

    expect(res.statusCode).toBe(200);
    expect(res.payload.publicFeedback.feedback).toBe('yes');
    expect(res.payload.publicFeedback.publicFeedbackScore).toBe(3);
    expect(res.payload.message).toBe('OK');
  });

  it('returns no feedback when neither pointer is set', async () => {
    await dbConnect();
    const interaction = await Interaction.create({});

    const res = await run(interaction._id.toString());

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ message: 'No public feedback', sentences: [] });
  });
});
