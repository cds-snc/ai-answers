import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.TWOFA_SECRET = process.env.TWOFA_SECRET || 'test-twofa-secret';

vi.mock('../SettingsService.js', () => ({
  SettingsService: {
    get: vi.fn(),
    toBoolean: vi.fn((value, defaultValue = true) => {
      if (value === undefined || value === null || value === '') return defaultValue;
      if (typeof value === 'boolean') return value;
      return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
    }),
  },
}));

// Real module needs GC_NOTIFY_API_KEY at import time.
vi.mock('../GCNotifyService.js', () => ({ default: { sendEmail: vi.fn() } }));

vi.mock('../ServerLoggingService.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Minimal in-memory stand-in for the User model: just the calls TwoFAService makes.
const docs = new Map();
vi.mock('../../models/user.js', () => {
  const clone = (d) => (d ? { ...d } : null);
  // Enough of Mongo's matching for the filters TwoFAService uses: equality
  // (null also matches a missing field), $ne, $gt, $lte and $or. Dates compare by value.
  const val = (x) => (x instanceof Date ? x.getTime() : x ?? null);
  const fieldMatches = (actual, cond) => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      return Object.entries(cond).every(([op, v]) => {
        if (op === '$ne') return val(actual) !== val(v);
        if (actual == null) return false;
        if (op === '$gt') return val(actual) > val(v);
        if (op === '$lte') return val(actual) <= val(v);
        throw new Error(`mock does not support ${op}`);
      });
    }
    return val(actual) === val(cond);
  };
  const matches = (d, filter) => Object.entries(filter).every(([k, v]) =>
    (k === '$or' ? v.some((f) => matches(d, f)) : fieldMatches(d[k], v)));
  const apply = (d, update) => {
    for (const [k, v] of Object.entries(update.$inc || {})) d[k] = (d[k] || 0) + v;
    for (const [k, v] of Object.entries(update.$set || {})) d[k] = v;
  };
  return {
    User: {
      findById: vi.fn(async (id) => clone(docs.get(String(id)))),
      findOneAndUpdate: vi.fn(async (filter, update) => {
        const d = docs.get(String(filter._id));
        if (!d || !matches(d, filter)) return null;
        apply(d, update);
        return clone(d);
      }),
      updateOne: vi.fn(async (filter, update) => {
        const d = docs.get(String(filter._id));
        if (d && matches(d, filter)) apply(d, update);
      }),
    },
  };
});

import TwoFAService, { MAX_ATTEMPTS, CODE_TTL_MS, LOCKOUT_MS, RESEND_COOLDOWN_MS } from '../TwoFAService.js';
import GCNotifyService from '../GCNotifyService.js';
import { User } from '../../models/user.js';
import { SettingsService } from '../SettingsService.js';

const ID = '507f1f77bcf86cd799439011';

function freshUser(extra = {}) {
  docs.set(ID, {
    _id: ID,
    email: 'admin@canada.ca',
    twoFACode: null,
    twoFAExpires: null,
    twoFAAttempts: 0,
    twoFALockedUntil: null,
    twoFALastSentAt: null,
    ...extra,
  });
}

// Send a code and return the 6 digits that went into the email.
async function sendAndCapture(opts = {}) {
  const send = vi.spyOn(GCNotifyService, 'sendEmail').mockResolvedValue({ success: true });
  const res = await TwoFAService.sendChallenge({ userId: ID, ...opts });
  const code = send.mock.calls[0]?.[0]?.personalisation?.verify_code;
  send.mockRestore();
  return { res, code };
}

