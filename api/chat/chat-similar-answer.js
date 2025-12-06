import ServerLoggingService from '../../services/ServerLoggingService.js';
import { SimilarAnswerService } from '../../services/SimilarAnswerService.js';
import { withSession } from '../../middleware/chat-session.js';
import { withOptionalUser } from '../../middleware/auth.js';

// --- Main handler (composed of the helpers above) ---
async function handler(req, res) {
    const validated = validateAndExtract(req);
    if (validated.error) {
        if (validated.error.headers) res.setHeader('Allow', validated.error.headers.Allow);
        return res.status(validated.error.code).end(validated.error.message);
    }

    try {
        const result = await SimilarAnswerService.findSimilarAnswer(validated);
        if (!result) {
            return res.json({});
        }
        return res.json(result);
    } catch (err) {
        ServerLoggingService.error('Error in chat-similar-answer', 'chat-similar-answer', err);
        return res.status(500).json({ error: 'internal error' });
    }
}

function validateAndExtract(req) {
    if (req.method !== 'POST') return { error: { code: 405, message: `Method ${req.method} Not Allowed`, headers: { Allow: ['POST'] } } };
    const chatId = req.chatId || null;
    const questions = Array.isArray(req.body?.questions) ? req.body.questions.filter(q => typeof q === 'string' && q.trim()).map(q => q.trim()) : [];
    if (questions.length === 0) return { error: { code: 400, message: 'Missing questions' } };
    const selectedAI = req.body?.selectedAI || 'openai';
    const recencyDays = typeof req.body?.recencyDays === 'number' ? req.body.recencyDays : 90;
    const requestedRating = typeof req.body?.expertFeedbackRating === 'number' ? req.body.expertFeedbackRating : 100;
    // Accept new shape: pageLanguage + detectedLanguage. Fall back to legacy `language` if provided.
    const pageLanguage = typeof req.body?.pageLanguage === 'string' && req.body.pageLanguage.trim() ? req.body.pageLanguage.trim() : (typeof req.body?.language === 'string' && req.body.language.trim() ? req.body.language.trim() : null);
    const detectedLanguage = typeof req.body?.detectedLanguage === 'string' && req.body.detectedLanguage.trim() ? req.body.detectedLanguage.trim() : null;
    if (!pageLanguage) return { error: { code: 400, message: 'Missing pageLanguage' } };
    return { chatId, questions, selectedAI, recencyDays, requestedRating, pageLanguage, detectedLanguage };
}

export default withOptionalUser(withSession(handler));

