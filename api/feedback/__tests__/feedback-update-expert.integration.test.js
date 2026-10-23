import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import handler from '../feedback-update-expert.js';
import dbConnect from '../../db/db-connect.js';
import { Interaction } from '../../../models/interaction.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';

// Real database, unlike feedback-update-expert.test.js: proves the conflict
// guard's findOneAndUpdate filter itself, which a mock can only assume.
// Production is DocumentDB - see AGENTS.md before trusting this alone.

vi.mock('../../../services/VectorServiceFactory.js', () => ({
  VectorService: { updateExpertFeedbackMetadata: vi.fn() },
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

async function save({ interaction, feedbackId, expectedLastEditedAt, form }) {
  const res = createRes();
  await handler({
    method: 'POST',
    user: { role: 'admin', email: 'qa@canada.ca' },
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

  afterEach(async () => {
    await ExpertFeedback.collection.deleteMany({});
    await Interaction.deleteMany({});
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
});
