import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import handler from '../feedback-get-expert.js';
import dbConnect from '../../db/db-connect.js';
import { Interaction } from '../../../models/interaction.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';

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

async function getAs(user, interactionId) {
  const res = createRes();
  await handler({ method: 'POST', user, body: { interactionId: interactionId.toString() } }, res);
  return res;
}

// canEdit decides whether the review panel shows Edit (ExpertFeedbackPanel.js).
describe('feedback-get-expert canEdit', () => {
  beforeAll(async () => {
    await dbConnect();
  });

  afterEach(async () => {
    await ExpertFeedback.deleteMany({});
    await Interaction.deleteMany({});
  });

  const withFeedback = async (fields) => {
    const feedback = await ExpertFeedback.create({ totalScore: 90, ...fields });
    return Interaction.create({ expertFeedback: feedback._id });
  };

  it('is true for an admin on anyone\'s evaluation', async () => {
    const interaction = await withFeedback({ expertEmail: 'author@canada.ca' });
    const res = await getAs({ role: 'admin', email: 'qa@canada.ca' }, interaction._id);
    expect(res.statusCode).toBe(200);
    expect(res.payload.canEdit).toBe(true);
  });

  it('is true for a partner on their own evaluation, ignoring case', async () => {
    const interaction = await withFeedback({ expertEmail: 'Author@canada.ca' });
    const res = await getAs({ role: 'partner', email: 'author@canada.ca' }, interaction._id);
    expect(res.payload.canEdit).toBe(true);
  });

  it("is false for a partner on someone else's evaluation", async () => {
    const interaction = await withFeedback({ expertEmail: 'author@canada.ca' });
    const res = await getAs({ role: 'partner', email: 'other@canada.ca' }, interaction._id);
    expect(res.statusCode).toBe(200);
    expect(res.payload.canEdit).toBe(false);
  });

  it('is false for everyone, admins included, on an automated evaluation', async () => {
    const interaction = await withFeedback({ type: 'ai' });
    const res = await getAs({ role: 'admin', email: 'qa@canada.ca' }, interaction._id);
    expect(res.payload.canEdit).toBe(false);
  });

  it('is absent when the answer has no evaluation', async () => {
    const interaction = await Interaction.create({});
    const res = await getAs({ role: 'admin', email: 'qa@canada.ca' }, interaction._id);
    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toHaveProperty('canEdit');
  });
});
