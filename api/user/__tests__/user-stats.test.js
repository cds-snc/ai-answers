import { describe, it, expect } from 'vitest';
import handler from '../user-stats.js';
import dbConnect from '../../db/db-connect.js';
import { User } from '../../../models/user.js';
import { Interaction } from '../../../models/interaction.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    setHeader: () => {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; }
  };
}

async function run(user) {
  const res = createRes();
  await handler({ method: 'GET', path: '/api/user/user-stats', user, isAuthenticated: () => true }, res);
  return res;
}

async function makeUser(overrides = {}) {
  return User.create({ email: `stats-${Date.now()}-${Math.random()}@example.com`, password: 'password123', role: 'partner', active: true, ...overrides });
}

describe('user-stats pendingAssignedCount', () => {
  it('counts only assigned questions with no expert score yet', async () => {
    await dbConnect();
    const partner = await makeUser();
    const scored = await ExpertFeedback.create({ totalScore: 100 });
    const unscored = await ExpertFeedback.create({});
    await Interaction.create([
      { interactionId: `a-${Math.random()}`, assignedTo: partner._id },
      { interactionId: `b-${Math.random()}`, assignedTo: partner._id, expertFeedback: unscored._id },
      { interactionId: `c-${Math.random()}`, assignedTo: partner._id, expertFeedback: scored._id },
      { interactionId: `d-${Math.random()}` }
    ]);

    const res = await run({ role: 'partner', userId: partner._id.toString() });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ pendingAssignedCount: 2 });
  });

  it('reads every score field the category check needs (fetches only those fields)', async () => {
    await dbConnect();
    const partner = await makeUser();
    // Scored only by sentence-level fields, no totalScore
    const harmful = await ExpertFeedback.create({ sentence2Score: 100, sentence2Harmful: true });
    const sentenceOnly = await ExpertFeedback.create({ sentence3Score: 80 });
    await Interaction.create([
      { interactionId: `e-${Math.random()}`, assignedTo: partner._id, expertFeedback: harmful._id },
      { interactionId: `f-${Math.random()}`, assignedTo: partner._id, expertFeedback: sentenceOnly._id }
    ]);

    const res = await run({ role: 'partner', userId: partner._id.toString() });

    expect(res.payload).toEqual({ pendingAssignedCount: 0 });
  });

  it('gives admins the account counts as well', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });

    const res = await run({ role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(expect.objectContaining({
      pendingAssignedCount: 0,
      newInactiveCount: expect.any(Number),
      totalInactiveCount: expect.any(Number)
    }));
  });

  it('rejects other roles', async () => {
    await dbConnect();
    const res = await run({ role: 'user', userId: '507f1f77bcf86cd799439011' });
    expect(res.statusCode).toBe(403);
  });
});
