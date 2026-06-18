import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';

const VectorService = {
  async getStats() {
    const response = await AuthService.fetch(getApiUrl('vector-stats'));
    if (!response.ok) throw new Error('Failed to fetch vector stats');
    return await response.json();
  },

  async reinitialize() {
    const response = await AuthService.fetch(getApiUrl('vector-reinitialize'), {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to reinitialize vector service');
    return await response.json();
  },

  async backfillMetadata({ lastProcessedId = null, limit = 100, includeDetails = false } = {}) {
    const response = await AuthService.fetch(getApiUrl('vector-backfill-metadata'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastProcessedId, limit, includeDetails }),
    });
    if (!response.ok) throw new Error('Failed to backfill embedding metadata');
    return await response.json();
  },

  async getSimilarChats(chatId) {
    const response = await AuthService.fetch(getApiUrl(`vector-similar-chats?chatId=${encodeURIComponent(chatId)}`));
    return await response.json();
  },

  async runDocdb8CapabilityTest(probe) {
    const query = probe ? `?probe=${encodeURIComponent(probe)}` : '';
    const response = await AuthService.fetch(getApiUrl(`vector-docdb8-capability-test${query}`));
    if (!response.ok) throw new Error('Failed to run DocumentDB 8 vector capability test');
    return await response.json();
  },
  // Add more methods as needed for other endpoints
};

export default VectorService;
