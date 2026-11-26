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
    expect(saved[0].publicFeedbackReason).toBe('brokenLink');
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

    // The loser can observe the pointer before the insert is visible and
    // get 500. Either way one stored document is the one linked.
    expect([[200, 409], [200, 500]]).toContainEqual([a.statusCode, b.statusCode].sort());
    const saved = await PublicFeedback.find();
    expect(saved).toHaveLength(1);
    const interaction = await Interaction.findOne({ interactionId: INTERACTION_ID });
    expect(interaction.publicFeedback.toString()).toBe(saved[0]._id.toString());
  });

  it('keeps the saved document when the other request already saw an empty pointer', async () => {
    await seedChat();
    let savesStarted = 0;
    let releaseSave = () => {};
    const saveGate = new Promise((resolve) => {
      releaseSave = resolve;
    });
    const originalSave = PublicFeedback.prototype.save;
    const save = vi.spyOn(PublicFeedback.prototype, 'save').mockImplementation(function () {
      savesStarted += 1;
      const doc = this;
      const write = () => originalSave.call(doc);
      if (savesStarted === 1) return saveGate.then(write);
      return write();
    });

    let existsCalls = 0;
    let releaseLoser = () => {};
    const loserGate = new Promise((resolve) => {
      releaseLoser = resolve;
    });
    const originalExists = PublicFeedback.exists;
    const exists = vi.spyOn(PublicFeedback, 'exists').mockImplementation(function (filter) {
      existsCalls += 1;
      // The first check is the other request observing the pointer before
      // the insert is visible. Keep that result empty until the winning
      // save commits, then let the request continue.
      if (existsCalls === 1) {
        return loserGate.then(() => null);
      }
      return originalExists.call(PublicFeedback, filter);
    });

    // Claim first, then let the other request load that pointer and observe
    // it empty. The save commits before that request continues.
    const first = run(validBody());
    let second;
    try {
      await vi.waitFor(() => {
        expect(savesStarted).toBe(1);
      });
      second = run(validBody());
      await vi.waitFor(() => {
        expect(existsCalls).toBe(1);
      });
      releaseSave();
      const winner = await first;
      expect(winner.statusCode).toBe(200);
      const savedBeforeLoserContinues = await PublicFeedback.find();
      expect(savedBeforeLoserContinues).toHaveLength(1);
      const winnerId = savedBeforeLoserContinues[0]._id.toString();

      releaseLoser();
      const loser = await second;
      expect(loser.statusCode).toBe(409);
      const saved = await PublicFeedback.find();
      expect(saved).toHaveLength(1);
      expect(saved[0]._id.toString()).toBe(winnerId);
      const interaction = await Interaction.findOne({ interactionId: INTERACTION_ID });
      expect(interaction.publicFeedback.toString()).toBe(winnerId);
    } finally {
      releaseSave();
      releaseLoser();
      save.mockRestore();
      exists.mockRestore();
      await Promise.allSettled([first, second].filter(Boolean));
    }
  });

  it('links the saved document when the process stops between the clear and the restore', async () => {
    const { interaction } = await seedChat();
    const pointerId = new mongoose.Types.ObjectId();
    await Interaction.updateOne(
      { _id: interaction._id },
      { $set: { publicFeedback: pointerId } }
    );

    const originalUpdate = Interaction.updateOne;
    const update = vi.spyOn(Interaction, 'updateOne').mockImplementation(function (filter, ...rest) {
      const pending = originalUpdate.call(Interaction, filter, ...rest);
      if (filter?.publicFeedback && filter.publicFeedback.toString() === pointerId.toString()) {
        return pending.then(async () => {
          await PublicFeedback.create({
            _id: pointerId,
            feedback: 'yes',
            publicFeedbackReason: 'Saved me time',
            publicFeedbackScore: 3,
          });
          throw new Error('process stopped');
        });
      }
      return pending;
    });

    try {
      const crashed = await run(validBody());
      expect(crashed.statusCode).toBe(500);
      expect(crashed.payload).toEqual({ message: 'Failed to log public feedback' });
    } finally {
      update.mockRestore();
    }

    const mid = await Interaction.findById(interaction._id);
    expect(mid.publicFeedback).toBeFalsy();
    expect(mid.publicFeedbackRecover.toString()).toBe(pointerId.toString());
    expect(await PublicFeedback.countDocuments()).toBe(1);

    const retry = await run(validBody({
      feedback: 'no',
      publicFeedbackReason: 'replaced',
      publicFeedbackScore: 9,
    }));
    expect(retry.statusCode).toBe(409);
    const saved = await PublicFeedback.find();
    expect(saved).toHaveLength(1);
    expect(saved[0]._id.toString()).toBe(pointerId.toString());
    expect(saved[0].feedback).toBe('yes');
    const after = await Interaction.findById(interaction._id);
    expect(after.publicFeedback.toString()).toBe(pointerId.toString());
    expect(after.publicFeedbackRecover).toBeFalsy();
  });

  it('does not report feedback as recorded when restoring a saved document matches nothing', async () => {
    const { interaction } = await seedChat();
    const pointerId = new mongoose.Types.ObjectId();
    await PublicFeedback.create({
      _id: pointerId,
      feedback: 'yes',
      publicFeedbackReason: 'Saved me time',
      publicFeedbackScore: 3,
    });
    await Interaction.updateOne(
      { _id: interaction._id },
      { $set: { publicFeedback: null, publicFeedbackRecover: pointerId } }
    );

    const originalUpdate = Interaction.updateOne;
    const update = vi.spyOn(Interaction, 'updateOne').mockImplementation(function (filter, updateDoc, ...rest) {
      const restoredId = updateDoc?.$set?.publicFeedback;
      const clearsRecover = updateDoc?.$set?.publicFeedbackRecover === null;
      if (clearsRecover && restoredId?.toString() === pointerId.toString()) {
        return Promise.resolve({ matchedCount: 0, modifiedCount: 0 });
      }
      return originalUpdate.call(Interaction, filter, updateDoc, ...rest);
    });

    try {
      const res = await run(validBody({
        feedback: 'no',
        publicFeedbackReason: 'replaced',
        publicFeedbackScore: 9,
      }));
      expect(res.statusCode).toBe(500);
      expect(res.payload).toEqual({ message: 'Failed to log public feedback' });
    } finally {
      update.mockRestore();
    }

    const after = await Interaction.findById(interaction._id);
    expect(after.publicFeedback).toBeFalsy();
    expect(after.publicFeedbackRecover.toString()).toBe(pointerId.toString());
    const saved = await PublicFeedback.find();
    expect(saved).toHaveLength(1);
    expect(saved[0]._id.toString()).toBe(pointerId.toString());
    expect(saved[0].feedback).toBe('yes');
  });

  it('does not report feedback as recorded when the restore loses the claim', async () => {
    const { interaction } = await seedChat();
    const pointerId = new mongoose.Types.ObjectId();
    const claimId = new mongoose.Types.ObjectId();
    await Interaction.updateOne(
      { _id: interaction._id },
      { $set: { publicFeedback: pointerId } }
    );

    const originalUpdate = Interaction.updateOne;
    const update = vi.spyOn(Interaction, 'updateOne').mockImplementation(function (filter, updateDoc, ...rest) {
      const pending = originalUpdate.call(Interaction, filter, updateDoc, ...rest);
      if (filter?.publicFeedback?.toString() === pointerId.toString()) {
        return pending.then(async (result) => {
          await PublicFeedback.create({
            _id: pointerId,
            feedback: 'yes',
            publicFeedbackReason: 'Saved me time',
            publicFeedbackScore: 3,
          });
          // The other request claimed the empty pointer before this one
          // could put the saved id back.
          await originalUpdate.call(Interaction, { _id: interaction._id }, {
            $set: { publicFeedback: claimId, publicFeedbackRecover: null },
          });
          return result;
        });
      }
      return pending;
    });

    try {
      const res = await run(validBody({
        feedback: 'no',
        publicFeedbackReason: 'replaced',
        publicFeedbackScore: 9,
      }));
      expect(res.statusCode).toBe(500);
      expect(res.payload).toEqual({ message: 'Failed to log public feedback' });
    } finally {
      update.mockRestore();
    }

    const after = await Interaction.findById(interaction._id);
    expect(after.publicFeedback.toString()).toBe(claimId.toString());
    expect(await PublicFeedback.countDocuments()).toBe(1);
    expect((await PublicFeedback.findOne())._id.toString()).toBe(pointerId.toString());
  });

  it('stores feedback when a remembered id never got a document', async () => {
    const { interaction } = await seedChat();
    await Interaction.updateOne(
      { _id: interaction._id },
      { $set: { publicFeedbackRecover: new mongoose.Types.ObjectId() } }
    );

    const res = await run(validBody());

    expect(res.statusCode).toBe(200);
    const saved = await PublicFeedback.find();
    expect(saved).toHaveLength(1);
    const after = await Interaction.findById(interaction._id);
    expect(after.publicFeedback.toString()).toBe(saved[0]._id.toString());
    expect(after.publicFeedbackRecover).toBeFalsy();
  });

  it('drops the unlinked document when the other request stored its own', async () => {
    await seedChat();
    let savesStarted = 0;
    let releaseSave = () => {};
    const saveGate = new Promise((resolve) => {
      releaseSave = resolve;
    });
    const originalSave = PublicFeedback.prototype.save;
    const save = vi.spyOn(PublicFeedback.prototype, 'save').mockImplementation(function () {
      savesStarted += 1;
      const doc = this;
      const write = () => originalSave.call(doc);
      if (savesStarted === 1) return saveGate.then(write);
      return write();
    });

    const first = run(validBody());
    let second;
    try {
      await vi.waitFor(() => {
        expect(savesStarted).toBe(1);
      });
      // The first request is inside save(), so its claim names a document
      // that is not stored yet. The second request clears that claim and
      // stores its own document before the first insert commits.
      second = run(validBody());
      const other = await second;
      expect(other.statusCode).toBe(200);

      releaseSave();
      const blocked = await first;
      expect(blocked.statusCode).toBe(409);
      expect(blocked.payload).toEqual({ message: 'Public feedback already recorded' });
      const saved = await PublicFeedback.find();
      expect(saved).toHaveLength(1);
      const interaction = await Interaction.findOne({ interactionId: INTERACTION_ID });
      expect(interaction.publicFeedback.toString()).toBe(saved[0]._id.toString());
      expect(interaction.publicFeedbackRecover).toBeFalsy();
    } finally {
      releaseSave();
      save.mockRestore();
      await Promise.allSettled([first, second].filter(Boolean));
    }
  });

  it('drops its document when the other claim is not stored yet', async () => {
    await seedChat();
    let savesStarted = 0;
    const release = [];
    const originalSave = PublicFeedback.prototype.save;
    const save = vi.spyOn(PublicFeedback.prototype, 'save').mockImplementation(function () {
      const index = savesStarted;
      savesStarted += 1;
      const doc = this;
      const gate = new Promise((resolve) => {
        release[index] = resolve;
      });
      return gate.then(() => originalSave.call(doc));
    });

    const first = run(validBody());
    let second;
    try {
      await vi.waitFor(() => {
        expect(savesStarted).toBe(1);
      });
      second = run(validBody());
      await vi.waitFor(() => {
        expect(savesStarted).toBe(2);
      });
      // The second request holds the pointer and has not inserted yet.
      // The first request must not report the feedback as recorded, and
      // its document must not stay behind after the pointer moved.
      release[0]();
      const earlier = await first;
      expect(earlier.statusCode).toBe(500);
      expect(earlier.payload).toEqual({ message: 'Failed to log public feedback' });
      expect(await PublicFeedback.countDocuments()).toBe(0);

      release[1]();
      const later = await second;
      expect(later.statusCode).toBe(200);
      const saved = await PublicFeedback.find();
      expect(saved).toHaveLength(1);
      const interaction = await Interaction.findOne({ interactionId: INTERACTION_ID });
      expect(interaction.publicFeedback.toString()).toBe(saved[0]._id.toString());
    } finally {
      release.forEach((unlock) => unlock?.());
      save.mockRestore();
      await Promise.allSettled([first, second].filter(Boolean));
    }
  });

  it('does not report feedback as recorded when the winning save throws', async () => {
    await seedChat();
    let started = 0;
    let releaseSave = () => {};
    const gate = new Promise((resolve) => {
      releaseSave = resolve;
    });
    // Hold the winning insert so the other request observes a pointer with
    // no document. It must not be told the feedback was recorded.
    const save = vi.spyOn(PublicFeedback.prototype, 'save').mockImplementation(() => {
      started += 1;
      return gate.then(() => Promise.reject(new Error('E11000 duplicate key secret')));
    });
    const first = run(validBody());
    const second = run(validBody());
    try {
      await vi.waitFor(() => {
        expect(started).toBe(1);
      });
      const loser = await Promise.race([first, second]);
      expect(loser.statusCode).toBe(500);
      expect(loser.payload).toEqual({ message: 'Failed to log public feedback' });
      releaseSave();
      const [a, b] = await Promise.all([first, second]);
      expect(a.statusCode).not.toBe(409);
      expect(b.statusCode).not.toBe(409);
      expect(await PublicFeedback.countDocuments()).toBe(0);
      const interaction = await Interaction.findOne({ interactionId: INTERACTION_ID });
      expect(interaction.publicFeedback).toBeFalsy();
      save.mockRestore();

      const retry = await run(validBody());
      expect(retry.statusCode).toBe(200);
      const saved = await PublicFeedback.find();
      expect(saved).toHaveLength(1);
      const afterRetry = await Interaction.findOne({ interactionId: INTERACTION_ID });
      expect(afterRetry.publicFeedback.toString()).toBe(saved[0]._id.toString());
    } finally {
      releaseSave();
      save.mockRestore();
      await Promise.allSettled([first, second]);
    }
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
    expect(updated.publicFeedbackRecover).toBeFalsy();
    expect(await PublicFeedback.countDocuments()).toBe(0);

    const retry = await run(validBody());
    expect(retry.statusCode).toBe(200);
    const saved = await PublicFeedback.find();
    expect(saved).toHaveLength(1);
    const afterRetry = await Interaction.findById(interaction._id);
    expect(afterRetry.publicFeedback.toString()).toBe(saved[0]._id.toString());
    expect(afterRetry.publicFeedbackRecover).toBeFalsy();
  });

  it('keeps the id when a save throws after the document is stored', async () => {
    const { interaction } = await seedChat();
    const originalSave = PublicFeedback.prototype.save;
    const save = vi.spyOn(PublicFeedback.prototype, 'save').mockImplementationOnce(async function () {
      await originalSave.call(this);
      throw new Error('connection dropped');
    });
    try {
      const res = await run(validBody());
      expect(res.statusCode).toBe(500);
      expect(res.payload).toEqual({ message: 'Failed to log public feedback' });
    } finally {
      save.mockRestore();
    }

    const saved = await PublicFeedback.find();
    expect(saved).toHaveLength(1);
    const updated = await Interaction.findById(interaction._id);
    expect(updated.publicFeedback).toBeFalsy();
    expect(updated.publicFeedbackRecover.toString()).toBe(saved[0]._id.toString());

    const retry = await run(validBody({
      feedback: 'no',
      publicFeedbackReason: 'replaced',
      publicFeedbackScore: 9,
    }));
    expect(retry.statusCode).toBe(409);
    const after = await Interaction.findById(interaction._id);
    expect(after.publicFeedback.toString()).toBe(saved[0]._id.toString());
    expect(after.publicFeedbackRecover).toBeFalsy();
    expect(await PublicFeedback.countDocuments()).toBe(1);
    expect((await PublicFeedback.findOne()).feedback).toBe('yes');
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
