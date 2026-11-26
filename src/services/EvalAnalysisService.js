import AuthService from './AuthService.js';
import { getApiUrl } from '../utils/apiToUrl.js';

// Client for the partner eval-analysis endpoints. Errors carry the server's
// `code` (e.g. departmentRequired) so the UI can choose its message.
class EvalAnalysisService {
  static async _request(url, options) {
    const response = await AuthService.fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || 'Eval analysis request failed');
      error.code = data.code;
      throw error;
    }
    return data;
  }

  // Runs the whole analysis in one request and returns the finished doc
  // (status 'complete', or 'error' with the stats kept).
  static async create(filters = {}, language = 'en') {
    const data = await this._request(getApiUrl('eval-analysis-run'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters, language })
    });
    return data.analysis;
  }

  static async get(analysisId) {
    const data = await this._request(getApiUrl(`eval-analysis-get?analysisId=${encodeURIComponent(analysisId)}`));
    return data.analysis;
  }

  static async list(department) {
    const data = await this._request(getApiUrl(`eval-analysis-list?department=${encodeURIComponent(department)}`));
    return data.analyses;
  }
}

export default EvalAnalysisService;
