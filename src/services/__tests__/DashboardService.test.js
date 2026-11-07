import { describe, it, expect, vi, beforeEach } from 'vitest';
import DashboardService from '../DashboardService.js';
import AuthService from '../AuthService.js';

vi.mock('../AuthService.js', () => ({ default: { fetch: vi.fn() } }));

describe('DashboardService.unassignQuestion', () => {
  beforeEach(() => {
    AuthService.fetch.mockReset();
    AuthService.fetch.mockResolvedValue({ ok: true, json: async () => ({ interactionId: 'q-123' }) });
  });

  // A DELETE body doesn't reliably reach the server once deployed.
  it('sends the interactionId in the URL, with no request body', async () => {
    await DashboardService.unassignQuestion({ interactionId: 'q-123' });

    expect(AuthService.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = AuthService.fetch.mock.calls[0];
    expect(url).toBe('/api/chat/chat-assign-interaction?interactionId=q-123');
    expect(options.method).toBe('DELETE');
    expect(options.body).toBeUndefined();
  });

  it('throws when the server rejects the request', async () => {
    AuthService.fetch.mockResolvedValue({ ok: false, status: 400 });

    await expect(DashboardService.unassignQuestion({ interactionId: 'q-123' })).rejects.toThrow('Failed to remove assignment');
  });

  it('carries the server error code when it rejects the request', async () => {
    AuthService.fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ code: 'assignment_changed' }) });

    await expect(DashboardService.unassignQuestion({ interactionId: 'q-123' })).rejects.toMatchObject({ code: 'assignment_changed' });
  });
});
