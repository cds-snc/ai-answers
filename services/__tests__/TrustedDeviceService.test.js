import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory stand-in for the TrustedDevice model: enough of create / findOne /
// deleteMany for the queries the service makes, so expiry and user matching
// are tested against real rows rather than mocked answers.
const rows = [];
const matches = (row, q) => Object.entries(q).every(([k, v]) => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('$gt' in v) return row[k] > v.$gt;
    if ('$lte' in v) return row[k] <= v.$lte;
  }
  return String(row[k]) === String(v);
});
vi.mock('../../models/trustedDevice.js', () => ({
  TrustedDevice: {
    create: vi.fn(async (doc) => { rows.push({ ...doc }); return doc; }),
    findOne: vi.fn((q) => ({ lean: async () => rows.find((r) => matches(r, q)) || null })),
    deleteOne: vi.fn(async (q) => {
      const i = rows.findIndex((r) => matches(r, q));
      if (i >= 0) rows.splice(i, 1);
    }),
    deleteMany: vi.fn(async (q) => {
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], q)) rows.splice(i, 1);
    }),
  },
}));

import TrustedDeviceService, { DEVICE_COOKIE } from '../TrustedDeviceService.js';
import { TrustedDevice } from '../../models/trustedDevice.js';

const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439012';
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

const makeReq = (cookies = {}) => ({ cookies, get: () => 'ai-answers.alpha.canada.ca' });
const makeRes = () => ({ cookie: vi.fn(), clearCookie: vi.fn() });

// Remember USER_A's device and return the token the browser would now hold.
async function rememberedToken(userId = USER_A) {
  const res = makeRes();
  await TrustedDeviceService.remember(makeReq(), res, userId);
  return res.cookie.mock.calls[0][1];
}

describe('TrustedDeviceService', () => {
  beforeEach(() => {
    rows.length = 0;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('sets a 12-hour httpOnly cookie on the parent domain and stores only a hash', async () => {
    const res = makeRes();
    await TrustedDeviceService.remember(makeReq(), res, USER_A);
    const [name, token, options] = res.cookie.mock.calls[0];
    expect(name).toBe(DEVICE_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, maxAge: TWELVE_HOURS, path: '/', domain: '.alpha.canada.ca' });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(rows[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(TWELVE_HOURS - 1000);
  });

  it('accepts the token for the same user', async () => {
    const token = await rememberedToken();
    expect(await TrustedDeviceService.isRemembered(makeReq({ [DEVICE_COOKIE]: token }), USER_A)).toBe(true);
  });

  it("does nothing for another user's token in the same browser", async () => {
    const token = await rememberedToken(USER_A);
    expect(await TrustedDeviceService.isRemembered(makeReq({ [DEVICE_COOKIE]: token }), USER_B)).toBe(false);
  });

  it('rejects a tampered token and a missing cookie', async () => {
    const token = await rememberedToken();
    expect(await TrustedDeviceService.isRemembered(makeReq({ [DEVICE_COOKIE]: token + 'x' }), USER_A)).toBe(false);
    expect(await TrustedDeviceService.isRemembered(makeReq({}), USER_A)).toBe(false);
    expect(await TrustedDeviceService.isRemembered({}, USER_A)).toBe(false);
  });

  it('rejects the token after 12 hours, and using it does not extend it', async () => {
    vi.useFakeTimers();
    const token = await rememberedToken();
    const req = makeReq({ [DEVICE_COOKIE]: token });
    vi.advanceTimersByTime(TWELVE_HOURS - 60 * 1000);
    expect(await TrustedDeviceService.isRemembered(req, USER_A)).toBe(true);
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(await TrustedDeviceService.isRemembered(req, USER_A)).toBe(false);
  });

  it("prunes the user's expired rows when a new device is remembered", async () => {
    vi.useFakeTimers();
    await rememberedToken(USER_A);
    await rememberedToken(USER_B);
    vi.advanceTimersByTime(TWELVE_HOURS + 1000);
    await rememberedToken(USER_A);
    expect(rows.filter((r) => r.userId === USER_A)).toHaveLength(1);
    // Another user's rows are left for their own next sign-in.
    expect(rows.filter((r) => r.userId === USER_B)).toHaveLength(1);
  });

  it('still sets the cookie when pruning expired rows fails', async () => {
    TrustedDevice.deleteMany.mockRejectedValueOnce(new Error('db timeout'));
    const res = makeRes();
    await TrustedDeviceService.remember(makeReq(), res, USER_A);
    expect(res.cookie).toHaveBeenCalledWith(DEVICE_COOKIE, expect.any(String), expect.any(Object));
    expect(rows).toHaveLength(1);
  });

  // A new token replaces the browser's cookie, so the old one's row could
  // never be used again: delete it rather than leave it until it expires.
  it("deletes the row of the token this browser already held", async () => {
    const oldToken = await rememberedToken(USER_A);
    const res = makeRes();
    await TrustedDeviceService.remember(makeReq({ [DEVICE_COOKIE]: oldToken }), res, USER_B);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(USER_B);
  });

  it('revokeAll forgets every device for that user only', async () => {
    const tokenA1 = await rememberedToken(USER_A);
    const tokenA2 = await rememberedToken(USER_A);
    const tokenB = await rememberedToken(USER_B);
    await TrustedDeviceService.revokeAll(USER_A);
    expect(await TrustedDeviceService.isRemembered(makeReq({ [DEVICE_COOKIE]: tokenA1 }), USER_A)).toBe(false);
    expect(await TrustedDeviceService.isRemembered(makeReq({ [DEVICE_COOKIE]: tokenA2 }), USER_A)).toBe(false);
    expect(await TrustedDeviceService.isRemembered(makeReq({ [DEVICE_COOKIE]: tokenB }), USER_B)).toBe(true);
  });

  it('forget clears this browser on the same domain and leaves other devices', async () => {
    const token = await rememberedToken(USER_A);
    const other = await rememberedToken(USER_A);
    const res = makeRes();
    await TrustedDeviceService.forget(makeReq({ [DEVICE_COOKIE]: token }), res);
    expect(res.clearCookie).toHaveBeenCalledWith(DEVICE_COOKIE, expect.objectContaining({ path: '/', domain: '.alpha.canada.ca' }));
    expect(res.clearCookie.mock.calls[0][1]).not.toHaveProperty('maxAge');
    expect(await TrustedDeviceService.isRemembered(makeReq({ [DEVICE_COOKIE]: token }), USER_A)).toBe(false);
    expect(await TrustedDeviceService.isRemembered(makeReq({ [DEVICE_COOKIE]: other }), USER_A)).toBe(true);
  });

  it('forget does nothing when this browser has no device cookie', async () => {
    const res = makeRes();
    await TrustedDeviceService.forget(makeReq({}), res);
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(TrustedDevice.deleteOne).not.toHaveBeenCalled();
  });

  it('refuses a user id that is not an ObjectId before querying', async () => {
    await expect(TrustedDeviceService.isRemembered(makeReq({ [DEVICE_COOKIE]: 'abc' }), { $ne: null })).rejects.toThrow();
    await expect(TrustedDeviceService.revokeAll('nope')).rejects.toThrow();
    expect(TrustedDevice.findOne).not.toHaveBeenCalled();
    expect(TrustedDevice.deleteMany).not.toHaveBeenCalled();
  });
});
