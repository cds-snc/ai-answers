import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import handler from '../feedback-delete-expert.js';
import dbConnect from '../../db/db-connect.js';
import { Interaction } from '../../../models/interaction.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';
import { Embedding } from '../../../models/embedding.js';
import { User } from '../../../models/user.js';
import { QA_GROUP } from '../../../src/constants/partnerGroups.js';

const { mockVectorUpdate } = vi.hoisted(() => ({ mockVectorUpdate: vi.fn() }));
vi.mock('../../../services/VectorServiceFactory.js', () => ({
  VectorService: { updateExpertFeedbackMetadata: mockVectorUpdate },
}));

const AUTHOR = 'author@canada.ca';

function createReq(body, user) {
  return {
    method: 'POST',
    body,
    path: '/api/feedback/feedback-delete-expert',
    user,
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

// The session copy of a stored account. The access check re-reads role and
// group from the database (api/util/expert-feedback-access.js).
async function signedIn(fields) {
  const user = await User.create({ email: AUTHOR, password: 'x', role: 'partner', ...fields });
  return { userId: user._id.toString(), role: user.role, email: user.email };
}

async function runPost(body, user) {
  const res = createRes();
  await handler(createReq(body, user ?? await signedIn({})), res);
  return res;
}

describe('feedback-delete-expert', () => {
  beforeAll(async () => {
    await dbConnect();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await ExpertFeedback.deleteMany({});
    await Interaction.deleteMany({});
    await Embedding.collection.deleteMany({});
    await User.deleteMany({});
  });

  it('deletes the evaluation, unlinks it from the answer and clears its embedding metadata', async () => {
    const feedback = await ExpertFeedback.create({ totalScore: 90, expertEmail: AUTHOR });
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
    // null = drop this answer's entries from the in-memory index too.
    expect(mockVectorUpdate).toHaveBeenCalledTimes(1);
    expect(String(mockVectorUpdate.mock.calls[0][0])).toBe(String(interaction._id));
    expect(mockVectorUpdate.mock.calls[0][1]).toBeNull();
  });

  it('returns deletedCount 0 when the answer has no evaluation', async () => {
    const interaction = await Interaction.create({});

    const res = await runPost({ interactionId: interaction._id.toString() });

    expect(res.statusCode).toBe(200);
    expect(res.payload.deletedCount).toBe(0);
    expect(mockVectorUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown interaction', async () => {
    const res = await runPost({ interactionId: new mongoose.Types.ObjectId().toString() });

    expect(res.statusCode).toBe(404);
  });

  // Same rule as editing: the author, or an admin in the AI Answers QA group.
  describe('who can delete', () => {
    const othersEvaluation = async () => {
      const feedback = await ExpertFeedback.create({ totalScore: 0, expertEmail: 'someone.else@canada.ca' });
      const interaction = await Interaction.create({ expertFeedback: feedback._id });
      return { feedback, interaction };
    };

    it('refuses a partner deleting someone else\'s evaluation, and changes nothing', async () => {
      const { feedback, interaction } = await othersEvaluation();

      const res = await runPost({ interactionId: interaction._id.toString() }, await signedIn({ role: 'partner' }));

      expect(res.statusCode).toBe(403);
      expect(await ExpertFeedback.findById(feedback._id)).not.toBeNull();
      expect(String((await Interaction.findById(interaction._id)).expertFeedback)).toBe(String(feedback._id));
      expect(mockVectorUpdate).not.toHaveBeenCalled();
    });

    it('lets an admin outside the QA group delete someone else\'s evaluation', async () => {
      const { feedback, interaction } = await othersEvaluation();

      const res = await runPost({ interactionId: interaction._id.toString() }, await signedIn({ role: 'admin' }));

      expect(res.statusCode).toBe(200);
      expect(await ExpertFeedback.findById(feedback._id)).toBeNull();
    });

    it('lets a QA admin delete anyone\'s evaluation', async () => {
      const { feedback, interaction } = await othersEvaluation();

      const res = await runPost({ interactionId: interaction._id.toString() }, await signedIn({ role: 'admin', group: QA_GROUP }));

      expect(res.statusCode).toBe(200);
      expect(await ExpertFeedback.findById(feedback._id)).toBeNull();
    });
  });

  describe('delete order', () => {
    it('leaves the evaluation linked and its search data alone when the delete fails', async () => {
      const feedback = await ExpertFeedback.create({ totalScore: 90, expertEmail: AUTHOR });
      const interaction = await Interaction.create({ expertFeedback: feedback._id });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const deleteSpy = vi.spyOn(ExpertFeedback, 'deleteOne').mockRejectedValueOnce(new Error('db down'));

      const res = await runPost({ interactionId: interaction._id.toString() });

      expect(res.statusCode).toBe(500);
      expect(String((await Interaction.findById(interaction._id)).expertFeedback)).toBe(String(feedback._id));
      expect(mockVectorUpdate).not.toHaveBeenCalled();
      deleteSpy.mockRestore();
    });

    it('clears a link left pointing at an evaluation that no longer exists, so a retry finishes the job', async () => {
      const interaction = await Interaction.create({ expertFeedback: new mongoose.Types.ObjectId() });

      const res = await runPost({ interactionId: interaction._id.toString() });

      expect(res.statusCode).toBe(200);
      expect((await Interaction.findById(interaction._id)).expertFeedback).toBeFalsy();
      expect(mockVectorUpdate).toHaveBeenCalledTimes(1);
    });

    it('still reports the delete when clearing search data fails afterwards', async () => {
      const feedback = await ExpertFeedback.create({ totalScore: 90, expertEmail: AUTHOR });
      const interaction = await Interaction.create({ expertFeedback: feedback._id });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockVectorUpdate.mockImplementationOnce(() => { throw new Error('index down'); });

      const res = await runPost({ interactionId: interaction._id.toString() });

      expect(res.statusCode).toBe(200);
      expect(await ExpertFeedback.findById(feedback._id)).toBeNull();
      expect((await Interaction.findById(interaction._id)).expertFeedback).toBeFalsy();
    });
  });
});
