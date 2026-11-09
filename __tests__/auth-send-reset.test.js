import { describe, it, expect, vi, beforeEach } from 'vitest';
import sendResetHandler from '../api/auth/auth-send-reset.js';
import { hashResetToken, RESET_TOKEN_TTL_MS } from '../api/auth/reset-token.js';
import { User } from '../models/user.js';
import GCNotifyService from '../services/GCNotifyService.js';

vi.mock('../models/user.js', () => {
  const UserMock = vi.fn();
  UserMock.findOne = vi.fn();
  UserMock.updateOne = vi.fn().mockResolvedValue({});
  return { User: UserMock };
});

vi.mock('../api/db/db-connect.js', () => ({
  default: vi.fn().mockResolvedValue(true)
}));

vi.mock('../services/GCNotifyService.js', () => ({
  default: {
    sendEmail: vi.fn().mockResolvedValue({ success: true })
  }
}));

vi.mock('../services/SettingsService.js', () => ({
  SettingsService: {
    get: vi.fn((key) => {
      if (key === 'site.baseUrl') return 'https://ai-answers.cdssandbox.xyz';
      if (key === 'notify.resetTemplateId') return 'reset-template-id';
      return null;
    })
  }
}));

function makeRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

function makeUser(overrides = {}) {
  return {
    _id: 'user-123',
    email: 'h1_analyst_jerry@wearehackerone.com',
    save: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

const LINK_EN = /^https:\/\/ai-answers\.cdssandbox\.xyz\/en\/reset-complete\?email=h1_analyst_jerry%40wearehackerone\.com&code=([A-Za-z0-9_-]{43})$/;
const LINK_FR = /^https:\/\/ai-answers\.cdssandbox\.xyz\/fr\/reinitialisation-reussie\?email=h1_analyst_jerry%40wearehackerone\.com&code=([A-Za-z0-9_-]{43})$/;

function sentToken(call = 0) {
  return GCNotifyService.sendEmail.mock.calls[call][0].personalisation.reset_link_en.match(LINK_EN)[1];
}

describe('Auth Send Reset Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    User.findOne.mockResolvedValue(makeUser());
  });

  it('generates the reset link with a normalized email address', async () => {
    const res = makeRes();

    await sendResetHandler({
      body: { email: '  H1_Analyst_Jerry@WeAreHackerOne.com  ' },
      headers: {}
    }, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'h1_analyst_jerry@wearehackerone.com' });
    expect(GCNotifyService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: 'h1_analyst_jerry@wearehackerone.com',
      personalisation: expect.objectContaining({
        reset_link_en: expect.stringMatching(LINK_EN),
        reset_link_fr: expect.stringMatching(LINK_FR)
      })
    }));
    const { personalisation } = GCNotifyService.sendEmail.mock.calls[0][0];
    expect(personalisation.reset_link_fr.match(LINK_FR)[1]).toBe(sentToken());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('stores only the hash of the emailed token, with an expiry, in one update', async () => {
    const before = Date.now();
    await sendResetHandler({ body: { email: 'h1_analyst_jerry@wearehackerone.com' }, headers: {} }, makeRes());

    const token = sentToken();
    expect(User.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = User.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'user-123' });
    expect(Object.keys(update.$set).sort()).toEqual(['resetPasswordExpiresAt', 'resetPasswordTokenHash']);
    expect(update.$set.resetPasswordTokenHash).toBe(hashResetToken(token));
    const expiresIn = update.$set.resetPasswordExpiresAt.getTime() - before;
    expect(expiresIn).toBeGreaterThanOrEqual(RESET_TOKEN_TTL_MS);
    expect(expiresIn).toBeLessThan(RESET_TOKEN_TTL_MS + 5000);
  });

  it('sends a different token on each request', async () => {
    const req = { body: { email: 'h1_analyst_jerry@wearehackerone.com' }, headers: {} };
    await sendResetHandler(req, makeRes());
    await sendResetHandler(req, makeRes());
    expect(sentToken(0)).not.toBe(sentToken(1));
  });

  it('refuses an email that is not a string before looking up a user', async () => {
    const res = makeRes();
    await sendResetHandler({ body: { email: { $ne: null } }, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(User.findOne).not.toHaveBeenCalled();
    expect(GCNotifyService.sendEmail).not.toHaveBeenCalled();
  });

  it('gives the same answer and stores nothing for an unknown email', async () => {
    User.findOne.mockResolvedValue(null);
    const res = makeRes();
    await sendResetHandler({ body: { email: 'nobody@example.com' }, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(GCNotifyService.sendEmail).not.toHaveBeenCalled();
  });

  it('ignores request lang when composing reset links', async () => {
    const res = makeRes();

    await sendResetHandler({
      body: {
        email: 'h1_analyst_jerry@wearehackerone.com',
        lang: 'en/invalidlinkfromtheATTACKER\nhttps://evil.com/reset'
      },
      headers: {}
    }, res);

    const personalisation = GCNotifyService.sendEmail.mock.calls[0][0].personalisation;
    expect(personalisation.reset_link_en).toMatch(LINK_EN);
    expect(personalisation.reset_link_fr).toMatch(LINK_FR);
    expect(personalisation.reset_link_en).not.toContain('evil.com');
    expect(personalisation.reset_link_fr).not.toContain('evil.com');
    expect(personalisation.reset_link_en).not.toMatch(/[\r\n]/);
    expect(personalisation.reset_link_fr).not.toMatch(/[\r\n]/);
  });
});