describe('TwoFAService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    docs.clear();
    freshUser();
    SettingsService.get.mockImplementation((key) => {
      if (key === 'twoFA.enabled') return 'true';
      if (key === 'twoFA.templateId') return 'tpl-2fa';
      return null;
    });
  });

  afterEach(() => vi.useRealTimers());

  it('emails a 6-digit code and stores only a hash of it', async () => {
    const { res, code } = await sendAndCapture();
    expect(res.success).toBe(true);
    expect(code).toMatch(/^\d{6}$/);
    expect(docs.get(ID).twoFACode).toMatch(/^[0-9a-f]{64}$/);
    expect(docs.get(ID).twoFACode).not.toContain(code);
    expect(docs.get(ID).twoFAExpires.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not return the code to the caller', async () => {
    const { res } = await sendAndCapture();
    expect(JSON.stringify(res)).not.toMatch(/\d{6}/);
  });

  it('accepts the right code once, then rejects it', async () => {
    const { code } = await sendAndCapture();
    expect((await TwoFAService.verifyChallenge({ userId: ID, code })).success).toBe(true);
    const replay = await TwoFAService.verifyChallenge({ userId: ID, code });
    expect(replay.success).toBe(false);
  });

  it('rejects a wrong code and malformed input', async () => {
    const { code } = await sendAndCapture();
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await TwoFAService.verifyChallenge({ userId: ID, code: wrong })).success).toBe(false);
    expect((await TwoFAService.verifyChallenge({ userId: ID, code: '12' })).success).toBe(false);
    expect((await TwoFAService.verifyChallenge({ userId: ID, code: undefined })).success).toBe(false);
  });

  it.each(['', '   ', '12', '1234567', 'abcdef', '12 456', undefined])(
    'refuses %j without counting it as a guess', async (typo) => {
      await sendAndCapture();
      const res = await TwoFAService.verifyChallenge({ userId: ID, code: typo });
      expect(res).toEqual({ success: false, reason: 'invalid' });
      expect(docs.get(ID).twoFAAttempts).toBe(0);
    }
  );

  it('accepts a code with spaces around or inside it', async () => {
    const { code } = await sendAndCapture();
    const spaced = ` ${code.slice(0, 3)} ${code.slice(3)} `;
    expect((await TwoFAService.verifyChallenge({ userId: ID, code: spaced })).success).toBe(true);
  });

  it.each([[['123456']], [123456], [{ code: '123456' }]])('refuses a code that is not a string (%j)', async (notString) => {
    await sendAndCapture();
    const res = await TwoFAService.verifyChallenge({ userId: ID, code: notString });
    expect(res).toEqual({ success: false, reason: 'invalid' });
    expect(docs.get(ID).twoFAAttempts).toBe(0);
  });

  it('refuses a malformed code without touching the database', async () => {
    await sendAndCapture();
    User.findById.mockClear();
    User.findOneAndUpdate.mockClear();
    User.updateOne.mockClear();
    await TwoFAService.verifyChallenge({ userId: ID, code: 'abc' });
    expect(User.findById).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('returns the updated user on success, so the caller needs no second read', async () => {
    const { code } = await sendAndCapture();
    const res = await TwoFAService.verifyChallenge({ userId: ID, code });
    expect(res.success).toBe(true);
    expect(res.user).toMatchObject({ _id: ID, email: 'admin@canada.ca', twoFACode: null, twoFAAttempts: 0 });
  });

  it('uses a user document it is given instead of reading it again', async () => {
    const send = vi.spyOn(GCNotifyService, 'sendEmail').mockResolvedValue({ success: true });
    User.findById.mockClear();
    const res = await TwoFAService.sendChallenge({ user: { ...docs.get(ID) } });
    expect(res.success).toBe(true);
    expect(User.findById).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(docs.get(ID).twoFACode).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects an expired code', async () => {
    vi.useFakeTimers();
    const { code } = await sendAndCapture();
    vi.advanceTimersByTime(CODE_TTL_MS + 1000);
    expect((await TwoFAService.verifyChallenge({ userId: ID, code })).success).toBe(false);
  });

  it('locks after MAX_ATTEMPTS wrong codes, and then even the right code fails', async () => {
    const { code } = await sendAndCapture();
    const wrong = code === '000000' ? '111111' : '000000';
    let last;
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      last = await TwoFAService.verifyChallenge({ userId: ID, code: wrong });
    }
    expect(last.reason).toBe('locked');
    expect(docs.get(ID).twoFACode).toBeNull();
    const right = await TwoFAService.verifyChallenge({ userId: ID, code });
    expect(right.success).toBe(false);
    expect(right.reason).toBe('locked');
  });

  it('does not give back guesses when a new code is requested', async () => {
    const first = await sendAndCapture();
    const wrong = first.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) {
      await TwoFAService.verifyChallenge({ userId: ID, code: wrong });
    }
    expect(docs.get(ID).twoFAAttempts).toBe(MAX_ATTEMPTS - 1);

    await sendAndCapture(); // fresh code, counter must survive
    expect(docs.get(ID).twoFAAttempts).toBe(MAX_ATTEMPTS - 1);
    const res = await TwoFAService.verifyChallenge({ userId: ID, code: wrong });
    expect(res.reason).toBe('locked');
  });

  it('a request working from a read taken before the lockout ended cannot reset the count', async () => {
    vi.useFakeTimers();
    freshUser({ twoFALockedUntil: new Date(Date.now() + LOCKOUT_MS) });
    vi.advanceTimersByTime(LOCKOUT_MS + 1000);
    const { code } = await sendAndCapture();
    const wrong = code === '000000' ? '111111' : '000000';
    const staleRead = { ...docs.get(ID) }; // still shows the ended lock

    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) {
      await TwoFAService.verifyChallenge({ userId: ID, code: wrong });
    }
    expect(docs.get(ID).twoFAAttempts).toBe(MAX_ATTEMPTS - 1);

    // A slow parallel guess resumes with its stale read. It must not clear the count.
    User.findById.mockResolvedValueOnce(staleRead);
    const res = await TwoFAService.verifyChallenge({ userId: ID, code: wrong });
    expect(res.reason).toBe('locked');
  });

  it('does not count a guess once the code has expired, even from an older read', async () => {
    vi.useFakeTimers();
    const { code } = await sendAndCapture();
    const staleRead = { ...docs.get(ID) };
    vi.advanceTimersByTime(CODE_TTL_MS + 1000);
    User.findById.mockResolvedValueOnce(staleRead);
    const res = await TwoFAService.verifyChallenge({ userId: ID, code });
    expect(res).toEqual({ success: false, reason: 'invalid' });
    expect(docs.get(ID).twoFAAttempts).toBe(0);
  });

  it('refuses to send while locked', async () => {
    freshUser({ twoFALockedUntil: new Date(Date.now() + LOCKOUT_MS) });
    const send = vi.spyOn(GCNotifyService, 'sendEmail');
    const res = await TwoFAService.sendChallenge({ userId: ID });
    expect(res.reason).toBe('locked');
    expect(send).not.toHaveBeenCalled();
  });

  it('lets the user try again once the lockout has ended', async () => {
    vi.useFakeTimers();
    freshUser({ twoFALockedUntil: new Date(Date.now() + LOCKOUT_MS), twoFAAttempts: 0 });
    vi.advanceTimersByTime(LOCKOUT_MS + 1000);
    const { res, code } = await sendAndCapture();
    expect(res.success).toBe(true);
    expect((await TwoFAService.verifyChallenge({ userId: ID, code })).success).toBe(true);
  });

  it('enforces the resend cooldown only on resend', async () => {
    await sendAndCapture();
    const tooSoon = await TwoFAService.sendChallenge({ userId: ID, resend: true });
    expect(tooSoon.reason).toBe('cooldown');

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + RESEND_COOLDOWN_MS + 1000);
    const { res } = await sendAndCapture({ resend: true });
    expect(res.success).toBe(true);
  });

  it('a new code invalidates the old one', async () => {
    const first = await sendAndCapture();
    const second = await sendAndCapture();
    if (first.code !== second.code) {
      expect((await TwoFAService.verifyChallenge({ userId: ID, code: first.code })).success).toBe(false);
    }
    expect((await TwoFAService.verifyChallenge({ userId: ID, code: second.code })).success).toBe(true);
  });

  it('a failed resend starts no cooldown', async () => {
    await sendAndCapture();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + RESEND_COOLDOWN_MS + 1000);
    const send = vi.spyOn(GCNotifyService, 'sendEmail').mockResolvedValue({ success: false });
    const failed = await TwoFAService.sendChallenge({ userId: ID, resend: true });
    send.mockRestore();
    expect(failed).toEqual({ success: false, reason: 'send_failed' });

    const retry = await sendAndCapture({ resend: true });
    expect(retry.res.success).toBe(true);
  });

  it('keeps the current code when the email fails', async () => {
    const first = await sendAndCapture();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + RESEND_COOLDOWN_MS + 1000);
    const send = vi.spyOn(GCNotifyService, 'sendEmail').mockResolvedValue({ success: false });
    await TwoFAService.sendChallenge({ userId: ID, resend: true });
    send.mockRestore();
    expect((await TwoFAService.verifyChallenge({ userId: ID, code: first.code })).success).toBe(true);
  });

  it('does nothing when 2FA is disabled', async () => {
    SettingsService.get.mockImplementation((key) => (key === 'twoFA.enabled' ? 'false' : null));
    const send = vi.spyOn(GCNotifyService, 'sendEmail');
    expect((await TwoFAService.sendChallenge({ userId: ID })).reason).toBe('twofa_disabled');
    expect((await TwoFAService.verifyChallenge({ userId: ID, code: '123456' })).success).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['neither', {}],
    ['both', { user: { _id: ID }, userId: ID }],
    ['a user with no _id', { user: { email: 'admin@canada.ca' } }],
    ['null for both', { user: null, userId: null }],
  ])('sendChallenge refuses %s of user and userId', async (_name, args) => {
    await expect(TwoFAService.sendChallenge(args)).rejects.toThrow();
  });

  it('treats a null user as not given', async () => {
    const { res } = await sendAndCapture({ user: null });
    expect(res.success).toBe(true);
  });

  it('rejects an id that is not an ObjectId string', async () => {
    await expect(TwoFAService.sendChallenge({ userId: { $ne: null } })).rejects.toThrow();
  });

  describe('hash key', () => {
    const saved = {};
    const KEYS = ['TWOFA_SECRET', 'SESSION_SECRET', 'JWT_SECRET_KEY'];
    beforeEach(() => KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }));
    afterEach(() => KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }));

    // PR preview Lambdas get JWT_SECRET_KEY but neither of the other two.
    it('works with only JWT_SECRET_KEY set', async () => {
      process.env.JWT_SECRET_KEY = 'preview-jwt-secret';
      const { res, code } = await sendAndCapture();
      expect(res.success).toBe(true);
      expect((await TwoFAService.verifyChallenge({ userId: ID, code })).success).toBe(true);
    });

    it('fails with twofa_no_secret when no key is set', async () => {
      await expect(sendAndCapture()).rejects.toMatchObject({ code: 'twofa_no_secret' });
    });
  });
});
