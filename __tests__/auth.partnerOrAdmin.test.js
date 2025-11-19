import { describe, it, expect, vi } from 'vitest';
import { partnerOrAdminMiddleware } from '../middleware/auth.js';

function makeRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res)
  };
  return res;
}

describe('partnerOrAdminMiddleware', () => {
  it('returns 401 when req.user missing', async () => {
    const req = {};
    const res = makeRes();
    const result = partnerOrAdminMiddleware(req, res);
    // middleware returns false and sets 401
    expect(result).toBe(false);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Authentication required' });
  });

  it('returns 403 when role is not partner or admin', async () => {
    const req = { user: { userId: 'u1', role: 'user' } };
    const res = makeRes();
    const result = partnerOrAdminMiddleware(req, res);
    expect(result).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Partner or admin access required' });
  });

  it('returns true for partner role', async () => {
    const req = { user: { userId: 'p1', role: 'partner' } };
    const res = makeRes();
    const result = partnerOrAdminMiddleware(req, res);
    expect(result).toBe(true);
  });

  it('returns true for admin role', async () => {
    const req = { user: { userId: 'a1', role: 'admin' } };
    const res = makeRes();
    const result = partnerOrAdminMiddleware(req, res);
    expect(result).toBe(true);
  });
});
