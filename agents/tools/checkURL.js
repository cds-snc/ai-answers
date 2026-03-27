import { tool } from "@langchain/core/tools";
import axios from 'axios';
import { Agent } from 'https';

const checkUrlStatus = async (url, chatId = 'system') => {
    const httpsAgent = new Agent({ rejectUnauthorized: false });

    try {
        const response = await axios.get(url, { 
            httpsAgent, 
            maxRedirects: 10,
            timeout: 5000,
            headers: {
                'User-Agent': process.env.USER_AGENT
            }
        });
        const isLive = response.status === 200;
        if (!isLive) {
            throw new Error(`URL returned status ${response.status}: ${url}`);
        }
        return `URL is live (${url})`;
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            throw new Error(`Connection refused: ${url}`);
        } else if (error.response?.status === 403) {
            throw new Error(`Access forbidden (403): ${url}`);
        } else if (error.response?.status === 404) {
            throw new Error(`Page not found (404): ${url}`);
        } else if (error.code === 'ETIMEDOUT') {
            throw new Error(`Request timed out: ${url}`);
        } else {
            throw new Error(`URL check failed: ${url} - ${error.message}`);
        }
    }
};

const checkUrlStatusTool = tool(
    async ({ url, chatId = 'system' }) => {
        return await checkUrlStatus(url, chatId);
    },
    {
        name: "checkUrl",
        description: "Always use this tool to verify the status of a URL. Provide a valid URL.",
        schema: {
            type: "object",
            properties: {
                url: { 
                    type: "string", 
                    description: "The URL to check" 
                }
            },
            required: ["url"]
        }
    }
);

export default checkUrlStatusTool;