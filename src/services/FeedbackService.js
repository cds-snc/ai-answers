import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';
import ClientLoggingService from './ClientLoggingService.js';

class FeedbackService {
  static async persistExpertFeedback({ chatId, interactionId, expertFeedback }) {
    if (!chatId || !interactionId || !expertFeedback) {
      throw new Error('Missing required fields');
    }
    // Format expert feedback fields as in DataStoreService
    const formattedExpertFeedback = {
      ...expertFeedback,
      totalScore: expertFeedback.totalScore ?? null,
      sentence1Score: expertFeedback.sentence1Score ?? null,
      sentence2Score: expertFeedback.sentence2Score ?? null,
      sentence3Score: expertFeedback.sentence3Score ?? null,
      sentence4Score: expertFeedback.sentence4Score ?? null,
      citationScore: expertFeedback.citationScore ?? null,
      answerImprovement: expertFeedback.answerImprovement || '',
      expertCitationUrl: expertFeedback.expertCitationUrl || '',
      feedback: expertFeedback.feedback
    };
    // Log expert feedback using ClientLoggingService
    await ClientLoggingService.info(chatId, 'Expert feedback submitted', formattedExpertFeedback);
    const response = await AuthService.fetch(getApiUrl('feedback-persist-expert'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ chatId, interactionId, expertFeedback: formattedExpertFeedback })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to persist expert feedback');
    }
    return await response.json();
  }

  static async persistPublicFeedback({ chatId, interactionId, publicFeedback }) {
    if (!chatId || !interactionId || !publicFeedback) {
      throw new Error('Missing required fields');
    }
    // Format public feedback fields as in DataStoreService
    const formattedPublicFeedback = {
      feedback: publicFeedback.feedback,
      publicFeedbackReason: publicFeedback.publicFeedbackReason || '',
      publicFeedbackScore: publicFeedback.publicFeedbackScore ?? null
    };
    // Log public feedback using ClientLoggingService
    await ClientLoggingService.info(chatId, 'Public feedback submitted', formattedPublicFeedback);
    const response = await AuthService.fetch(getApiUrl('feedback-persist-public'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chatId,
        interactionId,
        publicFeedback: formattedPublicFeedback
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to persist public feedback');
    }
    return await response.json();
  }

  static async getExpertFeedback({ interactionId }) {
    if (!interactionId) throw new Error('Missing required fields');
    const response = await AuthService.fetch(getApiUrl('feedback-get-expert'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Failed to fetch expert feedback');
    }
    return response.json();
  }

  static async getPublicFeedback({ interactionId }) {
    if (!interactionId) throw new Error('Missing required fields');
    const response = await AuthService.fetch(getApiUrl('feedback-get-public'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Failed to fetch public feedback');
    }
    return response.json();
  }

  static async deleteExpertFeedback({ interactionId }) {
    if (!interactionId) throw new Error('Missing required fields');
    const response = await AuthService.fetch(getApiUrl('feedback-delete-expert'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete expert feedback');
    }
    return data;
  }

  // expertFeedbackId + expectedLastEditedAt: the evaluation this form loaded.
  // The server refuses the save (EXPERT_FEEDBACK_CONFLICT) if someone else
  // edited it since, rather than overwrite their changes.
  static async updateExpertFeedback({ interactionId, expertFeedbackId, expectedLastEditedAt = null, expertFeedback }) {
    if (!interactionId || !expertFeedbackId || !expertFeedback) throw new Error('Missing required fields');
    const response = await AuthService.fetch(getApiUrl('feedback-update-expert'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId, expertFeedbackId, expectedLastEditedAt, expertFeedback })
    });
    const data = await response.json();
    if (!response.ok) {
      const err = new Error(data.message || 'Failed to update expert feedback');
      if (data.code) err.code = data.code;
      throw err;
    }
    return data;
  }

  static async setExpertNeverStale({ interactionId, neverStale }) {
    if (!interactionId || typeof neverStale === 'undefined') throw new Error('Missing required fields');
    const response = await AuthService.fetch(getApiUrl('feedback-expert-never-stale'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId, neverStale })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update expert feedback neverStale');
    }
    return data;
  }
}

export default FeedbackService;
