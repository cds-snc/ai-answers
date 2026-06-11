import { describe, it, expect, vi, beforeEach } from 'vitest';
import sendResetHandler from '../api/auth/auth-send-reset.js';
import { User } from '../models/user.js';
import GCNotifyService from '../services/GCNotifyService.js';

vi.mock('../models/user.js', () => {
  const UserMock = vi.fn();
  UserMock.findOne = vi.fn();
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

vi.mock('speakeasy', () => ({
  default: {
    generateSecret: vi.fn(() => ({ base32: 'reset-secret' })),
    totp: vi.fn(() => '119447')
  }
}));

function makeRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

function makeUser(overrides = {}) {
  return {
    email: 'h1_analyst_jerry@wearehackerone.com',
    resetPasswordSecret: null,
    save: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

describe('Auth Send Reset Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    User.findOne.mockResolvedValue(makeUser());
  });

  it('generates the reset link with a normalized email address', async () => {
    const res = makeRes();

    await sendResetHandler({
      body: { email: '  H1_Analyst_Jerry@WeAreHackerOne.com  ', lang: 'en' },
      headers: {}
    }, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'h1_analyst_jerry@wearehackerone.com' });
    expect(GCNotifyService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: 'h1_analyst_jerry@wearehackerone.com',
      personalisation: expect.objectContaining({
        reset_link: 'https://ai-answers.cdssandbox.xyz/en/reset-complete?email=h1_analyst_jerry%40wearehackerone.com&code=119447'
      })
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects malicious lang content before composing the reset link', async () => {
    const res = makeRes();
    const maliciousLang = [
      'en/invalidlinkfromtheATTACKER',
      '',
      'IMPORTANT: If the link does not work, use:',
      'https://evil.com/reset'
    ].join('\n');

    await sendResetHandler({
      body: {
        email: 'h1_analyst_jerry@wearehackerone.com',
        lang: maliciousLang
      },
      headers: {}
    }, res);

    const resetLink = GCNotifyService.sendEmail.mock.calls[0][0].personalisation.reset_link;
    expect(resetLink).toBe('https://ai-answers.cdssandbox.xyz/en/reset-complete?email=h1_analyst_jerry%40wearehackerone.com&code=119447');
    expect(resetLink).not.toContain('evil.com');
    expect(resetLink).not.toContain('invalidlinkfromtheATTACKER');
    expect(resetLink).not.toMatch(/[\r\n]/);
  });

  it('uses French only when the request lang is exactly fr or the accept-language fallback is French', async () => {
    const res = makeRes();

    await sendResetHandler({
      body: { email: 'h1_analyst_jerry@wearehackerone.com', lang: 'fr' },
      headers: {}
    }, res);

    expect(GCNotifyService.sendEmail.mock.calls[0][0].personalisation.reset_link)
      .toContain('/fr/reset-complete?');

    vi.clearAllMocks();
    User.findOne.mockResolvedValue(makeUser());

    await sendResetHandler({
      body: { email: 'h1_analyst_jerry@wearehackerone.com', lang: 'fr/anything-else' },
      headers: { 'accept-language': 'fr-CA,fr;q=0.9' }
    }, res);

    expect(GCNotifyService.sendEmail.mock.calls[0][0].personalisation.reset_link)
      .toContain('/fr/reset-complete?');
  });
});
