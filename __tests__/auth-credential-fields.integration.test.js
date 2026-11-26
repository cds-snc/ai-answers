import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.TWOFA_SECRET = process.env.TWOFA_SECRET || 'test-twofa-secret';

// Real module needs GC_NOTIFY_API_KEY at import time.
vi.mock('../services/GCNotifyService.js', () => ({ default: { sendEmail: vi.fn() } }));

import dbConnect from '../api/db/db-connect.js';
import { User } from '../models/user.js';
import passport from '../config/passport.js';
import resetPasswordHandler from '../api/auth/auth-reset-password.js';
import { hashResetToken } from '../api/auth/reset-token.js';
import TwoFAService from '../services/TwoFAService.js';
import TrustedDeviceService from '../services/TrustedDeviceService.js';
import GCNotifyService from '../services/GCNotifyService.js';
import { SettingsService } from '../services/SettingsService.js';

// password, resetPasswordTokenHash, twoFACode and TrustedDevice.tokenHash are
// select: false, so database exports leave them out. Each sign-in path must
// still read the one it needs. The other auth tests mock the models, which
// can't show a missing '+field', so these run against the real database.

const EMAIL = 'reviewer@canada.ca';
const PASSWORD = 'original-password';

const verifyPassword = passport._strategy('local')._verify;
const signIn = (email, password) => new Promise((resolve, reject) =>
  verifyPassword(email, password, (err, user, info) => (err ? reject(err) : resolve({ user, info }))));

beforeEach(async () => {
  await dbConnect();
});

describe('sign-in with hidden credential fields', () => {
  it('accepts the right password and refuses a wrong one', async () => {
    await User.create({ email: EMAIL, password: PASSWORD });
    expect((await signIn(EMAIL, PASSWORD)).user).toBeTruthy();
    expect((await signIn(EMAIL, 'wrong-password')).info.message).toBe('Invalid credentials');
  });

  it('refuses a user restored without a password, without throwing', async () => {
    // What an import creates for a new email: the export left the password out.
    await User.collection.insertOne({ email: EMAIL, role: 'partner', active: true });
    const { user, info } = await signIn(EMAIL, PASSWORD);
    expect(user).toBe(false);
    expect(info.message).toBe('Invalid credentials');
  });
});

describe('password reset with hidden credential fields', () => {
  it('accepts a valid link and sets the new password', async () => {
    const token = 'token-from-the-email-link';
    const user = await User.create({ email: EMAIL, password: PASSWORD });
    await User.updateOne({ _id: user._id }, {
      $set: { resetPasswordTokenHash: hashResetToken(token), resetPasswordExpiresAt: new Date(Date.now() + 60000) }
    });

    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await resetPasswordHandler({ body: { email: EMAIL, code: token, newPassword: 'brand-new-password' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const saved = await User.findById(user._id).select('+password +resetPasswordTokenHash');
    expect(await saved.comparePassword('brand-new-password')).toBe(true);
    expect(saved.resetPasswordTokenHash).toBeNull();
  });
});

describe('2FA with hidden credential fields', () => {
  beforeEach(() => {
    vi.spyOn(SettingsService, 'get').mockImplementation((key) => {
      if (key === 'twoFA.enabled') return 'true';
      if (key === 'twoFA.templateId') return 'template-id';
      return undefined;
    });
  });

  it('accepts the emailed code once', async () => {
    const user = await User.create({ email: EMAIL, password: PASSWORD });
    GCNotifyService.sendEmail.mockResolvedValue({ success: true });
    await TwoFAService.sendChallenge({ userId: user._id.toString() });
    const code = GCNotifyService.sendEmail.mock.calls[0][0].personalisation.verify_code;

    const first = await TwoFAService.verifyChallenge({ userId: user._id.toString(), code });
    expect(first.success).toBe(true);
    expect(first.user.email).toBe(EMAIL);
    const second = await TwoFAService.verifyChallenge({ userId: user._id.toString(), code });
    expect(second).toEqual({ success: false, reason: 'invalid' });
  });
});

describe('remembered device with hidden token hash', () => {
  it('recognizes the remembered browser for the same user', async () => {
    const user = await User.create({ email: EMAIL, password: PASSWORD });
    const userId = user._id.toString();
    const req = { cookies: {}, get: () => 'ai-answers.alpha.canada.ca' };
    const res = { cookie: vi.fn() };
    await TrustedDeviceService.remember(req, res, userId);
    const token = res.cookie.mock.calls[0][1];

    expect(await TrustedDeviceService.isRemembered({ cookies: { 'aianswers.device': token } }, userId)).toBe(true);
    expect(await TrustedDeviceService.isRemembered({ cookies: { 'aianswers.device': 'other-token' } }, userId)).toBe(false);
  });
});
