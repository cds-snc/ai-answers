import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import handler from '../feedback-get-expert.js';
import dbConnect from '../../db/db-connect.js';
import { Interaction } from '../../../models/interaction.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';
import { User } from '../../../models/user.js';
import { QA_GROUP } from '../../../src/constants/partnerGroups.js';

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
    await User.deleteMany({});
  });

  const withFeedback = async (fields) => {
    const feedback = await ExpertFeedback.create({ totalScore: 90, ...fields });
    return Interaction.create({ expertFeedback: feedback._id });
  };

  // The session copy of the user, for a stored account with these fields.
  const signedIn = async (fields) => {
    const user = await User.create({ email: 'someone@canada.ca', password: 'x', ...fields });
    return { userId: user._id.toString(), role: user.role, email: user.email };
  };

  it('is true for an admin in the QA group', async () => {
    const interaction = await withFeedback({ expertEmail: 'author@canada.ca' });
    const res = await getAs(await signedIn({ role: 'admin', group: QA_GROUP }), interaction._id);
    expect(res.statusCode).toBe(200);
    expect(res.payload.canEdit).toBe(true);
  });

  it('is false for an admin outside the QA group on someone else\'s evaluation', async () => {
    const interaction = await withFeedback({ expertEmail: 'author@canada.ca' });
    const res = await getAs(await signedIn({ role: 'admin', group: '' }), interaction._id);
    expect(res.statusCode).toBe(200);
    expect(res.payload.canEdit).toBe(false);
  });

  it('is false for a partner in the QA group on someone else\'s evaluation', async () => {
    const interaction = await withFeedback({ expertEmail: 'author@canada.ca' });
    const res = await getAs(await signedIn({ role: 'partner', group: QA_GROUP }), interaction._id);
    expect(res.payload.canEdit).toBe(false);
  });

  it('is true for a partner on their own evaluation, ignoring case', async () => {
    const interaction = await withFeedback({ expertEmail: 'Someone@canada.ca' });
    const res = await getAs(await signedIn({ role: 'partner', group: '' }), interaction._id);
    expect(res.statusCode).toBe(200);
    expect(res.payload.canEdit).toBe(true);
  });

  it('is false for a partner on someone else\'s evaluation', async () => {
    const interaction = await withFeedback({ expertEmail: 'author@canada.ca' });
    const res = await getAs(await signedIn({ role: 'partner', group: '' }), interaction._id);
    expect(res.payload.canEdit).toBe(false);
  });

  it('is true for an admin outside the QA group on their own evaluation', async () => {
    const interaction = await withFeedback({ expertEmail: 'someone@canada.ca' });
    const res = await getAs(await signedIn({ role: 'admin', group: '' }), interaction._id);
    expect(res.payload.canEdit).toBe(true);
  });

  it('is false for everyone, QA admins included, on an automated evaluation', async () => {
    const interaction = await withFeedback({ type: 'ai' });
    const res = await getAs(await signedIn({ role: 'admin', group: QA_GROUP }), interaction._id);
    expect(res.payload.canEdit).toBe(false);
  });

  it('is absent when the answer has no evaluation', async () => {
    const interaction = await Interaction.create({});
    const res = await getAs(await signedIn({ role: 'admin', group: QA_GROUP }), interaction._id);
    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toHaveProperty('canEdit');
  });
});
