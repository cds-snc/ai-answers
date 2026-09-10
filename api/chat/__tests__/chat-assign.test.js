import { describe, it, expect } from 'vitest';
import handler from '../chat-assign.js';
import dbConnect from '../../db/db-connect.js';
import { Chat } from '../../../models/chat.js';
import { User } from '../../../models/user.js';

function createReq({ method = 'POST', body, user }) {
  return {
    method,
    body,
    path: '/api/chat/chat-assign',
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

describe('chat-assign', () => {
  it('lets a partner assign a chat to themselves', async () => {
    await dbConnect();
    const partner = await makeUser();
    const chat = await Chat.create({ chatId: `chat-assign-self-${Date.now()}`, interactions: [] });

    const res = await runPost(
      { chatId: chat.chatId, assignedTo: partner._id.toString(), notes: 'reviewing' },
      { role: 'partner', userId: partner._id.toString() }
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload.assignedTo).toBe(partner._id.toString());
    expect(res.payload.assignedToEmail).toBe(partner.email);
    expect(res.payload.assignedNotes).toBe('reviewing');

    const updated = await Chat.findOne({ chatId: chat.chatId }).lean();
    expect(String(updated.assignedTo)).toBe(partner._id.toString());
    expect(String(updated.assignedBy)).toBe(partner._id.toString());
  });

  it('blocks a partner from assigning a chat to someone else', async () => {
    await dbConnect();
    const partner = await makeUser();
    const otherPartner = await makeUser();
    const chat = await Chat.create({ chatId: `chat-assign-blocked-${Date.now()}`, interactions: [] });

    const res = await runPost(
      { chatId: chat.chatId, assignedTo: otherPartner._id.toString() },
      { role: 'partner', userId: partner._id.toString() }
    );

    expect(res.statusCode).toBe(403);
    const updated = await Chat.findOne({ chatId: chat.chatId }).lean();
    expect(updated.assignedTo).toBeFalsy();
  });

  it('lets a partner assign a chat to someone sharing their institution', async () => {
    await dbConnect();
    const partner = await makeUser({ institution: 'IRCC' });
    const institutionMate = await makeUser({ institution: 'IRCC' });
    const chat = await Chat.create({ chatId: `chat-assign-institution-${Date.now()}`, interactions: [] });

    const res = await runPost(
      { chatId: chat.chatId, assignedTo: institutionMate._id.toString() },
      { role: 'partner', userId: partner._id.toString() }
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload.assignedTo).toBe(institutionMate._id.toString());
  });

  it('lets a partner assign a chat to someone sharing their group but not their institution', async () => {
    await dbConnect();
    const partner = await makeUser({ institution: 'IRCC', group: 'Intake team' });
    const groupMate = await makeUser({ institution: 'ESDC', group: 'Intake team' });
    const chat = await Chat.create({ chatId: `chat-assign-group-${Date.now()}`, interactions: [] });

    const res = await runPost(
      { chatId: chat.chatId, assignedTo: groupMate._id.toString() },
      { role: 'partner', userId: partner._id.toString() }
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload.assignedTo).toBe(groupMate._id.toString());
  });

  it('blocks a partner from assigning to someone in a different institution and group', async () => {
    await dbConnect();
    const partner = await makeUser({ institution: 'IRCC', group: 'Intake team' });
    const stranger = await makeUser({ institution: 'ESDC', group: 'Other team' });
    const chat = await Chat.create({ chatId: `chat-assign-stranger-${Date.now()}`, interactions: [] });

    const res = await runPost(
      { chatId: chat.chatId, assignedTo: stranger._id.toString() },
      { role: 'partner', userId: partner._id.toString() }
    );

    expect(res.statusCode).toBe(403);
  });

  it('lets an admin assign a chat to another user', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const partner = await makeUser();
    const chat = await Chat.create({ chatId: `chat-assign-admin-${Date.now()}`, interactions: [] });

    const res = await runPost(
      { chatId: chat.chatId, assignedTo: partner._id.toString() },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload.assignedTo).toBe(partner._id.toString());
  });

  it('rejects an inactive assignee', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const inactivePartner = await makeUser({ active: false });
    const chat = await Chat.create({ chatId: `chat-assign-inactive-${Date.now()}`, interactions: [] });

    const res = await runPost(
      { chatId: chat.chatId, assignedTo: inactivePartner._id.toString() },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(400);
  });

  it('rejects assigning a chat that is already assigned, instead of overwriting it', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const firstAssignee = await makeUser();
    const secondAssignee = await makeUser();
    const chat = await Chat.create({ chatId: `chat-assign-already-${Date.now()}`, interactions: [] });

    const first = await runPost(
      { chatId: chat.chatId, assignedTo: firstAssignee._id.toString() },
      { role: 'admin', userId: admin._id.toString() }
    );
    expect(first.statusCode).toBe(200);

    const second = await runPost(
      { chatId: chat.chatId, assignedTo: secondAssignee._id.toString() },
      { role: 'admin', userId: admin._id.toString() }
    );
    expect(second.statusCode).toBe(409);
    expect(second.payload.code).toBe('already_assigned');

    const unchanged = await Chat.findOne({ chatId: chat.chatId }).lean();
    expect(String(unchanged.assignedTo)).toBe(firstAssignee._id.toString());
  });

  it('404s for a chatId that does not exist', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });

    const res = await runPost(
      { chatId: 'chat-assign-does-not-exist', assignedTo: admin._id.toString() },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(404);
  });

  it('rejects a missing chatId with a 400, not a 500', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });

    const res = await runPost({ assignedTo: admin._id.toString() }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(400);
  });

  it('rejects a note over the character limit', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const chat = await Chat.create({ chatId: `chat-assign-note-limit-${Date.now()}`, interactions: [] });

    const res = await runPost(
      { chatId: chat.chatId, assignedTo: admin._id.toString(), notes: 'x'.repeat(501) },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(400);
    expect(res.payload.code).toBe('note_too_long');
    const unchanged = await Chat.findOne({ chatId: chat.chatId }).lean();
    expect(unchanged.assignedTo).toBeFalsy();
  });

  it('accepts a note exactly at the character limit', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const chat = await Chat.create({ chatId: `chat-assign-note-exact-${Date.now()}`, interactions: [] });

    const res = await runPost(
      { chatId: chat.chatId, assignedTo: admin._id.toString(), notes: 'x'.repeat(500) },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(200);
  });
});

