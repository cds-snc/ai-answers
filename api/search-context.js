import { contextSearch as canadaContextSearch } from '../agents/tools/canadaCaContextSearch.js';
import { contextSearch as googleContextSearch } from '../agents/tools/googleContextSearch.js';
import { exponentialBackoff } from '../src/utils/backoff.js';

async function performSearch(query, searchService = 'canadaca') {
    const searchFunction = searchService.toLowerCase() === 'google' 
        ? googleContextSearch 
        : canadaContextSearch;
        
    return await exponentialBackoff(() => searchFunction(query));
}

export default async function handler(req, res) {
    if (req.method === 'POST') {
        console.log('Received request to /api/context-agent');
        console.log('Request body:', req.body);
        const { query, searchService } = req.body;

        try {
            res.json(await performSearch(query, searchService));
        } catch (error) {
            console.error('Error processing search:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
