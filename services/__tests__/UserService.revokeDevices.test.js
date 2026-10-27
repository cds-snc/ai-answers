import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/db/db-connect.js', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('../../models/user.js', () => ({
  User: { findById: vi.fn(), findByIdAndUpdate: vi.fn(), findByIdAndDelete: vi.fn() },
}));
vi.mock('../TrustedDeviceService.js', () => ({ default: { revokeAll: vi.fn() } }));

import UserService from '../UserService.js';
import TrustedDeviceService from '../TrustedDeviceService.js';
import { User } from '../../models/user.js';

const USER_ID = '507f1f77bcf86cd799439011';

// "Remember this device" tokens are forgotten when an admin deactivates a
// user, changes their role, or deletes them (docs/plans/auth-hardening.md).
describe('UserService forgets remembered devices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    User.findById.mockReturnValue({ lean: async () => ({ role: 'partner', institution: '', group: '' }) });
    User.findByIdAndUpdate.mockResolvedValue({ _id: USER_ID });
    User.findByIdAndDelete.mockResolvedValue({ _id: USER_ID });
  });

  it('on deactivation', async () => {
    await UserService.adminUpdateUser(USER_ID, { active: false, role: 'partner' });
    expect(TrustedDeviceService.revokeAll).toHaveBeenCalledWith(USER_ID);
  });

  it('on a role change', async () => {
    await UserService.adminUpdateUser(USER_ID, { active: true, role: 'admin' });
    expect(TrustedDeviceService.revokeAll).toHaveBeenCalledWith(USER_ID);
  });

  // The Users page sends active and role on every save.
  it('not on a save that leaves the user active with the same role', async () => {
    await UserService.adminUpdateUser(USER_ID, { active: true, role: 'partner', institution: '', group: '' });
    expect(TrustedDeviceService.revokeAll).not.toHaveBeenCalled();
  });

  // Revoked before the write, so a failed revoke leaves the user unchanged
  // and the admin's retry still revokes.
  it('before writing, so a failed revoke changes nothing', async () => {
    TrustedDeviceService.revokeAll.mockRejectedValueOnce(new Error('db down'));
    await expect(UserService.adminUpdateUser(USER_ID, { active: true, role: 'admin' })).rejects.toThrow('db down');
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();

    TrustedDeviceService.revokeAll.mockRejectedValueOnce(new Error('db down'));
    await expect(UserService.deleteUser(USER_ID)).rejects.toThrow('db down');
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('on delete', async () => {
    await UserService.deleteUser(USER_ID);
    expect(TrustedDeviceService.revokeAll).toHaveBeenCalledWith(USER_ID);
    expect(TrustedDeviceService.revokeAll.mock.invocationCallOrder[0])
      .toBeLessThan(User.findByIdAndDelete.mock.invocationCallOrder[0]);
  });
});
