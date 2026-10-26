import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import handler from '../feedback-delete-expert.js';
import dbConnect from '../../db/db-connect.js';
import { Interaction } from '../../../models/interaction.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';
import { Embedding } from '../../../models/embedding.js';

function createReq(body) {
  return {
    method: 'POST',
    body,
    path: '/api/feedback/feedback-delete-expert',
    user: { role: 'admin', userId: new mongoose.Types.ObjectId().toString() },
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

async function runPost(body) {
  const res = createRes();
  await handler(createReq(body), res);
  return res;
}

describe('feedback-delete-expert', () => {
  beforeAll(async () => {
    await dbConnect();
  });

  afterEach(async () => {
    await ExpertFeedback.deleteMany({});
    await Interaction.deleteMany({});
    await Embedding.collection.deleteMany({});
  });

  it('deletes the evaluation, unlinks it from the answer and clears its embedding metadata', async () => {
    const feedback = await ExpertFeedback.create({ totalScore: 90 });
    const interaction = await Interaction.create({ expertFeedback: feedback._id });
    // Raw insert: only the metadata fields matter here, not a valid vector.
    const { insertedId: embeddingId } = await Embedding.collection.insertOne({
      interactionId: interaction._id,
      expertFeedbackId: feedback._id,
      expertFeedbackTotalScore: 90,
      expertFeedbackCreatedAt: new Date(),
    });

    const res = await runPost({ interactionId: interaction._id.toString() });

    expect(res.statusCode).toBe(200);
    expect(res.payload.deletedCount).toBe(1);
    expect(await ExpertFeedback.findById(feedback._id)).toBeNull();
    expect((await Interaction.findById(interaction._id)).expertFeedback).toBeFalsy();
    const embedding = await Embedding.collection.findOne({ _id: embeddingId });
    expect(embedding.expertFeedbackId).toBeUndefined();
    expect(embedding.expertFeedbackTotalScore).toBeUndefined();
  });

  it('returns deletedCount 0 when the answer has no evaluation', async () => {
    const interaction = await Interaction.create({});

    const res = await runPost({ interactionId: interaction._id.toString() });

    expect(res.statusCode).toBe(200);
    expect(res.payload.deletedCount).toBe(0);
  });

  it('returns 404 for an unknown interaction', async () => {
    const res = await runPost({ interactionId: new mongoose.Types.ObjectId().toString() });

    expect(res.statusCode).toBe(404);
  });
});
