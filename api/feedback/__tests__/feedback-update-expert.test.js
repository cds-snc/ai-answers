import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import handler from '../feedback-update-expert.js';
import { canEditExpertFeedback } from '../../util/expert-feedback-access.js';
import { QA_GROUP } from '../../../src/constants/partnerGroups.js';

const { mockRevisionCreate, mockAnswerFindById, mockInteractionFindById, mockFeedbackFindById, mockFindOneAndUpdate, mockSync, mockUserFindById } = vi.hoisted(() => ({
  mockRevisionCreate: vi.fn(),
  mockAnswerFindById: vi.fn(),
  mockInteractionFindById: vi.fn(),
  mockFeedbackFindById: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
  mockSync: vi.fn(),
  mockUserFindById: vi.fn(),
}));

vi.mock('../../db/db-connect.js', () => ({ default: vi.fn() }));
vi.mock('../../../models/interaction.js', () => ({ Interaction: { findById: mockInteractionFindById } }));
vi.mock('../../../models/expertFeedback.js', () => ({ ExpertFeedback: { findById: mockFeedbackFindById, findOneAndUpdate: mockFindOneAndUpdate } }));
vi.mock('../../../models/expertFeedbackRevision.js', () => ({ ExpertFeedbackRevision: { create: mockRevisionCreate } }));
vi.mock('../../../models/answer.js', () => ({ Answer: { findById: mockAnswerFindById } }));
vi.mock('../../../models/user.js', () => ({ User: { findById: mockUserFindById } }));
vi.mock('../../util/expert-feedback-sync.js', () => ({ syncCurrentExpertFeedback: mockSync }));
vi.mock('../../../middleware/auth.js', () => ({
  authMiddleware: vi.fn(),
  partnerOrAdminMiddleware: vi.fn(),
  withProtection: vi.fn((handlerFn) => handlerFn),
}));

const buildFeedbackDoc = (fields) => ({ lastEditedAt: null, ...fields });

// Like the database: returns the document as it was, when the filter matches.
const updateLike = (doc) => mockFindOneAndUpdate.mockImplementation(async (filter) => {
  const sameId = String(filter._id) === String(doc._id);
  const sameEdit = String(filter.lastEditedAt) === String(doc.lastEditedAt);
  return sameId && sameEdit ? doc : null;
});

// Every field the edit form sends.
const fullForm = () => ({
  sentence1Score: null, sentence2Score: null, sentence3Score: null, sentence4Score: null, citationScore: null, totalScore: null,
  sentence1Explanation: '', sentence2Explanation: '', sentence3Explanation: '', sentence4Explanation: '',
  citationExplanation: '', expertCitationUrl: '', feedback: 'negative',
  sentence1Harmful: false, sentence2Harmful: false, sentence3Harmful: false, sentence4Harmful: false,
  sentence1ContentIssue: false, sentence2ContentIssue: false, sentence3ContentIssue: false, sentence4ContentIssue: false,
});

const storedUser = (user) => mockUserFindById.mockReturnValue({ lean: async () => user });

describe('canEditExpertFeedback', () => {
  const ef = { expertEmail: 'author@canada.ca' };
  const sessionUser = { userId: 'u1', role: 'admin', email: 'author@canada.ca' };

  it("lets a QA admin edit anyone's", async () => {
    storedUser({ role: 'admin', group: QA_GROUP, email: 'qa@canada.ca' });
    expect(await canEditExpertFeedback(sessionUser, ef)).toBe(true);
  });
  it('lets a partner edit their own, ignoring case', async () => {
    storedUser({ role: 'partner', group: '', email: 'author@canada.ca' });
    expect(await canEditExpertFeedback(sessionUser, { expertEmail: ' Author@canada.ca ' })).toBe(true);
  });
  it('lets an admin outside the QA group edit their own', async () => {
    storedUser({ role: 'admin', group: '', email: 'author@canada.ca' });
    expect(await canEditExpertFeedback(sessionUser, ef)).toBe(true);
  });
  it("refuses a partner editing someone else's", async () => {
    storedUser({ role: 'partner', group: '', email: 'other@canada.ca' });
    expect(await canEditExpertFeedback(sessionUser, ef)).toBe(false);
  });
  it("refuses a partner in the QA group editing someone else's", async () => {
    storedUser({ role: 'partner', group: QA_GROUP, email: 'other@canada.ca' });
    expect(await canEditExpertFeedback(sessionUser, ef)).toBe(false);
  });
  it("refuses an admin outside the QA group editing someone else's", async () => {
    storedUser({ role: 'admin', group: 'Military transitions', email: 'other@canada.ca' });
    expect(await canEditExpertFeedback(sessionUser, ef)).toBe(false);
  });
  it('leaves an evaluation with no author to QA admins', async () => {
    storedUser({ role: 'partner', group: '', email: 'other@canada.ca' });
    expect(await canEditExpertFeedback(sessionUser, { expertEmail: '' })).toBe(false);
    storedUser({ role: 'admin', group: QA_GROUP, email: 'qa@canada.ca' });
    expect(await canEditExpertFeedback(sessionUser, { expertEmail: '' })).toBe(true);
  });
  it('uses the stored role and email, not the ones saved at login', async () => {
    storedUser({ role: 'partner', group: QA_GROUP, email: 'other@canada.ca' });
    expect(await canEditExpertFeedback(sessionUser, ef)).toBe(false);
  });
  it('refuses when the account no longer exists', async () => {
    storedUser(null);
    expect(await canEditExpertFeedback(sessionUser, ef)).toBe(false);
  });
  it('refuses everyone, QA admins included, on an automated evaluation', async () => {
    storedUser({ role: 'admin', group: QA_GROUP, email: 'qa@canada.ca' });
    expect(await canEditExpertFeedback(sessionUser, { type: 'ai' })).toBe(false);
  });
});

