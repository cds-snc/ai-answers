import AuthService from './AuthService.js';
import { getApiUrl } from '../utils/apiToUrl.js';

// Client for the partner eval-analysis endpoints. Volume-gate failures
// (tooFew/tooMany) come back as 400s with a `code`; surface them as typed
// errors so the UI can show the right message instead of a generic failure.
class EvalAnalysisService {
  static async _request(url, options) {
    const response = await AuthService.fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || 'Eval analysis request failed');
      error.code = data.code;
      error.count = data.count;
      throw error;
    }
    return data;
  }

  static async precheck(filters = {}) {
    // Only send real values: URLSearchParams would coerce undefined/null to
    // the literal strings "undefined"/"null", which the server would then
    // treat as genuine filter values — diverging from the JSON-body create()
    // path, which drops them.
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') queryParams.append(key, value);
    });
    return this._request(getApiUrl(`eval-analysis-precheck?${queryParams.toString()}`));
  }

  static async create(filters = {}, language = 'en') {
    const data = await this._request(getApiUrl('eval-analysis-run'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters, language })
    });
    return data.analysis;
  }

  static async advance(analysisId) {
    const data = await this._request(getApiUrl('eval-analysis-advance'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId })
    });
    return data.analysis;
  }

  static async get(analysisId, { includeRows = false } = {}) {
    const rowsParam = includeRows ? '&includeRows=true' : '';
    const data = await this._request(getApiUrl(`eval-analysis-get?analysisId=${encodeURIComponent(analysisId)}${rowsParam}`));
    return data.analysis;
  }

  static async list(department) {
    const data = await this._request(getApiUrl(`eval-analysis-list?department=${encodeURIComponent(department)}`));
    return data.analyses;
  }
}

export default EvalAnalysisService;
