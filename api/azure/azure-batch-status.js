import { createDirectAzureOpenAIClient } from '../../agents/AgentService.js';

const openai = createDirectAzureOpenAIClient();

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        const { batchId } = req.query;
        const batch = await openai.batches.retrieve(batchId);

        return res.status(200).json({
            status: batch.status,
        });
    } catch (error) {
        return res.status(200).json({
            status: "not_found",
        });
    }
}