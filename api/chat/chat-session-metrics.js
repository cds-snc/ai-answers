import SessionManagementService from '../../services/SessionManagementService.js';
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';

async function sessionMetricsHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const summary = SessionManagementService.getSummary();
  return res.status(200).json({ sessions: summary, count: summary.length });
}

export default function handler(req, res) {
  return withProtection(sessionMetricsHandler, authMiddleware, adminMiddleware)(req, res);
}
