import { tool } from '@langchain/core/tools';
import axios from 'axios';
import { Agent } from 'https';

const checkUrlStatus = async (url) => {
  const httpsAgent = new Agent({ rejectUnauthorized: false });

  try {
    const response = await axios.get(url, {
      httpsAgent,
      maxRedirects: 10,
      timeout: 10000,
    });
    console.log(response.status === 200 ? `URL is live (${url})` : `URL is dead (${url})`);
    return response.status === 200 ? `URL is live (${url})` : `URL is dead (${url})`;
  } catch (getError) {
    console.log(`Error checking URL with GET request: ${url}. Details: ${getError.message}`);
    return `URL is dead ${url}`;
  }
};

const checkUrlStatusTool = tool(
  async (input) => {
    return await checkUrlStatus(input);
  },
  {
    name: 'checkUrl',
    description:
      "Always use this tool to verify the status of a URL. Provide a valid URL as input to check its status. Example input: 'https://example.com'",
  }
);

export default checkUrlStatusTool;
