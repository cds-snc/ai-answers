import EvalAnalysisService, { MIN_EVALS, MAX_EVALS } from '../../services/EvalAnalysisService.js';
import { withProtection, authMiddleware, partnerOrAdminMiddleware } from '../../middleware/auth.js';
import { pickFilters } from './eval-analysis-util.js';

// Counts the human expert evaluations matching the applied dashboard filters
// so the UI can enable/disable the Run button and show the volume gates.
async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    try {
        const filters = pickFilters(req.query);
        if (!filters.department) {
            return res.status(400).json({ message: 'An institution (department) filter is required', code: 'departmentRequired' });
        }
        const count = await EvalAnalysisService.countEvals(filters);
        return res.status(200).json({ count, min: MIN_EVALS, max: MAX_EVALS });
    } catch (err) {
        console.error('Error in eval-analysis-precheck:', err);
        return res.status(500).json({ message: 'Failed to count evaluations', error: err.message });
    }
}

export default withProtection(handler, authMiddleware, partnerOrAdminMiddleware);
