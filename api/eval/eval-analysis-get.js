import EvalAnalysisService from '../../services/EvalAnalysisService.js';
import { requireObjectIdString } from '../util/db-query.js';
import { withProtection, authMiddleware, partnerOrAdminMiddleware } from '../../middleware/auth.js';
import { sendServiceError } from './eval-analysis-util.js';

// Returns a stored analysis (report data without the internal rows snapshot),
// used to re-display past runs without re-running any LLM calls.
async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    try {
        let { analysisId } = req.query;
        if (!analysisId) {
            return res.status(400).json({ message: 'Missing analysisId' });
        }
        analysisId = requireObjectIdString(analysisId, 'analysisId');
        const analysis = await EvalAnalysisService.getAnalysis(analysisId);
        return res.status(200).json({ analysis });
    } catch (err) {
        try {
            return sendServiceError(res, err);
        } catch (unhandled) {
            console.error('Error in eval-analysis-get:', unhandled);
            return res.status(500).json({ message: 'Failed to retrieve analysis', error: unhandled.message });
        }
    }
}

export default withProtection(handler, authMiddleware, partnerOrAdminMiddleware);
