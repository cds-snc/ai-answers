import { tool } from "@langchain/core/tools";
import axios from 'axios';
import { load } from 'cheerio';
import { Agent } from 'https';
import { getEncoding } from "js-tiktoken";

const tokenizer = getEncoding("cl100k_base"); // OpenAI's default tokenizer

/**
 * Extracts the content of the body from a cheerio object, including all text and keeping <a> tags,
 * with newline characters after block elements.
 * @param {object} $ - The cheerio object of the parsed HTML.
 * @param {number} maxTokens - Maximum number of tokens to extract (default 8000)
 * @returns {string} - The extracted body content with links and formatted text.
 */
function extractBodyContentWithLinks($, maxTokens = 8000) {
    const bodyContent = [];
    const blockTags = new Set(['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'hr', 'details', 'summary', 'table', 'tr', 'td', 'th']);
    const mainTag = $('main');
    let totalTokens = 0;

    if (mainTag.length > 0) {
        mainTag.find('*').each((_, element) => {
            // Check if we've exceeded token limit
            if (totalTokens >= maxTokens) {
                return false; // Break the each loop
            }

            const tag = $(element);
            let content = '';

            if (element.type === 'text') {
                const text = tag.text().trim();
                if (text) content = text;
            } else if (element.tagName === 'a') {
                content = $.html(element).trim();
            } else if (element.tagName === 'table') {
                // Special handling for tables
                const tableContent = [];
                let isFirstRow = true;
                
                tag.find('tr').each((_, row) => {
                    const rowContent = [];
                    $(row).find('th, td').each((_, cell) => {
                        const $cell = $(cell);
                        let cellText = '';
                        
                        // Handle cells that contain links
                        const links = $cell.find('a');
                        if (links.length > 0) {
                            links.each((_, link) => {
                                const $link = $(link);
                                const linkText = $link.text().trim();
                                if (linkText) cellText += linkText;
                            });
                        } else {
                            // Handle bold text
                            const boldText = $cell.find('strong').text().trim();
                            if (boldText) {
                                cellText = boldText;
                                // Add the rest of the text if any
                                const remainingText = $cell.clone().find('strong').remove().end().text().trim();
                                if (remainingText) cellText += remainingText;
                            } else {
                                cellText = $cell.text().trim();
                            }
                        }
                        
                        // Clean up multiple spaces and newlines, but preserve intentional line breaks
                        cellText = cellText
                            .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
                            .replace(/\n\s*\n/g, '\n')  // Replace multiple newlines with single newline
                            .trim();
                        
                        if (cellText) rowContent.push(cellText);
                    });
                    
                    if (rowContent.length > 0) {
                        if (isFirstRow) {
                            // Add header row
                            tableContent.push(rowContent.join(' | '));
                            // Add separator row for markdown tables
                            tableContent.push(rowContent.map(() => '---').join(' | '));
                            isFirstRow = false;
                        } else {
                            // For long content, wrap in a single line
                            const wrappedRow = rowContent.map(text => {
                                // If text is too long, wrap it to maintain table structure
                                return text.length > 100 ? text.substring(0, 97) + '...' : text;
                            });
                            tableContent.push(wrappedRow.join(' | '));
                        }
                    }
                });
                content = tableContent.join('\n');
            } else if (element.tagName === 'details') {
                // Special handling for details element
                const summary = tag.find('summary').text().trim();
                const detailsContent = tag.find('*:not(summary)').text().trim();
                if (summary) content = `Summary: ${summary}\n`;
                if (detailsContent) content += `Details: ${detailsContent}\n`;
            } else if (element.tagName === 'form') {
                // Special handling for forms
                const formContent = [];
                tag.find('input, select, textarea').each((_, formElement) => {
                    const $formElement = $(formElement);
                    const type = $formElement.attr('type') || formElement.tagName.toLowerCase();
                    const name = $formElement.attr('name') || '';
                    const value = $formElement.attr('value') || '';
                    const label = $formElement.closest('label').text().trim() || 
                                $(`label[for="${$formElement.attr('id')}"]`).text().trim();
                    
                    if (type === 'radio' || type === 'checkbox') {
                        if ($formElement.is(':checked')) {
                            formContent.push(`${label || name}: ${value || 'checked'}`);
                        }
                    } else if (type === 'select') {
                        const selectedOption = $formElement.find('option:selected').text();
                        formContent.push(`${label || name}: ${selectedOption}`);
                    } else {
                        formContent.push(`${label || name}: ${value}`);
                    }
                });
                content = formContent.join('\n');
            } else if (blockTags.has(element.tagName)) {
                const text = tag.text().trim();
                if (text) content = text + '\n';
            } else {
                const text = tag.text().trim();
                if (text) content = text;
            }

            if (content) {
                const tokens = tokenizer.encode(content);
                if (totalTokens + tokens.length <= maxTokens) {
                    bodyContent.push(content);
                    totalTokens += tokens.length;
                } else {
                    // Add partial content up to token limit if possible
                    const remainingTokens = maxTokens - totalTokens;
                    if (remainingTokens > 0) {
                        const partialContent = tokenizer.decode(tokens.slice(0, remainingTokens));
                        bodyContent.push(partialContent);
                        totalTokens = maxTokens;
                    }
                    return false; // Break the each loop
                }
            }
        });
    }

    return bodyContent.join(' ');
}

const downloadWebPage = async (url, chatId = 'system') => {
    const httpsAgent = new Agent({ rejectUnauthorized: false });
    const DEFAULT_MAX_TOKENS = 8000; // Set a reasonable default token limit
    
    try {
        const response = await axios.get(url, {
            httpsAgent,
            maxRedirects: 10,
            timeout: 5000,
            headers: {
                'User-Agent': process.env.USER_AGENT
            }
        });
        
        const $ = load(response.data);
        return extractBodyContentWithLinks($, DEFAULT_MAX_TOKENS);
    } catch (error) {
        // Throw error with specific message based on error type
        if (error.code === 'ECONNREFUSED') {
            throw new Error(`Connection refused: ${url}`);
        } else if (error.response?.status === 403) {
            throw new Error(`Access forbidden (403): ${url}`);
        } else if (error.response?.status === 404) {
            throw new Error(`Page not found (404): ${url}`);
        } else if (error.code === 'ETIMEDOUT') {
            throw new Error(`Request timed out: ${url}`);
        } else {
            throw new Error(`Failed to download webpage: ${url} - ${error.message}`);
        }
    }
};

const downloadWebPageTool = tool(
    async ({ url, chatId }) => {
        return await downloadWebPage(url, chatId);
    },
    {
        name: "downloadWebPage",
        description: "When information about a URL is needed, use this function to get the web page content. Provide a valid URL.",
        schema: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "The URL to download and parse content from",
                }
            },
            required: ["url"]
        },
    }
);

export default downloadWebPageTool;