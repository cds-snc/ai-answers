import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import handler from '../feedback-update-expert.js';
import { canEditExpertFeedback } from '../../util/expert-feedback-access.js';

const { mockInteractionFindById, mockFeedbackFindById, mockFindOneAndUpdate, mockSync, mockVectorUpdate } = vi.hoisted(() => ({
  mockInteractionFindById: vi.fn(),
  mockFeedbackFindById: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
  mockSync: vi.fn(),
  mockVectorUpdate: vi.fn(),
}));

vi.mock('../../db/db-connect.js', () => ({ default: vi.fn() }));
vi.mock('../../../models/interaction.js', () => ({ Interaction: { findById: mockInteractionFindById } }));
vi.mock('../../../models/expertFeedback.js', () => ({ ExpertFeedback: { findById: mockFeedbackFindById, findOneAndUpdate: mockFindOneAndUpdate } }));
// Real isAutoEvalFeedback, so the AI-evaluation tests run the shared check.
vi.mock('../../../services/EmbeddingMetadataService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  default: { syncForInteraction: mockSync },
}));
vi.mock('../../../services/VectorServiceFactory.js', () => ({ VectorService: { updateExpertFeedbackMetadata: mockVectorUpdate } }));
vi.mock('../../../middleware/auth.js', () => ({
  authMiddleware: vi.fn(),
  partnerOrAdminMiddleware: vi.fn(),
  withProtection: vi.fn((handlerFn) => handlerFn),
}));

const buildFeedbackDoc = (fields) => ({ lastEditedAt: null, ...fields });

// Applies the $set like the database would, when the filter matches the doc.
const updateLike = (doc) => mockFindOneAndUpdate.mockImplementation(async (filter, update) => {
  const sameId = String(filter._id) === String(doc._id);
  const sameEdit = String(filter.lastEditedAt) === String(doc.lastEditedAt);
  return sameId && sameEdit ? { ...doc, ...update.$set } : null;
});

// Every field the edit form sends.
const fullForm = () => ({
  sentence1Score: null, sentence2Score: null, sentence3Score: null, sentence4Score: null, citationScore: null, totalScore: null,
  sentence1Explanation: '', sentence2Explanation: '', sentence3Explanation: '', sentence4Explanation: '',
  citationExplanation: '', expertCitationUrl: '', feedback: 'negative',
  sentence1Harmful: false, sentence2Harmful: false, sentence3Harmful: false, sentence4Harmful: false,
  sentence1ContentIssue: false, sentence2ContentIssue: false, sentence3ContentIssue: false, sentence4ContentIssue: false,
});

describe('canEditExpertFeedback', () => {
  const ef = { expertEmail: 'Author@canada.ca' };
  it('lets an admin edit anyone', () => {
    expect(canEditExpertFeedback({ role: 'admin', email: 'qa@canada.ca' }, ef)).toBe(true);
  });
  it('lets a partner edit their own, ignoring case', () => {
    expect(canEditExpertFeedback({ role: 'partner', email: 'author@canada.ca' }, ef)).toBe(true);
  });
  it("refuses a partner editing someone else's", () => {
    expect(canEditExpertFeedback({ role: 'partner', email: 'other@canada.ca' }, ef)).toBe(false);
  });
  it('refuses a partner when the evaluation has no author email', () => {
    expect(canEditExpertFeedback({ role: 'partner', email: '' }, { expertEmail: '' })).toBe(false);
  });
  it('refuses everyone, admins included, on an automated evaluation', () => {
    expect(canEditExpertFeedback({ role: 'admin', email: 'qa@canada.ca' }, { type: 'ai' })).toBe(false);
  });
});

describe('feedback-update-expert API', () => {
  let req;
  let res;
  let interaction;

  beforeEach(() => {
    vi.clearAllMocks();
    const efId = new mongoose.Types.ObjectId();
    interaction = { _id: new mongoose.Types.ObjectId(), expertFeedback: efId };
    mockInteractionFindById.mockResolvedValue(interaction);
    req = {
      method: 'POST',
      user: { role: 'partner', email: 'author@canada.ca' },
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
    expect(mockSync).toHaveBeenCalledWith(interaction, expect.objectContaining({ totalScore: 85 }));
    expect(mockVectorUpdate).toHaveBeenCalledWith(interaction._id, expect.objectContaining({ totalScore: 85 }));
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
    const doc = buildFeedbackDoc({ _id: interaction.expertFeedback, type: '', expertEmail: 'other@canada.ca' });
    mockFeedbackFindById.mockResolvedValue(doc);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('refuses to edit an automated (ai) evaluation, even for an admin', async () => {
    req.user = { role: 'admin', email: 'qa@canada.ca' };
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
    expect(mockVectorUpdate).not.toHaveBeenCalled();
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
