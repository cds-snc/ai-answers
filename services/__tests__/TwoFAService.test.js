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
  const matches = (d, filter) => Object.entries(filter).every(([k, v]) => d[k] === v);
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
        if (d) apply(d, update);
      }),
    },
  };
});

import TwoFAService, { MAX_ATTEMPTS, CODE_TTL_MS, LOCKOUT_MS, RESEND_COOLDOWN_MS } from '../TwoFAService.js';
import GCNotifyService from '../GCNotifyService.js';
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
  const res = await TwoFAService.sendChallenge({ userOrId: ID, ...opts });
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
    expect((await TwoFAService.verifyChallenge({ userOrId: ID, code })).success).toBe(true);
    const replay = await TwoFAService.verifyChallenge({ userOrId: ID, code });
    expect(replay.success).toBe(false);
  });

  it('rejects a wrong code and malformed input', async () => {
    const { code } = await sendAndCapture();
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await TwoFAService.verifyChallenge({ userOrId: ID, code: wrong })).success).toBe(false);
    expect((await TwoFAService.verifyChallenge({ userOrId: ID, code: '12' })).success).toBe(false);
    expect((await TwoFAService.verifyChallenge({ userOrId: ID, code: undefined })).success).toBe(false);
  });

  it('rejects an expired code', async () => {
    vi.useFakeTimers();
    const { code } = await sendAndCapture();
    vi.advanceTimersByTime(CODE_TTL_MS + 1000);
    expect((await TwoFAService.verifyChallenge({ userOrId: ID, code })).success).toBe(false);
  });

  it('locks after MAX_ATTEMPTS wrong codes, and then even the right code fails', async () => {
    const { code } = await sendAndCapture();
    const wrong = code === '000000' ? '111111' : '000000';
    let last;
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      last = await TwoFAService.verifyChallenge({ userOrId: ID, code: wrong });
    }
    expect(last.reason).toBe('locked');
    expect(docs.get(ID).twoFACode).toBeNull();
    const right = await TwoFAService.verifyChallenge({ userOrId: ID, code });
    expect(right.success).toBe(false);
    expect(right.reason).toBe('locked');
  });

  it('does not give back guesses when a new code is requested', async () => {
    const first = await sendAndCapture();
    const wrong = first.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) {
      await TwoFAService.verifyChallenge({ userOrId: ID, code: wrong });
    }
    expect(docs.get(ID).twoFAAttempts).toBe(MAX_ATTEMPTS - 1);

    await sendAndCapture(); // fresh code, counter must survive
    expect(docs.get(ID).twoFAAttempts).toBe(MAX_ATTEMPTS - 1);
    const res = await TwoFAService.verifyChallenge({ userOrId: ID, code: wrong });
    expect(res.reason).toBe('locked');
  });

  it('refuses to send while locked', async () => {
    freshUser({ twoFALockedUntil: new Date(Date.now() + LOCKOUT_MS) });
    const send = vi.spyOn(GCNotifyService, 'sendEmail');
    const res = await TwoFAService.sendChallenge({ userOrId: ID });
    expect(res.reason).toBe('locked');
    expect(send).not.toHaveBeenCalled();
  });

  it('lets the user try again once the lockout has ended', async () => {
    vi.useFakeTimers();
    freshUser({ twoFALockedUntil: new Date(Date.now() + LOCKOUT_MS), twoFAAttempts: 0 });
    vi.advanceTimersByTime(LOCKOUT_MS + 1000);
    const { res, code } = await sendAndCapture();
    expect(res.success).toBe(true);
    expect((await TwoFAService.verifyChallenge({ userOrId: ID, code })).success).toBe(true);
  });

  it('enforces the resend cooldown only on resend', async () => {
    await sendAndCapture();
    const tooSoon = await TwoFAService.sendChallenge({ userOrId: ID, resend: true });
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
      expect((await TwoFAService.verifyChallenge({ userOrId: ID, code: first.code })).success).toBe(false);
    }
    expect((await TwoFAService.verifyChallenge({ userOrId: ID, code: second.code })).success).toBe(true);
  });

  it('does nothing when 2FA is disabled', async () => {
    SettingsService.get.mockImplementation((key) => (key === 'twoFA.enabled' ? 'false' : null));
    const send = vi.spyOn(GCNotifyService, 'sendEmail');
    expect((await TwoFAService.sendChallenge({ userOrId: ID })).reason).toBe('twofa_disabled');
    expect((await TwoFAService.verifyChallenge({ userOrId: ID, code: '123456' })).success).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects an id that is not an ObjectId string', async () => {
    await expect(TwoFAService.sendChallenge({ userOrId: { $ne: null } })).rejects.toThrow();
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
      expect((await TwoFAService.verifyChallenge({ userOrId: ID, code })).success).toBe(true);
    });

    it('fails with twofa_no_secret when no key is set', async () => {
      await expect(sendAndCapture()).rejects.toMatchObject({ code: 'twofa_no_secret' });
    });
  });
});
