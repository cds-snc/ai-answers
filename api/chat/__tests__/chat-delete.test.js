import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import handler from '../chat-delete.js';
import dbConnect from '../../db/db-connect.js';
import { Chat } from '../../../models/chat.js';
import { Interaction } from '../../../models/interaction.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';
import { User } from '../../../models/user.js';

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    setHeader: () => {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function signedIn(email, role) {
  const user = await User.create({ email, password: 'not-used-here', role, active: true });
  return { role, email, userId: user._id.toString() };
}

async function runDelete(chatId, user) {
  const res = createRes();
  await handler({
    method: 'DELETE',
    query: { chatId },
    path: '/api/chat/chat-delete',
    user,
    isAuthenticated: () => true,
  }, res);
  return res;
}

// Admins delete any chat. Partners only one they started, holding no one
// else's evaluations.
describe('chat-delete', () => {
  beforeAll(async () => {
    await dbConnect();
  });

  afterEach(async () => {
    await Chat.deleteMany({});
    await Interaction.deleteMany({});
    await ExpertFeedback.deleteMany({});
    await User.deleteMany({});
  });

  const chatFor = async (owner, expertEmail) => {
    const feedback = expertEmail ? await ExpertFeedback.create({ totalScore: 100, expertEmail }) : null;
    const interaction = await Interaction.create(feedback ? { expertFeedback: feedback._id } : {});
    const chat = await Chat.create({ chatId: 'chat-delete-test', interactions: [interaction._id], user: owner });
    return { feedback, interaction, chat };
  };

  const expectUnchanged = async ({ chat, interaction, feedback }) => {
    expect(await Chat.findById(chat._id)).not.toBeNull();
    expect(await Interaction.findById(interaction._id)).not.toBeNull();
    if (feedback) expect(await ExpertFeedback.findById(feedback._id)).not.toBeNull();
  };

  it('lets an admin delete anyone\'s chat, with its evaluations', async () => {
    const admin = await signedIn('admin@example.com', 'admin');
    const { feedback, chat } = await chatFor(new mongoose.Types.ObjectId(), 'someone@example.com');

    const res = await runDelete(chat.chatId, admin);

    expect(res.statusCode).toBe(200);
    expect(await Chat.findById(chat._id)).toBeNull();
    expect(await ExpertFeedback.findById(feedback._id)).toBeNull();
  });

  it('lets a partner delete a chat they started, rated only by them', async () => {
    const partner = await signedIn('partner@example.com', 'partner');
    const { feedback, chat } = await chatFor(partner.userId, 'Partner@example.com');

    const res = await runDelete(chat.chatId, partner);

    expect(res.statusCode).toBe(200);
    expect(await Chat.findById(chat._id)).toBeNull();
    expect(await ExpertFeedback.findById(feedback._id)).toBeNull();
  });

  it('lets a partner delete a chat they started with no evaluations', async () => {
    const partner = await signedIn('partner@example.com', 'partner');
    const { chat } = await chatFor(partner.userId, null);

    const res = await runDelete(chat.chatId, partner);

    expect(res.statusCode).toBe(200);
    expect(await Chat.findById(chat._id)).toBeNull();
  });

  it('refuses a partner deleting someone else\'s chat, and changes nothing', async () => {
    const partner = await signedIn('partner@example.com', 'partner');
    const docs = await chatFor(new mongoose.Types.ObjectId(), null);

    const res = await runDelete(docs.chat.chatId, partner);

    expect(res.statusCode).toBe(403);
    expect(res.payload.code).toBe('notOwnChat');
    await expectUnchanged(docs);
  });

  it('refuses a partner deleting a chat with no recorded owner', async () => {
    const partner = await signedIn('partner@example.com', 'partner');
    const docs = await chatFor(undefined, null);

    const res = await runDelete(docs.chat.chatId, partner);

    expect(res.statusCode).toBe(403);
    await expectUnchanged(docs);
  });

  it('refuses a partner deleting their own chat that someone else evaluated', async () => {
    const partner = await signedIn('partner@example.com', 'partner');
    const docs = await chatFor(partner.userId, 'qa-admin@example.com');

    const res = await runDelete(docs.chat.chatId, partner);

    expect(res.statusCode).toBe(403);
    expect(res.payload.code).toBe('othersEvaluations');
    await expectUnchanged(docs);
  });
});
