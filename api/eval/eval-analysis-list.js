import EvalAnalysisService from '../../services/EvalAnalysisService.js';
import { requireLiteralString } from '../util/db-query.js';
import { withProtection, authMiddleware, partnerOrAdminMiddleware } from '../../middleware/auth.js';

// Lists recent analysis runs for an institution (newest first) for the
// past-analyses list on the partner dashboard.
async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    try {
        let { department } = req.query;
        if (!department) {
            return res.status(400).json({ message: 'Missing department' });
        }
        department = requireLiteralString(department, 'department');
        const analyses = await EvalAnalysisService.listAnalyses(department);
        return res.status(200).json({ analyses });
    } catch (err) {
        console.error('Error in eval-analysis-list:', err);
        return res.status(500).json({ message: 'Failed to list analyses', error: err.message });
    }
}

export default withProtection(handler, authMiddleware, partnerOrAdminMiddleware);
