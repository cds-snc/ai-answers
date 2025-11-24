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

  async getSimilarChats(chatId) {
    const response = await AuthService.fetch(getApiUrl(`vector-similar-chats?chatId=${encodeURIComponent(chatId)}`));
    return await response.json();
  },
  // Add more methods as needed for other endpoints
};

export default VectorService;
