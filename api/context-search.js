import { contextSearch } from '../agents/tools/contextSearch.js';

async function exponentialBackoff(fn, retries = 5, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                throw error;
            }
        }
    }
}

async function performSearch(query) {
    return await exponentialBackoff(() => contextSearch(query));
}


export default async function handler(req, res) {
    if (req.method === 'POST') {
        console.log('Received request to /api/context-agent');
        console.log('Request body:', req.body);
        const { query } = req.body;

        try {
            const result = await performSearch(query);
            res.json({ content: result });
        } catch (error) {
            console.error('Error processing search:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
