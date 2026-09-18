import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';

class DashboardService {
  /**
   * Fetch chat dashboard results with optional filters.
   * filters can include: department, referringUrl, startDate, endDate, filterType, presetValue, limit
   */
  static async getChatDashboard(filters = {}) {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        const normalizedValue = typeof value === 'object' ? JSON.stringify(value) : value;
        params.append(key, normalizedValue);
      });
      const query = params.toString();
      const url = getApiUrl(`chat-dashboard${query ? `?${query}` : ''}`);
      // Use auth fetch to preserve session if needed
      const response = await AuthService.fetch(url);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to fetch chat dashboard');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching chat dashboard:', error);
      throw error;
    }
  }

  static async assignChat({ chatId, assignedTo, notes }) {
    const response = await AuthService.fetch(getApiUrl('chat-assign'), {
      method: 'POST',
      body: JSON.stringify({ chatId, assignedTo, notes })
    });
    if (!response.ok) {
      // chat-assign.js answers with a stable `code` for the reasons a caller
      // can act on (already_assigned, note_too_long); carry it and the
      // status so the hook can say which one happened.
      let code;
      try { ({ code } = await response.json()); } catch { /* no body */ }
      const error = new Error('Failed to assign chat');
      error.code = code;
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  static async unassignChat({ chatId }) {
    const response = await AuthService.fetch(getApiUrl('chat-assign'), {
      method: 'DELETE',
      body: JSON.stringify({ chatId })
    });
    if (!response.ok) {
      throw new Error('Failed to remove assignment');
    }
    return response.json();
  }
}

export default DashboardService;
