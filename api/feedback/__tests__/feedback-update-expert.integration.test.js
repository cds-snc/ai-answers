import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import handler from '../feedback-update-expert.js';
import dbConnect from '../../db/db-connect.js';
import { Interaction } from '../../../models/interaction.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';
import { ExpertFeedbackRevision } from '../../../models/expertFeedbackRevision.js';
import { Embedding } from '../../../models/embedding.js';
import { User } from '../../../models/user.js';
import { QA_GROUP } from '../../../src/constants/partnerGroups.js';

// Real database, unlike feedback-update-expert.test.js: proves the conflict
// guard's findOneAndUpdate filter itself, which a mock can only assume.
// Production is DocumentDB - see AGENTS.md before trusting this alone.

const { mockVectorUpdate } = vi.hoisted(() => ({ mockVectorUpdate: vi.fn() }));

vi.mock('../../../services/VectorServiceFactory.js', () => ({
  VectorService: { updateExpertFeedbackMetadata: mockVectorUpdate },
}));
vi.mock('../../../middleware/auth.js', () => ({
  authMiddleware: vi.fn(),
  partnerOrAdminMiddleware: vi.fn(),
  withProtection: vi.fn((handlerFn) => handlerFn),
}));

// Every field the edit form sends.
const fullForm = (overrides = {}) => ({
  sentence1Score: 80, sentence2Score: null, sentence3Score: null, sentence4Score: null, citationScore: 25, totalScore: 85,
  sentence1Explanation: 'Vague', sentence2Explanation: '', sentence3Explanation: '', sentence4Explanation: '',
  citationExplanation: '', expertCitationUrl: '', feedback: 'negative',
  sentence1Harmful: false, sentence2Harmful: false, sentence3Harmful: false, sentence4Harmful: false,
  sentence1ContentIssue: false, sentence2ContentIssue: false, sentence3ContentIssue: false, sentence4ContentIssue: false,
  ...overrides,
});

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

let qaAdmin;

async function save({ interaction, feedbackId, expectedLastEditedAt, form }) {
  const res = createRes();
  await handler({
    method: 'POST',
    user: { userId: qaAdmin._id.toString(), role: 'admin', email: 'qa@canada.ca' },
    body: {
      interactionId: interaction._id.toString(),
      expertFeedbackId: feedbackId.toString(),
      expectedLastEditedAt,
      expertFeedback: form,
    },
  }, res);
  return res;
}

