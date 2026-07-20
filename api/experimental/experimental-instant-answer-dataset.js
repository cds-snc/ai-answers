import ExperimentalDatasetService from '../../services/experimental/ExperimentalDatasetService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function handler(req, res) {
    try {
        const request = req.method === 'GET' ? req.query : req.body;
        const { startDate, endDate, occurrencesPerQuestion } = request;
        if (req.method === 'GET') {
            return res.json(await ExperimentalDatasetService.previewInstantAnswerDataset(
                startDate,
                endDate,
                occurrencesPerQuestion
            ));
        }
        if (req.method === 'POST') {
            return res.status(201).json(await ExperimentalDatasetService.createInstantAnswerDataset({
                startDate,
                endDate,
                occurrencesPerQuestion,
                name: request.name,
                description: request.description,
                method: request.method,
                type: request.type,
                category: request.category,
                userId: req.user?.userId
            }));
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        if (err.name === 'DuplicateError') return res.status(409).json({ error: err.message });
        return res.status(400).json({ error: err.message });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}

