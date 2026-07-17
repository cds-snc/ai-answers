import dbConnect from '../db/db-connect.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';
import MetricsService from '../../services/MetricsService.js';
import { parseRequestFilters } from './metrics-common.js';

async function getTechnicalMetrics(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    await dbConnect();
    const {
      dateFilter,
      extraFilterConditions,
      departmentFilter,
      answerTypeFilter,
      partnerEvalFilter,
      aiEvalFilter
    } = parseRequestFilters(req);

    if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

    const metrics = await MetricsService.getTechnicalMetrics({
      dateFilter,
      extraFilterConditions,
      departmentFilter,
      answerTypeFilter,
      partnerEvalFilter,
      aiEvalFilter
    });

    return res.status(200).json({
      success: true,
      metrics
    });
  } catch (error) {
    console.error('Error in technical metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch technical metrics' });
  }
}

export default withProtection(getTechnicalMetrics, authMiddleware, partnerOrAdminMiddleware);
