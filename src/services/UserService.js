import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';

/**
 * Service for user-related API calls.
 */
const UserService = {
    /**
     * Fetch user statistics (new inactive, total inactive counts).
     * @returns {Promise<{newInactiveCount: number, totalInactiveCount: number}>}
     */
    async getStats() {
        const response = await AuthService.fetch(getApiUrl('user-stats'));
        if (!response.ok) {
            throw new Error('Failed to fetch user stats');
        }
        return response.json();
    },

    /**
     * Fetch all users.
     * @returns {Promise<Array>}
     */
    async getAll() {
        const response = await AuthService.fetch(getApiUrl('user-users'));
        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }
        return response.json();
    },

    /**
     * Update a user.
     * @param {string} userId 
     * @param {{active?: boolean, role?: string}} updates 
     * @returns {Promise<Object>}
     */
    async update(userId, updates) {
        const response = await AuthService.fetch(getApiUrl('user-users'), {
            method: 'PATCH',
            body: JSON.stringify({ userId, ...updates })
        });
        if (!response.ok) {
            throw new Error('Failed to update user');
        }
        return response.json();
    },

    /**
     * Delete a user.
     * @param {string} userId 
     * @returns {Promise<Object>}
     */
    async delete(userId) {
        const response = await AuthService.fetch(getApiUrl('user-users'), {
            method: 'DELETE',
            body: JSON.stringify({ userId })
        });
        if (!response.ok) {
            throw new Error('Failed to delete user');
        }
        return response.json();
    }
};

export default UserService;
