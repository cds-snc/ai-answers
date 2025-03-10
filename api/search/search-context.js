import { contextSearch as canadaContextSearch } from '../../agents/tools/canadaCaContextSearch.js';
import { contextSearch as googleContextSearch } from '../../agents/tools/googleContextSearch.js';
import { exponentialBackoff } from '../../src/utils/backoff.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';

async function performSearch(query, lang, searchService = 'canadaca', chatId = 'system') {
    const searchFunction = searchService.toLowerCase() === 'google' 
        ? googleContextSearch 
        : canadaContextSearch;
        
    return await exponentialBackoff(() => searchFunction(query, lang));
}

export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { query, lang, searchService, chatId = 'system' } = req.body;
        ServerLoggingService.info('Received request to search.', chatId, { query, lang, searchService });
        
        try {
            const searchResults = await performSearch(query, lang, searchService, chatId);
            ServerLoggingService.debug('Search results:', chatId, searchResults);
            res.json(searchResults);
        } catch (error) {
            ServerLoggingService.error('Error processing search:', chatId, error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
