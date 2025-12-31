import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';

class DashboardService {
  /**
   * Fetch chat dashboard results with optional filters.
   * filters can include: department, referringUrl, startDate, endDate, filterType, presetValue, limit
   */
  static async getChatDashboard(filters = {}) {
    const startTime = performance.now();
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        params.append(key, value);
      });
      const query = params.toString();
      const url = getApiUrl(`chat-dashboard${query ? `?${query}` : ''}`);

      const fetchStart = performance.now();
      const response = await AuthService.fetch(url);
      const fetchDuration = performance.now() - fetchStart;

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to fetch chat dashboard');
      }

      const parseStart = performance.now();
      const data = await response.json();
      const parseDuration = performance.now() - parseStart;

      const totalDuration = performance.now() - startTime;

      console.log(`[DashboardService] Performance:`, {
        total: totalDuration.toFixed(2) + 'ms',
        fetch: fetchDuration.toFixed(2) + 'ms',
        parse: parseDuration.toFixed(2) + 'ms',
        backend: (data._performance?.total || 0) + 'ms',
        url: url.split('?')[0] // hide params for cleaner logs
      });

      return data;
    } catch (error) {
      console.error('Error fetching chat dashboard:', error);
      throw error;
    }
  }

}

export default DashboardService;
