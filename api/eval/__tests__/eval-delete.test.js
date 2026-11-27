import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import handler from '../eval-delete.js';
import dbConnect from '../../db/db-connect.js';
import { Interaction } from '../../../models/interaction.js';
import { Eval } from '../../../models/eval.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    setHeader: () => {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function runPost(body, role) {
  const res = createRes();
  await handler({
    method: 'POST',
    body,
    path: '/api/eval/eval-delete',
    user: { role, userId: new mongoose.Types.ObjectId().toString() },
    isAuthenticated: () => true,
  }, res);
  return res;
}

// Deleting an automated (AI) evaluation is admin-only.
describe('eval-delete', () => {
  beforeAll(async () => {
    await dbConnect();
  });

  afterEach(async () => {
    await Eval.deleteMany({});
    await ExpertFeedback.deleteMany({});
    await Interaction.deleteMany({});
  });

  const withAutoEval = async () => {
    const feedback = await ExpertFeedback.create({ type: 'ai', totalScore: 80 });
    const evalDoc = await Eval.create({ expertFeedback: feedback._id, processed: true });
    const interaction = await Interaction.create({ autoEval: evalDoc._id });
    return { feedback, evalDoc, interaction };
  };

  it('lets an admin delete an automated evaluation', async () => {
    const { feedback, evalDoc, interaction } = await withAutoEval();

    const res = await runPost({ interactionId: interaction._id.toString() }, 'admin');

    expect(res.statusCode).toBe(200);
    expect(await Eval.findById(evalDoc._id)).toBeNull();
    expect(await ExpertFeedback.findById(feedback._id)).toBeNull();
  });

  it('refuses a partner, and changes nothing', async () => {
    const { feedback, evalDoc, interaction } = await withAutoEval();

    const res = await runPost({ interactionId: interaction._id.toString() }, 'partner');

    expect(res.statusCode).toBe(403);
    expect(await Eval.findById(evalDoc._id)).not.toBeNull();
    expect(await ExpertFeedback.findById(feedback._id)).not.toBeNull();
    expect(String((await Interaction.findById(interaction._id)).autoEval)).toBe(String(evalDoc._id));
  });
});
