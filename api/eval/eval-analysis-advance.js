import EvalAnalysisService from '../../services/EvalAnalysisService.js';
import { requireObjectIdString } from '../util/db-query.js';
import { withProtection, authMiddleware, partnerOrAdminMiddleware } from '../../middleware/auth.js';
import { sendServiceError } from './eval-analysis-util.js';

// Advances a running analysis by exactly one step (snapshot + program proposal,
// one classification chunk, or synthesis). The client keeps calling until the
// returned status is 'complete' or 'error' — chunk-per-request keeps every
// call short enough for serverless deployments.
async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    try {
        let { analysisId } = req.body || {};
        if (!analysisId) {
            return res.status(400).json({ message: 'Missing analysisId' });
        }
        analysisId = requireObjectIdString(analysisId, 'analysisId');
        const analysis = await EvalAnalysisService.advance(analysisId);
        return res.status(200).json({ analysis });
    } catch (err) {
        try {
            return sendServiceError(res, err);
        } catch (unhandled) {
            console.error('Error in eval-analysis-advance:', unhandled);
            return res.status(500).json({ message: 'Failed to advance analysis', error: unhandled.message });
        }
    }
}

export default withProtection(handler, authMiddleware, partnerOrAdminMiddleware);
