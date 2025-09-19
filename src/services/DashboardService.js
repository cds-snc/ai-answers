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
        params.append(key, value);
      });
      const query = params.toString();
  const url = getApiUrl(`chat-dashboard${query ? `?${query}` : ''}`);
      // Use auth fetch to preserve session if needed
      const response = await AuthService.fetchWithAuth(url);
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
}

export default DashboardService;
