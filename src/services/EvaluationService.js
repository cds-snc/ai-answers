import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';

class EvaluationService {
  static async getEvaluation({ interactionId }) {
    if (!interactionId) throw new Error('Missing required fields');
    const response = await AuthService.fetchWithAuth(getApiUrl('eval-get'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Failed to fetch evaluation');
    }
    return response.json();
  }

  static async deleteEvaluation({ interactionId }) {
    if (!interactionId) throw new Error('Missing required fields');
    const response = await AuthService.fetchWithAuth(getApiUrl('eval-delete'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to delete evaluation');
    }
    return data;
  }

  static async reEvaluate({ interactionId, forceFallbackEval = false }) {
    if (!interactionId) throw new Error('Missing required fields');
    const response = await AuthService.fetchWithAuth(getApiUrl('eval-run'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId, forceFallbackEval, replaceExisting: true })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Failed to re-run evaluation');
    }
    return response.json();
  }
  static async deleteExpertEval(chatId) {
    const response = await AuthService.fetchWithAuth(getApiUrl('db-delete-expert-eval'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete expert feedback.');
    }
    return data;
  }
  static async generateEvals({ lastProcessedId = null, startTime, endTime } = {}) {
    try {
      const payload = { action: 'generate' };
      if (lastProcessedId) payload.lastProcessedId = lastProcessedId;
      if (startTime) payload.startTime = startTime;
      if (endTime) payload.endTime = endTime;
      const response = await AuthService.fetchWithAuth(getApiUrl('db-generate-evals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Failed to generate evals');
      return await response.json();
    } catch (error) {
      console.error('Error generating evals:', error);
      throw error;
    }
  }

  static async deleteEvals({ startTime, endTime, onlyEmpty = false }) {
    try {
      const payload = {};
      if (startTime) payload.startTime = startTime;
      if (endTime) payload.endTime = endTime;
      payload.action = 'delete';
      if (onlyEmpty) payload.onlyEmpty = true;
      const response = await AuthService.fetchWithAuth(getApiUrl('db-generate-evals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Failed to delete evaluations');
      return await response.json();
    } catch (error) {
      console.error('Error deleting evaluations:', error);
      throw error;
    }
  }

  static async getEvalNonEmptyCount() {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-eval-non-empty-count'));
      if (!response.ok) throw new Error('Failed to get non-empty eval count');
      const data = await response.json();
      return data.count;
    } catch (error) {
      console.error('Error getting non-empty eval count:', error);
      return 0;
    }
  }

  static async getExpertFeedbackCount() {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-expert-feedback-count'));
      if (!response.ok) throw new Error('Failed to get expert feedback count');
      const data = await response.json();
      return data.count;
    } catch (error) {
      console.error('Error getting expert feedback count:', error);
      throw error;
    }
  }
}

export default EvaluationService;
