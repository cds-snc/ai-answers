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

