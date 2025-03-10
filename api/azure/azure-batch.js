import { getModelConfig } from '../../config/ai-models.js';
import dbConnect from '../../api/db/db-connect.js';
import { Batch } from '../../models/batch.js';
import { Interaction } from '../../models/interaction.js';
import { Context } from '../../models/context.js';
import { Question } from '../../models/question.js';
import { createDirectAzureOpenAIClient } from '../../agents/AgentService.js';

const MAX_JSONL_SIZE = 50000000; // Set a size limit for JSONL content

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const openai = createDirectAzureOpenAIClient();
        
        console.log('Azure Batch API request received:', {
            requestCount: req.body.requests?.length,
            systemPromptPresent: !!req.body.requests?.[0]?.systemPrompt,
            firstRequestSample: req.body.requests?.[0]?.message.substring(0, 100)
        });

        // ...existing code...

        const jsonlRequests = requests.map((request, index) => ({
            custom_id: `batch-${index}`,
            method: "POST",
            url: "/v1/chat/completions",
            body: {
                model: modelConfig.name,
                messages: [
                    {
                        role: "system",
                        content: request.systemPrompt
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

        // ...existing code...

        const savedBatch = new Batch({
            name: req.body.batchName,
            batchId: batch.id,
            type: "question",
            aiProvider: "azure",
            pageLanguage: req.body.lang,
            referringUrl: req.body.referringUrl,
        });

        for (const [index, request] of req.body.requests.entries()) {
            const context = new Context({
                ...request.context,
            });
            await context.save();

            // Create Question document
            const question = new Question({
                redactedQuestion: request.message
            });
            await question.save();

            // Create Interaction with references
            let interaction = new Interaction({
                interactionId: `batch-${index}`,
                question: question._id,
                context: context._id
            });
            await interaction.save();

            // Add interaction reference to batch
            savedBatch.interactions.push(interaction._id);
        }
        await savedBatch.save();
        console.log('Batch saved:', savedBatch);

        return res.status(200).json({ batchId: batch.id });
    } catch (error) {
        console.error('GPT Batch creation error:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers,
            stack: error.stack
        });
        return res.status(500).json({
            error: error.message,
            details: error.response?.data || 'No additional details available'
        });
    }
}