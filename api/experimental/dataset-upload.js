import ExperimentalDatasetService from '../../services/experimental/ExperimentalDatasetService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function handler(req, res) {
    try {
        const { fileContent, mimetype, fileName, metadata } = req.body;

        if (!fileContent || !metadata?.name || !metadata?.type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Handle base64 input or JSON rows
        let result;
        if (typeof fileContent === 'string') {
            const buffer = Buffer.from(fileContent, 'base64');
            result = await ExperimentalDatasetService.createFromUpload(
                buffer,
                mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                metadata,
                req.user?._id
            );
        } else {
            return res.status(400).json({ error: 'fileContent must be a base64 string' });
        }

        return res.status(201).json(result);
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: err.message, details: err.errors });
        }
        if (err.name === 'DuplicateError') {
            return res.status(409).json({ error: err.message });
        }
        console.error('Dataset Upload Error:', err);
        return res.status(500).json({ error: err.message });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
