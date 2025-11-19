import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';

class DataStoreService {
  static async getPublicSetting(key, defaultValue = null) {
    try {
      const response = await fetch(getApiUrl(`setting-public-handler?key=${encodeURIComponent(key)}`));
      if (!response.ok) throw new Error(`Failed to get public setting: ${key}`);
      const data = await response.json();
      return data.value !== undefined ? data.value : defaultValue;
    } catch (error) {
      console.error(`Error getting public setting '${key}':`, error);
      return defaultValue;
    }
  }
  static async getSetting(key, defaultValue = null) {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl(`setting-handler?key=${encodeURIComponent(key)}`));
      if (!response.ok) throw new Error(`Failed to get setting: ${key}`);
      const data = await response.json();
      return data.value !== undefined ? data.value : defaultValue;
    } catch (error) {
      console.error(`Error getting setting '${key}':`, error);
      return defaultValue;
    }
  }

  static async setSetting(key, value) {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('setting-handler'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key, value })
      });
      if (!response.ok) throw new Error(`Failed to set setting: ${key}`);
      return await response.json();
    } catch (error) {
      console.error(`Error setting setting '${key}':`, error);
      throw error;
    }
  }
  static async checkDatabaseConnection() {
    if (process.env.REACT_APP_ENV !== 'production') {
      console.log('Skipping database connection check in development environment');
      return true;
    }

    try {
      const response = await fetch(getApiUrl('db-check'));
      if (!response.ok) {
        throw new Error('Database connection failed');
      }
      const data = await response.json();
      console.log('Database connection status:', data.message);
      return true;
    } catch (error) {
      console.error('Error checking database connection:', error);
      return false;
    }
  }

  // ...existing code...

  static async persistInteraction(interactionData) {
    try {
      
      const response = await fetch(getApiUrl('db-persist-interaction'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...AuthService.getAuthHeader()
        },
        body: JSON.stringify(interactionData)
      });
      
      if (!response.ok) throw new Error('Failed to persist interaction');
      return await response.json();
    } catch (error) {
      console.error('Error persisting interaction:', error);
      throw error;
    }
  }

  
  
  static async getChatSession(sessionId) {
    try {
      const response = await fetch(getApiUrl(`chat-session`));
      if (!response.ok) throw new Error('Failed to get chat session');
      return await response.json();
    } catch (error) {
      console.error('Error getting chat session:', error);
      throw error;
    }
  }

  static async getLogs(chatId) {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl(`db-log?chatId=${chatId}`));
      if (!response.ok) throw new Error('Failed to get logs');
      return await response.json();
    } catch (error) {
      console.error('Error getting logs:', error);
      throw error;
    }
  }

  // ...existing code...

  static async deleteChat(chatId) {
    try {
  const response = await AuthService.fetchWithAuth(getApiUrl(`chat-delete?chatId=${chatId}`), {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete chat');
      }
      return await response.json();
    } catch (error) {
      console.error('Error deleting chat:', error);
      throw error;
    }
  }


  static async generateEmbeddings({ lastProcessedId = null, regenerateAll = false, provider = "openai" } = {}) {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-generate-embeddings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ lastProcessedId, regenerateAll, provider })
      });
      if (!response.ok) throw new Error('Failed to generate embeddings');
      return await response.json();
    } catch (error) {
      console.error('Error generating embeddings:', error);
      throw error;
    }
  }


  static async getTableCounts() {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-table-counts'));
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to fetch table counts');
      }
      const data = await response.json();
      return data.counts;
    } catch (error) {
      console.error('Error fetching table counts:', error);
      throw error;
    }
  }
  static async repairTimestamps() {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-repair-timestamps'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to repair timestamps');
      }
      return await response.json();
    } catch (error) {
      console.error('Error repairing timestamps:', error);
      throw error;
    }
  }

  static async repairExpertFeedback() {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-repair-expert-feedback'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to repair expert feedback');
      }
      return await response.json();
    } catch (error) {
      console.error('Error repairing expert feedback:', error);
      throw error;
    }
  }

  static async getPublicEvalList() {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-public-eval-list'));
      if (!response.ok) throw new Error('Failed to fetch public evaluation list');
      return await response.json();
    } catch (error) {
      console.error('Error fetching public evaluation list:', error);
      throw error;
    }
  }

  static async getChat(chatId) {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl(`db-chat?chatId=${chatId}`));
      if (!response.ok) throw new Error('Failed to fetch chat');
      return await response.json();
    } catch (error) {
      console.error('Error fetching chat:', error);
      throw error;
    }
  }

  static async migratePublicFeedback() {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-migrate-public-feedback'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to migrate public feedback');
      }
      return await response.json();
    } catch (error) {
      console.error('Error migrating public feedback:', error);
      throw error;
    }
  }

  static async getSiteStatus() {
    return await this.getPublicSetting('siteStatus', 'available');
  }
}

export default DataStoreService;


