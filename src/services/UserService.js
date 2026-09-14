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
     * Fetch the signed-in user's own profile (email, role, institution, group).
     * @returns {Promise<{email: string, role: string, institution: string, group: string, createdAt: string}>}
     */
    async getMe() {
        const response = await AuthService.fetch(getApiUrl('user-me'));
        if (!response.ok) {
            throw new Error('Failed to fetch profile');
        }
        return response.json();
    },

    /**
     * Update the signed-in user's own profile (institution, group, preferences).
     * @param {{institution?: string, group?: string, preferences?: {prefilterDepartment: boolean}}} updates
     * @returns {Promise<Object>} the updated profile
     */
    async updateMe(updates) {
        const response = await AuthService.fetch(getApiUrl('user-me'), {
            method: 'PATCH',
            body: JSON.stringify(updates)
        });
        if (!response.ok) {
            // Institution/group lock (see api/user/user-me.js) responds with a
            // stable `code`, not just free text - carry it onto the thrown
            // error so the caller can map it via resolveErrorMessage() instead
            // of showing a generic failure for a specific, actionable reason.
            let code;
            try { ({ code } = await response.json()); } catch { /* no body */ }
            const error = new Error('Failed to update profile');
            error.code = code;
            throw error;
        }
        return response.json();
    },

    /**
     * Fetch the users the signed-in user is allowed to assign a chat to
     * (see api/user/user-assignable.js and api/chat/chat-assign.js). A
     * partner only ever sees people sharing their own institution/group
     * (never the full directory); an admin sees everyone active.
     * @returns {Promise<{users: Array, reason?: 'no_institution'}>}
     */
    async getAssignable() {
        const response = await AuthService.fetch(getApiUrl('user-assignable'));
        if (!response.ok) {
            throw new Error('Failed to fetch assignable users');
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
     * @param {{active?: boolean, role?: string, institution?: string, group?: string}} updates 
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
        const url = `${getApiUrl('user-users')}?userId=${encodeURIComponent(userId)}`;
        const response = await AuthService.fetch(url, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error('Failed to delete user');
        }
        return response.json();
    }
};

export default UserService;
