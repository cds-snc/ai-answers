import EvalAnalysisService from '../../services/EvalAnalysisService.js';
import { withProtection, authMiddleware, partnerOrAdminMiddleware } from '../../middleware/auth.js';
import { pickFilters, sendServiceError } from './eval-analysis-util.js';

// Creates a new analysis run (status 'running') after re-validating the
// volume gates server-side. The heavy work happens through repeated
// eval-analysis-advance calls driven by the client.
async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    try {
        const body = req.body || {};
        const filters = pickFilters(body.filters || {});
        const analysis = await EvalAnalysisService.createAnalysis({
            filters,
            language: body.language === 'fr' ? 'fr' : 'en',
            requestedBy: req.user?.email || ''
        });
        return res.status(200).json({ analysis });
    } catch (err) {
        try {
            return sendServiceError(res, err);
        } catch (unhandled) {
            console.error('Error in eval-analysis-run:', unhandled);
            return res.status(500).json({ message: 'Failed to create analysis', error: unhandled.message });
        }
    }
}

export default withProtection(handler, authMiddleware, partnerOrAdminMiddleware);
