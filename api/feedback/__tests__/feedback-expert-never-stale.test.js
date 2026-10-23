import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import handler from '../feedback-expert-never-stale.js';
import dbConnect from '../../db/db-connect.js';
import { Interaction } from '../../../models/interaction.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';
import { Embedding } from '../../../models/embedding.js';

const { mockVectorUpdate } = vi.hoisted(() => ({ mockVectorUpdate: vi.fn() }));

vi.mock('../../../services/VectorServiceFactory.js', () => ({
  VectorService: { updateExpertFeedbackMetadata: mockVectorUpdate },
}));
vi.mock('../../../middleware/auth.js', () => ({
  authMiddleware: vi.fn(),
  partnerOrAdminMiddleware: vi.fn(),
  withProtection: vi.fn((handlerFn) => handlerFn),
}));

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

async function runPost(body) {
  const res = createRes();
  await handler({ method: 'POST', user: { role: 'admin', email: 'qa@canada.ca' }, body }, res);
  return res;
}

describe('feedback-expert-never-stale', () => {
  beforeAll(async () => {
    await dbConnect();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await ExpertFeedback.deleteMany({});
    await Interaction.deleteMany({});
    await Embedding.collection.deleteMany({});
  });

  it('saves the flag and keeps both the embedding metadata and the in-memory index in step', async () => {
    const feedback = await ExpertFeedback.create({ totalScore: 90, expertEmail: 'author@canada.ca' });
    const interaction = await Interaction.create({ expertFeedback: feedback._id });
    // Raw insert: only the metadata fields matter here, not a valid vector.
    const { insertedId: embeddingId } = await Embedding.collection.insertOne({
      interactionId: interaction._id,
      expertFeedbackId: feedback._id,
      expertFeedbackTotalScore: 90,
      expertFeedbackCreatedAt: new Date(),
    });

    const res = await runPost({ interactionId: interaction._id.toString(), neverStale: true });

    expect(res.statusCode).toBe(200);
    expect((await ExpertFeedback.findById(feedback._id)).neverStale).toBe(true);
    expect((await Embedding.collection.findOne({ _id: embeddingId })).expertFeedbackNeverStale).toBe(true);
    expect(mockVectorUpdate).toHaveBeenCalledTimes(1);
    const [calledId, calledFeedback] = mockVectorUpdate.mock.calls[0];
    expect(String(calledId)).toBe(String(interaction._id));
    expect(calledFeedback).toMatchObject({ neverStale: true, totalScore: 90 });
  });

  it('turns the flag back off', async () => {
    const feedback = await ExpertFeedback.create({ totalScore: 90, neverStale: true });
    const interaction = await Interaction.create({ expertFeedback: feedback._id });

    const res = await runPost({ interactionId: interaction._id.toString(), neverStale: false });

    expect(res.statusCode).toBe(200);
    expect((await ExpertFeedback.findById(feedback._id)).neverStale).toBe(false);
    expect(mockVectorUpdate.mock.calls[0][1]).toMatchObject({ neverStale: false });
  });

  it('returns 400 and changes nothing when neverStale is missing', async () => {
    const feedback = await ExpertFeedback.create({ totalScore: 90 });
    const interaction = await Interaction.create({ expertFeedback: feedback._id });

    const res = await runPost({ interactionId: interaction._id.toString() });

    expect(res.statusCode).toBe(400);
    expect(mockVectorUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown interaction', async () => {
    const res = await runPost({ interactionId: new mongoose.Types.ObjectId().toString(), neverStale: true });

    expect(res.statusCode).toBe(404);
    expect(mockVectorUpdate).not.toHaveBeenCalled();
  });
});