describe('feedback-update-expert API', () => {
  let req;
  let res;
  let interaction;

  beforeEach(() => {
    vi.clearAllMocks();
    const efId = new mongoose.Types.ObjectId();
    interaction = { _id: new mongoose.Types.ObjectId(), expertFeedback: efId, answer: new mongoose.Types.ObjectId() };
    mockInteractionFindById.mockResolvedValue(interaction);
    mockAnswerFindById.mockReturnValue({ lean: async () => ({ sentences: ['One sentence.'] }) });
    storedUser({ role: 'admin', group: QA_GROUP });
    req = {
      method: 'POST',
      user: { userId: 'u1', role: 'admin', email: 'author@canada.ca' },
      body: {
        interactionId: interaction._id.toString(),
        expertFeedbackId: efId.toString(),
        expectedLastEditedAt: null,
        expertFeedback: { ...fullForm(), sentence1Score: 80, sentence1Explanation: 'Vague', totalScore: 85, type: 'ai', expertEmail: 'x@y.ca' },
      },
    };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  });

  it('updates the rating fields, records the editor, keeps author and type, and re-syncs metadata', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca', sentence2Score: 100 });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const saved = res.json.mock.calls[0][0].expertFeedback;
    expect(saved).toMatchObject({
      sentence1Score: 80,
      sentence1Explanation: 'Vague',
      sentence2Score: null,
      totalScore: 85,
      type: '',
      expertEmail: 'author@canada.ca',
      lastEditedBy: 'author@canada.ca',
    });
    expect(saved.lastEditedAt).toBeInstanceOf(Date);
    expect(mockSync).toHaveBeenCalledWith(interaction._id);
  });

  it('sets the label from the score, ignoring what the form sends', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca', feedback: 'positive' });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);

    req.body.expertFeedback = { ...fullForm(), feedback: 'negative' };
    await handler(req, res);
    expect(res.json.mock.calls[0][0].expertFeedback.feedback).toBe('positive');

    req.body.expertFeedback = { ...fullForm(), sentence1Score: 80, feedback: 'positive' };
    await handler(req, res);
    expect(res.json.mock.calls[1][0].expertFeedback.feedback).toBe('negative');
  });

  it('saves only the old values of what changed, and who changed it', async () => {
    const doc = buildFeedbackDoc({
      ...fullForm(), _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca',
      sentence1Score: 100, totalScore: 100, feedback: 'positive', lastEditedBy: '',
    });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);

    await handler(req, res);

    expect(mockRevisionCreate).toHaveBeenCalledTimes(1);
    expect(mockRevisionCreate).toHaveBeenCalledWith({
      interactionId: interaction._id,
      expertFeedbackId: doc._id,
      editedBy: 'author@canada.ca',
      previous: { sentence1Score: 100, sentence1Explanation: '', totalScore: 100, feedback: 'positive' },
    });
  });

  it('saves no history when the edit changes nothing', async () => {
    const doc = buildFeedbackDoc({
      ...fullForm(), _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca',
      totalScore: 100, feedback: 'positive',
    });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);
    req.body.expertFeedback = fullForm();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockRevisionCreate).not.toHaveBeenCalled();
  });

  it('still reports success when the edit saved but the history did not', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca' });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);
    mockRevisionCreate.mockRejectedValueOnce(new Error('history down'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logged).toHaveBeenCalled();
    expect(mockSync).toHaveBeenCalled();
  });

  it('saves no history when the edit is refused', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca', lastEditedAt: new Date('2026-10-08T12:00:00Z') });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockRevisionCreate).not.toHaveBeenCalled();
  });

  it('calculates the total itself, ignoring the one the form sends', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca' });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);
    req.body.expertFeedback = { ...fullForm(), sentence1Score: 0, totalScore: 100 };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].expertFeedback).toMatchObject({ totalScore: 25, feedback: 'negative' });
  });

  it('averages over the sentences the answer has', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca' });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);
    mockAnswerFindById.mockReturnValue({ lean: async () => ({ sentences: ['One.', 'Two.'] }) });
    req.body.expertFeedback = { ...fullForm(), sentence1Score: 0 };

    await handler(req, res);

    expect(res.json.mock.calls[0][0].expertFeedback.totalScore).toBe(62.5);
  });

  it.each([
    ['sentence1Score', -5],
    ['sentence1Score', 50],
    ['sentence4Score', 25],
    ['citationScore', 100],
  ])('rejects %s of %s, which the form can never send', async (field, value) => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca' });
    mockFeedbackFindById.mockResolvedValue(doc);
    req.body.expertFeedback = { ...fullForm(), [field]: value };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: `Missing or invalid field: ${field}` });
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('saves when the form sends no label', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca' });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);
    req.body.expertFeedback = { ...fullForm(), totalScore: 100 };
    delete req.body.expertFeedback.feedback;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].expertFeedback.feedback).toBe('positive');
  });

  it('rejects a save with a missing field instead of clearing it', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca', sentence2Score: 100 });
    mockFeedbackFindById.mockResolvedValue(doc);
    delete req.body.expertFeedback.sentence2Score;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing or invalid field: sentence2Score' });
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('still reports success when the save worked but syncing search data failed', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca' });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);
    mockSync.mockRejectedValueOnce(new Error('metadata down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await handler(req, res);

    expect(mockFindOneAndUpdate).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 403 and saves nothing when a partner edits someone else's evaluation", async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca' });
    mockFeedbackFindById.mockResolvedValue(doc);
    storedUser({ role: 'partner', group: '', email: 'other@canada.ca' });
    req.user.role = 'partner';

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('refuses to edit an automated (ai) evaluation, even for an admin', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: 'ai', expertEmail: '' });
    mockFeedbackFindById.mockResolvedValue(doc);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 and saves nothing when someone else edited it after this form loaded', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca', lastEditedAt: new Date('2026-10-08T12:00:00Z') });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);
    req.body.expectedLastEditedAt = null; // loaded before that edit

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'EXPERT_FEEDBACK_CONFLICT' }));
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('saves when the edit time it loaded is still the latest', async () => {
    const editedAt = new Date('2026-10-08T12:00:00Z');
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca', lastEditedAt: editedAt });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);
    req.body.expectedLastEditedAt = editedAt.toISOString();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockFindOneAndUpdate.mock.calls[0][0]).toEqual({ _id: doc._id, lastEditedAt: editedAt });
  });

  it('returns 400 for an expectedLastEditedAt that is not a date', async () => {
    req.body.expectedLastEditedAt = 'not-a-date';

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing or invalid field: expectedLastEditedAt' });
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when expertFeedbackId is missing', async () => {
    delete req.body.expertFeedbackId;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the answer has no evaluation', async () => {
    interaction.expertFeedback = undefined;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the linked evaluation no longer exists', async () => {
    mockFeedbackFindById.mockResolvedValue(null);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 405 for anything but POST', async () => {
    req.method = 'GET';

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('never writes fields outside the edit form, such as neverStale', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca', neverStale: true });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);
    req.body.expertFeedback.neverStale = false;

    await handler(req, res);

    const { $set } = mockFindOneAndUpdate.mock.calls[0][1];
    expect($set).not.toHaveProperty('neverStale');
    expect($set).not.toHaveProperty('type');
    expect($set).not.toHaveProperty('expertEmail');
  });

  it('returns 409 when the evaluation was deleted and re-created since the form loaded', async () => {
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'author@canada.ca' });
    mockFeedbackFindById.mockResolvedValue(doc);
    updateLike(doc);
    req.body.expertFeedbackId = new mongoose.Types.ObjectId().toString();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
