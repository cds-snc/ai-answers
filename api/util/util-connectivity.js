import { testAllConnections } from '../../services/ConnectivityService.js';
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';

async function connectivityHandler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const results = await testAllConnections();
        return res.status(200).json(results);
    } catch (error) {
        console.error('Connectivity test error:', error);
        return res.status(500).json({
            error: 'Failed to run connectivity tests',
            message: error.message
        });
    }
}

export default function handler(req, res) {
    return withProtection(connectivityHandler, authMiddleware, adminMiddleware)(req, res);
}
