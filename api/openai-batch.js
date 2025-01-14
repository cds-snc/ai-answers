import OpenAI from 'openai';
import { getModelConfig } from '../config/ai-models.js';
import { Readable } from 'stream';
import dbConnect from './db-connect.js';
import { Batch } from '../models/batch/batch.js';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const MAX_JSONL_SIZE = 50000000; // Set a size limit for JSONL content



export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {

        console.log('Batch API request received:', {
            requestCount: req.body.requests?.length,
            systemPromptPresent: !!req.body.requests?.[0]?.systemPrompt,
            firstRequestSample: req.body.requests?.[0]?.message.substring(0, 100)
        });

        const { requests } = req.body;
        const modelConfig = getModelConfig('openai');

        const jsonlRequests = requests.map((request, index) => ({
            custom_id: `eval-${index}`,
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

        // Convert to JSONL format
        let jsonlContent = jsonlRequests
            .map(req => JSON.stringify(req))
            .join('\n');

        // Log the size of the JSONL content
        console.log('Size of JSONL content:', Buffer.byteLength(jsonlContent, 'utf8'), 'bytes');

        const jsonlBuffer = Buffer.from(jsonlContent, 'utf-8');

        const jsonlBlob = new Blob([jsonlBuffer], { type: 'application/jsonl' });

        const formData = new FormData();
        formData.append('file', jsonlBlob, 'data.jsonl'); // Filename is important

        formData.append('purpose', 'batch');

        const file = await fetch('https://api.openai.com/v1/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: formData,
        });
        const fileData = await file.json();
        console.log('File created with ID:', fileData.id);
     

        // Create the batch using the file
        const batch = await openai.batches.create({
            input_file_id: fileData.id,
            endpoint: "/v1/chat/completions",
            completion_window: "24h"
        });
        console.log('Batch created with ID:', batch.id);

        // save the batch id and entries
        await dbConnect();
        const savedBatch = new Batch({
            batchId: batch.id,
            type: "question",
            provider: "openai",
            entries: req.body.requests.map((request, index) => ({
                entry_id: `eval-${index}`,
                ...request.entry
            }))
        });
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