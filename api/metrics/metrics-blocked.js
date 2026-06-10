import dbConnect from '../db/db-connect.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';
import BlockedQueryService from '../../services/BlockedQueryService.js';
import { parseRequestFilters } from './metrics-common.js';

// Safety/security counter: how many queries were blocked by the guardrails
// before reaching the answer step, broken down by block type and language.
// Department is intentionally not a dimension — blocks happen before the
// department is known — so the dashboards hide this table when a department
// is selected and this endpoint ignores any department filter.
async function getBlockedMetrics(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    await dbConnect();
    const { dateFilter } = parseRequestFilters(req);

    if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

    const metrics = await BlockedQueryService.getBlockedMetrics({
      start: dateFilter.createdAt.$gte,
      end: dateFilter.createdAt.$lte,
      userType: req.query.userType,
    });

    return res.status(200).json({ success: true, metrics });
  } catch (error) {
    console.error('Error in blocked metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch blocked metrics' });
  }
}

export default withProtection(getBlockedMetrics, authMiddleware, partnerOrAdminMiddleware);
