import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from '../chat-assign-interaction.js';
import dbConnect from '../../db/db-connect.js';
import { Interaction } from '../../../models/interaction.js';
import mongoose from 'mongoose';
import { User } from '../../../models/user.js';

function createReq({ method = 'POST', body, user }) {
  return {
    method,
    body,
    path: '/api/chat/chat-assign-interaction',
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

async function runPost(body, user) {
  const res = createRes();
  await handler(createReq({ body, user }), res);
  return res;
}

async function runDelete(body, user) {
  const res = createRes();
  await handler(createReq({ method: 'DELETE', body, user }), res);
  return res;
}

async function makeUser(overrides = {}) {
  return User.create({ email: `assign-${Date.now()}-${Math.random()}@example.com`, password: 'password123', role: 'partner', active: true, ...overrides });
}

describe('chat-assign-interaction', () => {
  it('lets a partner assign a question to themselves', async () => {
    await dbConnect();
    const partner = await makeUser();
    const question = await Interaction.create({});

    const res = await runPost(
      { interactionId: question._id.toString(), assignedTo: partner._id.toString(), notes: 'reviewing' },
      { role: 'partner', userId: partner._id.toString() }
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload.assignedTo).toBe(partner._id.toString());
    expect(res.payload.assignedToEmail).toBe(partner.email);
    expect(res.payload.assignedNotes).toBe('reviewing');

    const updated = await Interaction.findById(question._id).lean();
    expect(String(updated.assignedTo)).toBe(partner._id.toString());
    expect(String(updated.assignedBy)).toBe(partner._id.toString());
  });

  it('blocks a partner from assigning a question to someone else', async () => {
    await dbConnect();
    const partner = await makeUser();
    const otherPartner = await makeUser();
    const question = await Interaction.create({});

    const res = await runPost(
      { interactionId: question._id.toString(), assignedTo: otherPartner._id.toString() },
      { role: 'partner', userId: partner._id.toString() }
    );

    expect(res.statusCode).toBe(403);
    const updated = await Interaction.findById(question._id).lean();
    expect(updated.assignedTo).toBeFalsy();
  });

  it('lets a partner assign a question to someone sharing their institution', async () => {
    await dbConnect();
    const partner = await makeUser({ institution: 'IRCC' });
    const institutionMate = await makeUser({ institution: 'IRCC' });
    const question = await Interaction.create({});

    const res = await runPost(
      { interactionId: question._id.toString(), assignedTo: institutionMate._id.toString() },
      { role: 'partner', userId: partner._id.toString() }
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload.assignedTo).toBe(institutionMate._id.toString());
  });

  it('lets a partner assign a question to someone sharing their group but not their institution', async () => {
    await dbConnect();
    const partner = await makeUser({ institution: 'IRCC', group: 'Intake team' });
    const groupMate = await makeUser({ institution: 'ESDC', group: 'Intake team' });
    const question = await Interaction.create({});

    const res = await runPost(
      { interactionId: question._id.toString(), assignedTo: groupMate._id.toString() },
      { role: 'partner', userId: partner._id.toString() }
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload.assignedTo).toBe(groupMate._id.toString());
  });

  it('blocks a partner from assigning to someone in a different institution and group', async () => {
    await dbConnect();
    const partner = await makeUser({ institution: 'IRCC', group: 'Intake team' });
    const stranger = await makeUser({ institution: 'ESDC', group: 'Other team' });
    const question = await Interaction.create({});

    const res = await runPost(
      { interactionId: question._id.toString(), assignedTo: stranger._id.toString() },
      { role: 'partner', userId: partner._id.toString() }
    );

    expect(res.statusCode).toBe(403);
  });

  it('lets a partner assign a question to someone in the QA group, whatever their institution/group', async () => {
    await dbConnect();
    const partner = await makeUser({ institution: 'IRCC', group: 'Intake team' });
    const qaMember = await makeUser({ institution: 'ESDC', group: 'AI Answers QA' });
    const question = await Interaction.create({});

    const res = await runPost(
      { interactionId: question._id.toString(), assignedTo: qaMember._id.toString() },
      { role: 'partner', userId: partner._id.toString() }
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload.assignedTo).toBe(qaMember._id.toString());
  });

  it('lets an admin assign a question to another user', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const partner = await makeUser();
    const question = await Interaction.create({});

    const res = await runPost(
      { interactionId: question._id.toString(), assignedTo: partner._id.toString() },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload.assignedTo).toBe(partner._id.toString());
  });

  it('rejects an inactive assignee', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const inactivePartner = await makeUser({ active: false });
    const question = await Interaction.create({});

    const res = await runPost(
      { interactionId: question._id.toString(), assignedTo: inactivePartner._id.toString() },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(400);
  });

  it('rejects assigning a question that is already assigned, instead of overwriting it', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const firstAssignee = await makeUser();
    const secondAssignee = await makeUser();
    const question = await Interaction.create({});

    const first = await runPost(
      { interactionId: question._id.toString(), assignedTo: firstAssignee._id.toString() },
      { role: 'admin', userId: admin._id.toString() }
    );
    expect(first.statusCode).toBe(200);

    const second = await runPost(
      { interactionId: question._id.toString(), assignedTo: secondAssignee._id.toString() },
      { role: 'admin', userId: admin._id.toString() }
    );
    expect(second.statusCode).toBe(409);
    expect(second.payload.code).toBe('already_assigned');

    const unchanged = await Interaction.findById(question._id).lean();
    expect(String(unchanged.assignedTo)).toBe(firstAssignee._id.toString());
  });

  it('404s for a question that does not exist', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });

    const res = await runPost(
      { interactionId: new mongoose.Types.ObjectId().toString(), assignedTo: admin._id.toString() },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(404);
  });

  it('rejects a missing interactionId with a 400, not a 500', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });

    const res = await runPost({ assignedTo: admin._id.toString() }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(400);
  });

  it('rejects a note over the character limit', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const question = await Interaction.create({});

    const res = await runPost(
      { interactionId: question._id.toString(), assignedTo: admin._id.toString(), notes: 'x'.repeat(501) },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(400);
    expect(res.payload.code).toBe('note_too_long');
    const unchanged = await Interaction.findById(question._id).lean();
    expect(unchanged.assignedTo).toBeFalsy();
  });

  it('accepts a note exactly at the character limit', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const question = await Interaction.create({});

    const res = await runPost(
      { interactionId: question._id.toString(), assignedTo: admin._id.toString(), notes: 'x'.repeat(500) },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(200);
  });
});

