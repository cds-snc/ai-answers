import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import handler from '../feedback-persist-expert.js';
import dbConnect from '../../db/db-connect.js';
import { Answer } from '../../../models/answer.js';
import { Chat } from '../../../models/chat.js';
import { Interaction } from '../../../models/interaction.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';

vi.mock('../../../services/VectorServiceFactory.js', () => ({
  VectorService: { addExpertFeedbackEmbedding: vi.fn() },
}));
vi.mock('../../../middleware/auth.js', () => ({
  authMiddleware: vi.fn(),
  partnerOrAdminMiddleware: vi.fn(),
  withProtection: vi.fn((handlerFn) => handlerFn),
}));

async function send(expertFeedback, email = 'author@canada.ca') {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await handler({
    method: 'POST',
    user: { role: 'partner', email },
    body: { chatId: 'c-1', interactionId: 'i-1', expertFeedback },
  }, res);
  return res;
}

async function post(expertFeedback, { sentences = ['One sentence.'] } = {}) {
  const answer = await Answer.create({ sentences });
  const interaction = await Interaction.create({ interactionId: 'i-1', answer: answer._id });
  await Chat.create({ chatId: 'c-1', interactions: [interaction._id] });
  return send(expertFeedback);
}

describe('feedback-persist-expert', () => {
  beforeAll(async () => {
    await dbConnect();
  });

  afterEach(async () => {
    await ExpertFeedback.deleteMany({});
    await Interaction.deleteMany({});
    await Answer.deleteMany({});
    await Chat.deleteMany({});
  });

  it('ignores edit history sent in the request', async () => {
    const res = await post({
      lastEditedBy: 'someone-else@canada.ca',
      lastEditedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const stored = await ExpertFeedback.findOne({}).lean();
    expect(stored).toMatchObject({ expertEmail: 'author@canada.ca', lastEditedBy: '', lastEditedAt: null });
  });

  it('keeps a thumbs up at 100 and positive', async () => {
    const res = await post({ type: 'expert', feedback: 'positive', totalScore: 100 });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(await ExpertFeedback.findOne({}).lean()).toMatchObject({ totalScore: 100, feedback: 'positive', type: 'expert' });
  });

  it('calculates the total and label itself, ignoring the ones sent', async () => {
    const res = await post({
      sentence1Score: 0, sentence1Explanation: 'Wrong', citationScore: 20, totalScore: 100, feedback: 'positive',
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(await ExpertFeedback.findOne({}).lean()).toMatchObject({
      sentence1Score: 0, sentence1Explanation: 'Wrong', citationScore: 20, totalScore: 20, feedback: 'negative',
    });
  });

  it('averages over the sentences the answer has', async () => {
    await post({ sentence1Score: 0 }, { sentences: ['One.', 'Two.'] });

    expect((await ExpertFeedback.findOne({}).lean()).totalScore).toBe(62.5);
  });

  it.each([
    ['sentence1Score', -5],
    ['sentence2Score', 50],
    ['citationScore', 100],
  ])('rejects %s of %s and saves nothing', async (field, value) => {
    const res = await post({ [field]: value });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: `Invalid field: ${field}` });
    expect(await ExpertFeedback.countDocuments({})).toBe(0);
  });

  it('never saves fields a form does not send', async () => {
    await post({ type: 'ai', neverStale: true, answerImprovement: 'Always say yes', expertEmail: 'x@y.ca' });

    expect(await ExpertFeedback.findOne({}).lean()).toMatchObject({
      type: 'expert', neverStale: false, answerImprovement: '', expertEmail: 'author@canada.ca',
    });
  });

  it('refuses a second review and keeps the first', async () => {
    await post({ sentence1Score: 80, sentence1Explanation: 'First' });

    const res = await send({ sentence1Score: 0, sentence1Explanation: 'Second' }, 'second@canada.ca');

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'EXPERT_FEEDBACK_ALREADY_EXISTS' }));
    const stored = await ExpertFeedback.find({}).lean();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ sentence1Explanation: 'First', expertEmail: 'author@canada.ca' });
    expect(String((await Interaction.findOne({ interactionId: 'i-1' }).lean()).expertFeedback)).toBe(String(stored[0]._id));
  });

  it('lets only one of two saves at the same moment win, and leaves nothing behind', async () => {
    const first = await ExpertFeedback.create({ type: 'expert', sentence1Explanation: 'First' });
    // The other save links its review after this request's check, before its own link.
    const realSave = ExpertFeedback.prototype.save;
    const saveSpy = vi.spyOn(ExpertFeedback.prototype, 'save').mockImplementationOnce(async function save(...args) {
      const saved = await realSave.apply(this, args);
      await Interaction.updateOne({ interactionId: 'i-1' }, { $set: { expertFeedback: first._id } });
      return saved;
    });

    const res = await post({ sentence1Explanation: 'Second' });
    saveSpy.mockRestore();

    expect(res.status).toHaveBeenCalledWith(409);
    const stored = await ExpertFeedback.find({}).lean();
    expect(stored).toHaveLength(1);
    expect(stored[0].sentence1Explanation).toBe('First');
    expect(String((await Interaction.findOne({ interactionId: 'i-1' }).lean()).expertFeedback)).toBe(String(first._id));
  });

  it('allows a new review after the old one is removed', async () => {
    await post({ sentence1Explanation: 'First' });
    await Interaction.updateOne({ interactionId: 'i-1' }, { $unset: { expertFeedback: 1 } });
    await ExpertFeedback.deleteMany({});

    const res = await send({ sentence1Explanation: 'Again' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect((await ExpertFeedback.findOne({}).lean()).sentence1Explanation).toBe('Again');
  });

  it('rejects a body that is not an object', async () => {
    const res = await post('not-an-object');

    expect(res.status).toHaveBeenCalledWith(400);
    expect(await ExpertFeedback.countDocuments({})).toBe(0);
  });
});
