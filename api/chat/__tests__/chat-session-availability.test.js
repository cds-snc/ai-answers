import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSetting, mockSessionsAvailable } = vi.hoisted(() => ({
  mockGetSetting: vi.fn(),
  mockSessionsAvailable: vi.fn(),
}));

vi.mock('../../../services/SettingsService.js', () => ({
  SettingsService: { get: mockGetSetting },
}));

vi.mock('../../../services/ChatSessionService.js', () => ({
  default: { sessionsAvailable: mockSessionsAvailable },
}));

import handler from '../chat-session-availability.js';

function makeResponse() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('chat-session-availability', () => {
  beforeEach(() => {
    mockGetSetting.mockReset().mockReturnValue('available');
    mockSessionsAvailable.mockReset().mockResolvedValue(true);
  });

  it('answers HEAD with the same payload as GET', async () => {
    const res = makeResponse();

    await handler({ method: 'HEAD', sessionID: 'anonymous-session', session: {} }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ siteStatus: true, sessionAvailable: true });
  });

  it('rejects methods other than GET and HEAD', async () => {
    const res = makeResponse();

    await handler({ method: 'POST', sessionID: 'anonymous-session', session: {} }, res);

    expect(mockSessionsAvailable).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'method_not_allowed' });
  });

  it('returns unavailable when the anonymous session pool is full', async () => {
    mockSessionsAvailable.mockResolvedValue(false);
    const res = makeResponse();

    await handler({ method: 'GET', sessionID: 'anonymous-session', session: {} }, res);

    expect(mockSessionsAvailable).toHaveBeenCalledWith('anonymous-session');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ siteStatus: true, sessionAvailable: false });
  });

  it('does not block authenticated users when the anonymous session pool is full', async () => {
    const res = makeResponse();

    await handler({ method: 'GET', sessionID: 'authenticated-session', user: { id: 'user-1' }, session: {} }, res);

    expect(mockSessionsAvailable).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ siteStatus: true, sessionAvailable: true });
  });
});
