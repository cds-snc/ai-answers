import { describe, it, expect, beforeAll, vi } from 'vitest';
import mongoose from 'mongoose';
import handler from '../feedback-persist-public.js';
import dbConnect from '../../db/db-connect.js';
import { Chat } from '../../../models/chat.js';
import { Interaction } from '../../../models/interaction.js';
import { PublicFeedback } from '../../../models/publicFeedback.js';

const CHAT_ID = '4f3c2a90-1b2c-4d5e-8f70-112233445566';
const INTERACTION_ID = 'msg-1';

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

function createReq(body, chatIds = { [CHAT_ID]: true }) {
  return {
    method: 'POST',
    body,
    session: { chatIds },
  };
}

async function run(body, chatIds) {
  const res = createRes();
  await handler(createReq(body, chatIds), res);
  return res;
}

function validBody(publicFeedback = {}) {
  return {
    chatId: CHAT_ID,
    interactionId: INTERACTION_ID,
    publicFeedback: {
      feedback: 'yes',
      publicFeedbackReason: 'Saved me time',
      publicFeedbackScore: 3,
      ...publicFeedback,
    },
  };
}

describe('feedback-persist-public', () => {
  beforeAll(async () => {
    await dbConnect();
  });

  async function seedChat() {
    const interaction = await Interaction.create({ interactionId: INTERACTION_ID });
    const chat = await Chat.create({ chatId: CHAT_ID, interactions: [interaction._id] });
    return { chat, interaction };
  }

  it('stores the form fields when the chat belongs to the session', async () => {
    const { interaction } = await seedChat();
    const forgedId = new mongoose.Types.ObjectId();

    const res = await run(validBody({
      feedback: 'no',
      publicFeedbackReason: 'The link was broken',
      publicFeedbackScore: 10,
      _id: forgedId.toString(),
      createdAt: '2000-01-01T00:00:00.000Z',
      admin: true,
    }));

    expect(res.statusCode).toBe(200);
    const saved = await PublicFeedback.find();
    expect(saved).toHaveLength(1);
    expect(saved[0].feedback).toBe('no');
    expect(saved[0].publicFeedbackReason).toBe('The link was broken');
    expect(saved[0].publicFeedbackScore).toBe(10);
    expect(saved[0]._id.toString()).not.toBe(forgedId.toString());
    expect(saved[0].createdAt.getTime()).toBeGreaterThan(Date.parse('2020-01-01'));
    expect(saved[0].admin).toBeUndefined();
    const updated = await Interaction.findById(interaction._id);
    expect(updated.publicFeedback.toString()).toBe(saved[0]._id.toString());
  });

  it('rejects a chatId that is not on the session and writes nothing', async () => {
    const { interaction } = await seedChat();

    const res = await run(validBody(), { 'some-other-chat': true });

    expect(res.statusCode).toBe(403);
    expect(res.payload.error).toBe('invalid_chatId');
    expect(await PublicFeedback.countDocuments()).toBe(0);
    const updated = await Interaction.findById(interaction._id);
    expect(updated.publicFeedback).toBeFalsy();
  });

  it('rejects a request with no session', async () => {
    await seedChat();
    const res = createRes();
    await handler({ method: 'POST', body: validBody(), session: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(await PublicFeedback.countDocuments()).toBe(0);
  });

  it('does not attach feedback to an interaction on a different chat', async () => {
    const victim = await Interaction.create({ interactionId: 'victim-msg' });
    await Chat.create({ chatId: 'victim-chat', interactions: [victim._id] });
    const own = await Interaction.create({ interactionId: 'victim-msg' });
    await Chat.create({ chatId: CHAT_ID, interactions: [own._id] });

    const res = await run({
      chatId: CHAT_ID,
      interactionId: 'victim-msg',
      publicFeedback: { feedback: 'yes', publicFeedbackReason: 'x', publicFeedbackScore: 1 },
    });

    expect(res.statusCode).toBe(200);
    const victimAfter = await Interaction.findById(victim._id);
    expect(victimAfter.publicFeedback).toBeFalsy();
    const ownAfter = await Interaction.findById(own._id);
    expect(ownAfter.publicFeedback).toBeTruthy();
  });

  it('refuses a second write and keeps the first document', async () => {
    await seedChat();

    const first = await run(validBody());
    const second = await run(validBody({
      feedback: 'no',
      publicFeedbackReason: 'replaced',
      publicFeedbackScore: 9,
    }));

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    const saved = await PublicFeedback.find();
    expect(saved).toHaveLength(1);
    expect(saved[0].feedback).toBe('yes');
  });

  it('lets only one of two concurrent writes attach', async () => {
    await seedChat();
    const body = validBody();

    const [a, b] = await Promise.all([run(body), run(body)]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const saved = await PublicFeedback.find();
    expect(saved).toHaveLength(1);
    const interaction = await Interaction.findOne({ interactionId: INTERACTION_ID });
    expect(interaction.publicFeedback.toString()).toBe(saved[0]._id.toString());
  });

  it('rejects a non-string score without writing', async () => {
    await seedChat();
    const res = await run(validBody({
      feedback: 'yes',
      publicFeedbackReason: 'x',
      publicFeedbackScore: '3',
    }));
    expect(res.statusCode).toBe(400);
    expect(await PublicFeedback.countDocuments()).toBe(0);
  });

  it('rejects feedback outside yes or no', async () => {
    await seedChat();
    const res = await run(validBody({ feedback: 'maybe' }));
    expect(res.statusCode).toBe(400);
    expect(await PublicFeedback.countDocuments()).toBe(0);
  });

  it('rejects a score outside the known options', async () => {
    await seedChat();
    const res = await run(validBody({ publicFeedbackScore: 11 }));
    expect(res.statusCode).toBe(400);
    expect(await PublicFeedback.countDocuments()).toBe(0);
  });

  it('rejects a missing score and a score from the other answer', async () => {
    await seedChat();
    const body = validBody();
    delete body.publicFeedback.publicFeedbackScore;
    const missing = await run(body);
    const yesWithNoScore = await run(validBody({ feedback: 'yes', publicFeedbackScore: 10 }));
    const noWithYesScore = await run(validBody({ feedback: 'no', publicFeedbackScore: 1 }));
    expect(missing.statusCode).toBe(400);
    expect(yesWithNoScore.statusCode).toBe(400);
    expect(noWithYesScore.statusCode).toBe(400);
    expect(await PublicFeedback.countDocuments()).toBe(0);
  });

  it('rejects an over-long reason', async () => {
    await seedChat();
    const res = await run(validBody({ publicFeedbackReason: 'x'.repeat(301) }));
    expect(res.statusCode).toBe(400);
    expect(await PublicFeedback.countDocuments()).toBe(0);
  });

  it('stores a trimmed yes or no so the metrics match can see it', async () => {
    await seedChat();
    const res = await run(validBody({ feedback: 'yes ' }));
    expect(res.statusCode).toBe(200);
    const saved = await PublicFeedback.find();
    expect(saved).toHaveLength(1);
    expect(saved[0].feedback).toBe('yes');
  });

  it('returns 400 for a whitespace chatId and writes nothing', async () => {
    await seedChat();
    const res = await run({ ...validBody(), chatId: '   ' });
    expect(res.statusCode).toBe(400);
    expect(res.payload.error).toBeUndefined();
    expect(await PublicFeedback.countDocuments()).toBe(0);
  });

  it('accepts the numeric interaction id the chat UI sends', async () => {
    const interaction = await Interaction.create({ interactionId: '1' });
    await Chat.create({ chatId: CHAT_ID, interactions: [interaction._id] });

    const res = await run({ ...validBody(), interactionId: 1 });

    expect(res.statusCode).toBe(200);
    const updated = await Interaction.findById(interaction._id);
    expect(updated.publicFeedback).toBeTruthy();
    expect(await PublicFeedback.countDocuments()).toBe(1);
  });

  it('returns a generic message when saving throws and leaves the interaction free for a retry', async () => {
    const { interaction } = await seedChat();
    const save = vi.spyOn(PublicFeedback.prototype, 'save').mockRejectedValueOnce(new Error('E11000 duplicate key secret'));
    try {
      const res = await run(validBody());
      expect(res.statusCode).toBe(500);
      expect(res.payload).toEqual({ message: 'Failed to log public feedback' });
    } finally {
      save.mockRestore();
    }
    const updated = await Interaction.findById(interaction._id);
    expect(updated.publicFeedback).toBeFalsy();
    expect(await PublicFeedback.countDocuments()).toBe(0);

    const retry = await run(validBody());
    expect(retry.statusCode).toBe(200);
    const saved = await PublicFeedback.find();
    expect(saved).toHaveLength(1);
    const afterRetry = await Interaction.findById(interaction._id);
    expect(afterRetry.publicFeedback.toString()).toBe(saved[0]._id.toString());
  });

  it('stores feedback on retry when a failed save left a pointer to a missing document', async () => {
    const { interaction } = await seedChat();
    const save = vi.spyOn(PublicFeedback.prototype, 'save').mockRejectedValueOnce(new Error('E11000 duplicate key secret'));
    const clear = vi.spyOn(Interaction, 'updateOne').mockRejectedValueOnce(new Error('undo failed'));
    try {
      const res = await run(validBody());
      expect(res.statusCode).toBe(500);
      expect(res.payload).toEqual({ message: 'Failed to log public feedback' });
    } finally {
      save.mockRestore();
      clear.mockRestore();
    }

    const stuck = await Interaction.findById(interaction._id);
    expect(stuck.publicFeedback).toBeTruthy();
    expect(await PublicFeedback.countDocuments()).toBe(0);

    const retry = await run(validBody());
    expect(retry.statusCode).toBe(200);
    const saved = await PublicFeedback.find();
    expect(saved).toHaveLength(1);
    const afterRetry = await Interaction.findById(interaction._id);
    expect(afterRetry.publicFeedback.toString()).toBe(saved[0]._id.toString());
  });

  it('returns 400 when required fields are missing and 405 for other methods', async () => {
    const missing = await run({ chatId: CHAT_ID });
    expect(missing.statusCode).toBe(400);

    const res = createRes();
    await handler({ method: 'GET', body: validBody(), session: { chatIds: { [CHAT_ID]: true } } }, res);
    expect(res.statusCode).toBe(405);
  });
});