describe('chat-assign-interaction DELETE (unassign)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('409s instead of clearing a newer assignment made after the authorization read', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const first = await makeUser();
    const second = await makeUser();
    const question = await Interaction.create({ assignedTo: second._id, assignedBy: admin._id, assignedOn: new Date() });

    // The authorization read sees a stale assignee (first); the chat is now
    // assigned to second. The clear must not touch second's assignment.
    vi.spyOn(Interaction, 'findOne').mockReturnValueOnce({ lean: async () => ({ assignedTo: first._id, assignedBy: admin._id }) });

    const res = await runDelete({ interactionId: question._id.toString() }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(409);
    expect(res.payload.code).toBe('assignment_changed');
    const unchanged = await Interaction.findById(question._id).lean();
    expect(String(unchanged.assignedTo)).toBe(second._id.toString());
  });

  it('lets the current assignee remove their own assignment', async () => {
    await dbConnect();
    const assignee = await makeUser();
    const question = await Interaction.create({});
    await runPost({ interactionId: question._id.toString(), assignedTo: assignee._id.toString() }, { role: 'partner', userId: assignee._id.toString() });

    const res = await runDelete({ interactionId: question._id.toString() }, { role: 'partner', userId: assignee._id.toString() });

    expect(res.statusCode).toBe(200);
    const updated = await Interaction.findById(question._id).lean();
    expect(updated.assignedTo).toBeFalsy();
    expect(updated.assignedBy).toBeFalsy();
    expect(updated.assignedNotes).toBe('');
  });

  it('lets the original assigner remove an assignment they made for someone else', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const assignee = await makeUser();
    const question = await Interaction.create({});
    await runPost({ interactionId: question._id.toString(), assignedTo: assignee._id.toString() }, { role: 'admin', userId: admin._id.toString() });

    const res = await runDelete({ interactionId: question._id.toString() }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(200);
    const updated = await Interaction.findById(question._id).lean();
    expect(updated.assignedTo).toBeFalsy();
  });

  it('lets an institution-mate of the assignee remove the assignment', async () => {
    await dbConnect();
    const assignee = await makeUser({ institution: 'IRCC' });
    const institutionMate = await makeUser({ institution: 'IRCC' });
    const question = await Interaction.create({});
    await runPost({ interactionId: question._id.toString(), assignedTo: assignee._id.toString() }, { role: 'partner', userId: assignee._id.toString() });

    const res = await runDelete({ interactionId: question._id.toString() }, { role: 'partner', userId: institutionMate._id.toString() });

    expect(res.statusCode).toBe(200);
  });

  it('blocks an unrelated partner from removing someone else\'s assignment', async () => {
    await dbConnect();
    const assignee = await makeUser({ institution: 'IRCC' });
    const stranger = await makeUser({ institution: 'ESDC' });
    const question = await Interaction.create({});
    await runPost({ interactionId: question._id.toString(), assignedTo: assignee._id.toString() }, { role: 'partner', userId: assignee._id.toString() });

    const res = await runDelete({ interactionId: question._id.toString() }, { role: 'partner', userId: stranger._id.toString() });

    expect(res.statusCode).toBe(403);
    const unchanged = await Interaction.findById(question._id).lean();
    expect(String(unchanged.assignedTo)).toBe(assignee._id.toString());
  });

  it('is a no-op success on an already-unassigned question', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const question = await Interaction.create({});

    const res = await runDelete({ interactionId: question._id.toString() }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(200);
  });

  it('404s deleting a question that does not exist', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });

    const res = await runDelete({ interactionId: new mongoose.Types.ObjectId().toString() }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(404);
  });
});
