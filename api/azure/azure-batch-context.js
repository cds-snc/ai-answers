import { getModelConfig } from '../../config/ai-models.js';
import dbConnect from '../../api/db/db-connect.js';
import { Batch } from '../../models/batch.js';
import { Interaction } from '../../models/interaction.js';
import { Context } from '../../models/context.js';
import { Question } from '../../models/question.js';
import { createDirectAzureOpenAIClient } from '../../agents/AgentService.js';

const modelConfig = getModelConfig('azure', 'gpt4a-mini');
const openai = createDirectAzureOpenAIClient();

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('Azure Context Batch API request received:', {
            requestCount: req.body.requests?.length
        });

        if (!req.body.requests || !Array.isArray(req.body.requests)) {
            throw new Error('Invalid requests array in payload');
        }

        const jsonlRequests = req.body.requests.map((request, index) => ({
            custom_id: `batch-${index}`,
            method: "POST",
            url: "/v1/chat/completions",
            body: {
                model: modelConfig.name,
                messages: [
                    {
                        role: "system",
                        content: `${request.systemPrompt}<searchResults>${request.searchResults.results}</searchResults>`,
                    },
                    {
                        role: "user",
                        content: request.message
                    }
                ],
                max_tokens: modelConfig.maxTokens,
                temperature: modelConfig.temperature
            }
        }));

        // ...existing code for file upload and batch creation...

        // Save to database
        await dbConnect();
        const savedBatch = new Batch({
            batchId: openAIBatch.id,
            type: "context",
            aiProvider: "azure",
            pageLanguage: req.body.lang,
            name: req.body.batchName
        });

        // ...existing code for saving interactions...