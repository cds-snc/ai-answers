import ServerLoggingService from '../../services/ServerLoggingService.js';

export default async function handler(req, res) {
    if (req.method === 'POST') {
        try {
            const { chatId, logLevel, message, metadata } = req.body;
            ServerLoggingService.log(logLevel, message, chatId, metadata);
            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Error saving log:', error);
            return res.status(500).json({ error: 'Failed to save log' });
        }
    } else if (req.method === 'GET') {
        try {
            const { chatId, days = 1, level, skip = 0, limit = 1000 } = req.query;
            const logs = await ServerLoggingService.getLogs({ 
                chatId, 
                level,
                skip: parseInt(skip),
                limit: parseInt(limit)
            });
            return res.status(200).json(logs);
        } catch (error) {
            console.error('Error fetching logs:', error);
            return res.status(500).json({ error: 'Failed to fetch logs' });
        }
    } else {
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}