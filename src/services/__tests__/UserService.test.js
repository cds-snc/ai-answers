import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserService from '../UserService.js';
import AuthService from '../AuthService.js';
import { getApiUrl } from '../../utils/apiToUrl.js';

vi.mock('../AuthService.js');
vi.mock('../../utils/apiToUrl.js');

describe('UserService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getApiUrl.mockImplementation((endpoint) => `/api/user/${endpoint}`);
    });

    describe('getStats', () => {
        it('should fetch user stats', async () => {
            const mockStats = { newInactiveCount: 5, totalInactiveCount: 10 };
            AuthService.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockStats)
            });

            const stats = await UserService.getStats();

            expect(AuthService.fetch).toHaveBeenCalledWith('/api/user/user-stats');
            expect(stats).toEqual(mockStats);
        });

        it('should throw error on failure', async () => {
            AuthService.fetch.mockResolvedValueOnce({ ok: false });
            await expect(UserService.getStats()).rejects.toThrow('Failed to fetch user stats');
        });
    });

    describe('getAll', () => {
        it('should fetch all users', async () => {
            const mockUsers = [{ _id: '1', email: 'test@example.com' }];
            AuthService.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockUsers)
            });

            const users = await UserService.getAll();

            expect(AuthService.fetch).toHaveBeenCalledWith('/api/user/user-users');
            expect(users).toEqual(mockUsers);
        });
    });

    describe('update', () => {
        it('should update a user', async () => {
            const userId = '123';
            const updates = { role: 'admin' };
            const updatedUser = { _id: userId, ...updates };

            AuthService.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(updatedUser)
            });

            const result = await UserService.update(userId, updates);

            expect(AuthService.fetch).toHaveBeenCalledWith('/api/user/user-users', {
                method: 'PATCH',
                body: JSON.stringify({ userId, ...updates })
            });
            expect(result).toEqual(updatedUser);
        });
    });

    describe('delete', () => {
        it('should delete a user', async () => {
            const userId = '123';
            AuthService.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ message: 'User deleted' })
            });

            const result = await UserService.delete(userId);

            expect(AuthService.fetch).toHaveBeenCalledWith('/api/user/user-users', {
                method: 'DELETE',
                body: JSON.stringify({ userId })
            });
            expect(result).toEqual({ message: 'User deleted' });
        });
    });
});
