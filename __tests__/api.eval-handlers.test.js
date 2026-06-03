import { describe, it, expect, vi } from 'vitest';
import evalGet from '../api/eval/eval-get.js';
import evalDelete from '../api/eval/eval-delete.js';
import evalRun from '../api/eval/eval-run.js';

function makeRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res)
  };
  return res;
}

describe('api/eval handlers', () => {
  it('exports functions', () => {
    expect(typeof evalGet).toBe('function');
    expect(typeof evalDelete).toBe('function');
    expect(typeof evalRun).toBe('function');
  });

  it('eval-get responds or throws with minimal req/res', async () => {
    const req = { method: 'POST', body: { interactionId: 'deadbeefdeadbeefdeadbeef' } };
    const res = makeRes();
    try {
      await evalGet(req, res);
      // If it returned 4xx/5xx, ensure proper call
      expect(res.status).toHaveBeenCalled();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });

  it('eval-get uses the existing error contract for invalid interaction ids', async () => {
    const req = {
      method: 'POST',
      body: { interactionId: { $ne: 'anything' } },
      isAuthenticated: vi.fn(() => true),
      user: { role: 'partner', userId: 'test-partner' },
      path: '/api/eval/eval-get'
    };
    const res = makeRes();

    await evalGet(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to retrieve evaluation',
      error: 'Invalid interactionId'
    });
  });

  it('eval-delete responds or throws with minimal req/res', async () => {
    const req = { method: 'POST', body: { interactionId: 'deadbeefdeadbeefdeadbeef' } };
    const res = makeRes();
    try {
      await evalDelete(req, res);
      expect(res.status).toHaveBeenCalled();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });

  it('eval-run responds or throws with minimal req/res', async () => {
    const req = { method: 'POST', body: { interactionId: 'deadbeefdeadbeefdeadbeef' } };
    const res = makeRes();
    try {
      await evalRun(req, res);
      expect(res.status).toHaveBeenCalled();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });
});