describe('chat-assign DELETE (unassign)', () => {
  it('lets the current assignee remove their own assignment', async () => {
    await dbConnect();
    const assignee = await makeUser();
    const chat = await Chat.create({ chatId: `chat-unassign-self-${Date.now()}`, interactions: [] });
    await runPost({ chatId: chat.chatId, assignedTo: assignee._id.toString() }, { role: 'partner', userId: assignee._id.toString() });

    const res = await runDelete({ chatId: chat.chatId }, { role: 'partner', userId: assignee._id.toString() });

    expect(res.statusCode).toBe(200);
    const updated = await Chat.findOne({ chatId: chat.chatId }).lean();
    expect(updated.assignedTo).toBeFalsy();
    expect(updated.assignedBy).toBeFalsy();
    expect(updated.assignedNotes).toBe('');
  });

  it('lets the original assigner remove an assignment they made for someone else', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const assignee = await makeUser();
    const chat = await Chat.create({ chatId: `chat-unassign-assigner-${Date.now()}`, interactions: [] });
    await runPost({ chatId: chat.chatId, assignedTo: assignee._id.toString() }, { role: 'admin', userId: admin._id.toString() });

    const res = await runDelete({ chatId: chat.chatId }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(200);
    const updated = await Chat.findOne({ chatId: chat.chatId }).lean();
    expect(updated.assignedTo).toBeFalsy();
  });

  it('lets an institution-mate of the assignee remove the assignment', async () => {
    await dbConnect();
    const assignee = await makeUser({ institution: 'IRCC' });
    const institutionMate = await makeUser({ institution: 'IRCC' });
    const chat = await Chat.create({ chatId: `chat-unassign-mate-${Date.now()}`, interactions: [] });
    await runPost({ chatId: chat.chatId, assignedTo: assignee._id.toString() }, { role: 'partner', userId: assignee._id.toString() });

    const res = await runDelete({ chatId: chat.chatId }, { role: 'partner', userId: institutionMate._id.toString() });

    expect(res.statusCode).toBe(200);
  });

  it('blocks an unrelated partner from removing someone else\'s assignment', async () => {
    await dbConnect();
    const assignee = await makeUser({ institution: 'IRCC' });
    const stranger = await makeUser({ institution: 'ESDC' });
    const chat = await Chat.create({ chatId: `chat-unassign-blocked-${Date.now()}`, interactions: [] });
    await runPost({ chatId: chat.chatId, assignedTo: assignee._id.toString() }, { role: 'partner', userId: assignee._id.toString() });

    const res = await runDelete({ chatId: chat.chatId }, { role: 'partner', userId: stranger._id.toString() });

    expect(res.statusCode).toBe(403);
    const unchanged = await Chat.findOne({ chatId: chat.chatId }).lean();
    expect(String(unchanged.assignedTo)).toBe(assignee._id.toString());
  });

  it('is a no-op success on an already-unassigned chat', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const chat = await Chat.create({ chatId: `chat-unassign-noop-${Date.now()}`, interactions: [] });

    const res = await runDelete({ chatId: chat.chatId }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(200);
  });

  it('404s deleting a chatId that does not exist', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });

    const res = await runDelete({ chatId: 'chat-unassign-does-not-exist' }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(404);
  });
});
