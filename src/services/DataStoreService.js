import { getApiUrl, getProviderApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';

class DataStoreService {
  static async getSetting(key, defaultValue = null) {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl(`db-settings?key=${encodeURIComponent(key)}`));
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
      const response = await AuthService.fetchWithAuth(getApiUrl('db-settings'), {
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

  static async persistBatch(batchData) {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-batch'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(batchData)
      });
      
      if (!response.ok) throw new Error('Failed to persist batch');
      return await response.json();
    } catch (error) {
      console.error('Error persisting batch:', error);
      throw error;
    }
  }

  static async getBatchList() {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-batch-list'));
      
      if (!response.ok) throw new Error('Failed to get batch list');
      return await response.json();
    } catch (error) {
      console.error('Error getting batch list:', error);
      throw error;
    }
  }


  static async getBatch(batchId) {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl(`db-batch-retrieve?batchId=${batchId}`));
      
      if (!response.ok) throw new Error('Failed to retrieve batch');
      return await response.json();
    } catch (error) {
      console.error('Error retrieving batch:', error);
      throw error;
    }
  }

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

  
  static async persistFeedback(feedback, chatId, userMessageId) {
    let payload = {};
    if (feedback?.type === 'expert') {
      const formattedExpertFeedback = {
        ...feedback,
        totalScore: feedback.totalScore ?? null,
        sentence1Score: feedback.sentence1Score ?? null,
        sentence2Score: feedback.sentence2Score ?? null,
        sentence3Score: feedback.sentence3Score ?? null,
        sentence4Score: feedback.sentence4Score ?? null,
        citationScore: feedback.citationScore ?? null,
        answerImprovement: feedback.answerImprovement || '',
        expertCitationUrl: feedback.expertCitationUrl || '',
        feedback: feedback.feedback
      };
      payload.expertFeedback = formattedExpertFeedback;
      console.log('User feedback:', JSON.stringify(formattedExpertFeedback, null, 2));
    } else if (feedback?.type === 'public') {
      const formattedPublicFeedback = {
        feedback: feedback.feedback,
        publicFeedbackReason: feedback.publicFeedbackReason || '',
        publicFeedbackScore: feedback.publicFeedbackScore ?? null
      };
      payload.publicFeedback = formattedPublicFeedback;
      console.log('User feedback:', JSON.stringify(formattedPublicFeedback, null, 2));
    } else {
      return;
    }

    try {
      const response = await fetch(getApiUrl('db-persist-feedback'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: chatId,
          interactionId: userMessageId,
          ...payload
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to log feedback');
      }

      console.log('Feedback logged successfully to database');
    } catch (error) {
      console.log('Development mode: Feedback not logged to console', payload);
    }

  }
  static async getChatSession(sessionId) {
    try {
      const response = await fetch(getApiUrl(`db-chat-session?sessionId=${sessionId}`));
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

  static async getBatchStatus(batchId, aiProvider) {
    try {
      const response = await AuthService.fetchWithAuth(
        getProviderApiUrl(aiProvider, `batch-status?batchId=${batchId}`)
      );
      const data = await response.json();
      return { batchId, status: data.status };
    } catch (error) {
      console.error(`Error fetching status for batch ${batchId}:`, error);
      return { batchId, status: 'Error' };
    }
  }

  static async cancelBatch(batchId, aiProvider) {
    try {
      const response = await AuthService.fetchWithAuth(
        getProviderApiUrl(aiProvider, `batch-cancel?batchId=${batchId}`)
      );
      if (!response.ok) throw new Error('Failed to cancel batch');
      return await response.json();
    } catch (error) {
      console.error('Error canceling batch:', error);
      throw error;
    }
  }

  static async getBatchStatuses(batches) {
    try {
      const statusPromises = batches.map(async (batch) => {
        if (!batch.status || batch.status !== 'processed') {
          const statusResult = await this.getBatchStatus(batch.batchId, batch.aiProvider);
          if (statusResult.status === 'not_found') {
            await this.cancelBatch(batch.batchId, batch.aiProvider);
          }
          return statusResult;
        } else {
          return Promise.resolve({ batchId: batch.batchId, status: batch.status });
        }
      });
      const statusResults = await Promise.all(statusPromises);
      return batches.map((batch) => {
        const statusResult = statusResults.find((status) => status.batchId === batch.batchId);
        return { ...batch, status: statusResult ? statusResult.status : 'Unknown' };
      });
    } catch (error) {
      console.error('Error fetching statuses:', error);
      throw error;
    }
  }

  static async deleteChat(chatId) {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl(`db-delete-chat?chatId=${chatId}`), {
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


  static async generateEmbeddings({ lastProcessedId = null, regenerateAll = false } = {}) {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-generate-embeddings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ lastProcessedId, regenerateAll })
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
    try {
      const response = await fetch(getApiUrl('db-public-site-status'));
      if (!response.ok) throw new Error('Failed to fetch site status');
      const data = await response.json();
      return data.value;
    } catch (error) {
      console.error('Error fetching site status:', error);
      return 'unavailable';
    }
  }
}

export default DataStoreService;