describe('feedback-update-expert against a real database', () => {
  beforeAll(async () => {
    await dbConnect();
  });

  beforeEach(async () => {
    qaAdmin = await User.create({ email: 'qa@canada.ca', password: 'x', role: 'admin', group: QA_GROUP });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    mockVectorUpdate.mockClear();
    await User.deleteMany({});
    await ExpertFeedbackRevision.deleteMany({});
    await ExpertFeedback.collection.deleteMany({});
    await Interaction.deleteMany({});
    await Embedding.collection.deleteMany({});
  });

  // Raw insert with no lastEditedAt field at all, like evaluations saved
  // before the field existed.
  const legacyEvaluation = async () => {
    const { insertedId } = await ExpertFeedback.collection.insertOne({
      type: '', expertEmail: 'author@canada.ca', totalScore: 100, sentence1Score: 100, createdAt: new Date(),
    });
    const interaction = await Interaction.create({ expertFeedback: insertedId });
    return { interaction, feedbackId: insertedId };
  };

  it('saves the first edit of an evaluation that has no lastEditedAt field', async () => {
    const { interaction, feedbackId } = await legacyEvaluation();

    const res = await save({ interaction, feedbackId, expectedLastEditedAt: null, form: fullForm() });

    expect(res.statusCode).toBe(200);
    const stored = await ExpertFeedback.findById(feedbackId).lean();
    expect(stored).toMatchObject({ sentence1Score: 80, totalScore: 85, lastEditedBy: 'qa@canada.ca', expertEmail: 'author@canada.ca' });
    expect(stored.lastEditedAt).toBeInstanceOf(Date);
  });

  it('refuses a second save from a form loaded before the first one, and keeps the first', async () => {
    const { interaction, feedbackId } = await legacyEvaluation();
    await save({ interaction, feedbackId, expectedLastEditedAt: null, form: fullForm({ sentence1Explanation: 'First' }) });

    // Second editor opened the form before the first save, so still expects null.
    const res = await save({ interaction, feedbackId, expectedLastEditedAt: null, form: fullForm({ sentence1Explanation: 'Second' }) });

    expect(res.statusCode).toBe(409);
    expect(res.payload.code).toBe('EXPERT_FEEDBACK_CONFLICT');
    expect((await ExpertFeedback.findById(feedbackId).lean()).sentence1Explanation).toBe('First');
  });

  it('accepts a follow-up save that sends back the lastEditedAt it was given', async () => {
    const { interaction, feedbackId } = await legacyEvaluation();
    const first = await save({ interaction, feedbackId, expectedLastEditedAt: null, form: fullForm() });
    // Through JSON, the way the browser sends it back.
    const returned = JSON.parse(JSON.stringify(first.payload.expertFeedback));

    const res = await save({
      interaction, feedbackId, expectedLastEditedAt: returned.lastEditedAt, form: fullForm({ sentence1Explanation: 'Again' }),
    });

    expect(res.statusCode).toBe(200);
    expect((await ExpertFeedback.findById(feedbackId).lean()).sentence1Explanation).toBe('Again');
  });

  it('is not blocked by a never-stale change made while the form was open', async () => {
    const { interaction, feedbackId } = await legacyEvaluation();
    // Never stale bumps updatedAt but not lastEditedAt.
    await ExpertFeedback.updateOne({ _id: feedbackId }, { $set: { neverStale: true } });

    const res = await save({ interaction, feedbackId, expectedLastEditedAt: null, form: fullForm() });

    expect(res.statusCode).toBe(200);
    expect((await ExpertFeedback.findById(feedbackId).lean()).neverStale).toBe(true);
  });

  it('keeps what each edit changed, enough to step back through them', async () => {
    const { interaction, feedbackId } = await legacyEvaluation();
    const first = await save({ interaction, feedbackId, expectedLastEditedAt: null, form: fullForm({ sentence1Explanation: 'First' }) });
    const { lastEditedAt } = JSON.parse(JSON.stringify(first.payload.expertFeedback));
    await save({ interaction, feedbackId, expectedLastEditedAt: lastEditedAt, form: fullForm({ sentence1Score: 0, sentence1Explanation: 'Second' }) });

    const revisions = await ExpertFeedbackRevision.find({ expertFeedbackId: feedbackId }).sort({ createdAt: 1, _id: 1 }).lean();

    expect(revisions).toHaveLength(2);
    expect(revisions[0].previous).toMatchObject({ totalScore: 100, sentence1Score: 100 });
    expect(revisions[0].previous).not.toHaveProperty('expertEmail');
    expect(revisions[1].previous).toEqual({ totalScore: 85, sentence1Score: 80, sentence1Explanation: 'First' });
    expect(revisions[1].editedBy).toBe('qa@canada.ca');
    expect(String(revisions[1].interactionId)).toBe(String(interaction._id));
    expect(revisions[1].createdAt).toBeInstanceOf(Date);
    expect((await ExpertFeedback.findById(feedbackId).lean()).sentence1Explanation).toBe('Second');
  });

  it('returns the saved values to the screen', async () => {
    const { interaction, feedbackId } = await legacyEvaluation();

    const res = await save({ interaction, feedbackId, expectedLastEditedAt: null, form: fullForm() });

    const stored = await ExpertFeedback.findById(feedbackId).lean();
    expect(res.payload.expertFeedback).toMatchObject({
      totalScore: stored.totalScore, feedback: stored.feedback, lastEditedBy: stored.lastEditedBy, expertEmail: 'author@canada.ca',
    });
    expect(res.payload.expertFeedback.lastEditedAt).toEqual(stored.lastEditedAt);
  });

  it('removes the history when the interaction is deleted, and keeps it when only the review is', async () => {
    const { interaction, feedbackId } = await legacyEvaluation();
    await save({ interaction, feedbackId, expectedLastEditedAt: null, form: fullForm() });

    await ExpertFeedback.deleteOne({ _id: feedbackId });
    expect(await ExpertFeedbackRevision.countDocuments({ interactionId: interaction._id })).toBe(1);

    await Interaction.deleteMany({ _id: interaction._id });
    expect(await ExpertFeedbackRevision.countDocuments({ interactionId: interaction._id })).toBe(0);
  });

  it('does not put a deleted evaluation back on the search data when a delete lands right after the save', async () => {
    const { interaction, feedbackId } = await legacyEvaluation();
    // Raw insert: only the metadata fields matter here, not a valid vector.
    const { insertedId: embeddingId } = await Embedding.collection.insertOne({
      interactionId: interaction._id,
      expertFeedbackId: feedbackId,
      expertFeedbackTotalScore: 100,
      expertFeedbackCreatedAt: new Date(),
    });
    // The delete lands between this edit's save and its sync.
    const realUpdate = ExpertFeedback.findOneAndUpdate.bind(ExpertFeedback);
    vi.spyOn(ExpertFeedback, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
      const saved = await realUpdate(...args);
      await Interaction.updateOne({ _id: interaction._id }, { $unset: { expertFeedback: 1 } });
      await Embedding.collection.updateOne({ _id: embeddingId }, { $set: { expertFeedbackId: null, expertFeedbackTotalScore: null } });
      await ExpertFeedback.deleteOne({ _id: feedbackId });
      return saved;
    });

    const res = await save({ interaction, feedbackId, expectedLastEditedAt: null, form: fullForm() });

    expect(res.statusCode).toBe(200);
    const embedding = await Embedding.collection.findOne({ _id: embeddingId });
    // Cleared metadata may be null or removed; either way the deleted ID is gone.
    expect(embedding.expertFeedbackId ?? null).toBeNull();
    expect(embedding.expertFeedbackTotalScore ?? null).toBeNull();
    expect(mockVectorUpdate).toHaveBeenCalledTimes(1);
    expect(mockVectorUpdate.mock.calls[0][1]).toBeNull();
  });
});
