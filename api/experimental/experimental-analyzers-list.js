import ExperimentalAnalyzerRegistry from '../../services/experimental/ExperimentalAnalyzerRegistry.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function handler(req, res) {
    const analyzers = await ExperimentalAnalyzerRegistry.getAll();
    // Return only metadata needed by UI
    const metadata = analyzers.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        inputType: a.inputType,
        outputColumns: a.outputColumns
    }));
    return res.json(metadata);
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
