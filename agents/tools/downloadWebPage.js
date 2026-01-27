import { tool } from "@langchain/core/tools";
import axios from "axios";
import { Agent } from "https";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { getEncoding } from "js-tiktoken";

const tokenizer = getEncoding("cl100k_base");
const DEFAULT_MAX_TOKENS = 32000;

function clipByTokens(text, maxTokens = DEFAULT_MAX_TOKENS) {
  const ids = tokenizer.encode(text);
  if (ids.length <= maxTokens) return text;
  return tokenizer.decode(ids.slice(0, maxTokens));
}

function htmlToLeanMarkdown(html, baseUrl) {
  // Build DOM & run Readability
  const dom = new JSDOM(html, { url: baseUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const contentHTML =
    (article && article.content) ||
    dom.window.document.querySelector("main")?.innerHTML ||
    dom.window.document.body?.innerHTML ||
    "";

  // Turndown defaults produce lean Markdown:
  // - Headings/lists kept
  // - Links preserved as [text](url)
  // - Images become ![alt](src)
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });

  let md = td.turndown(contentHTML);

  // Prepend title if available
  if (article?.title) md = `# ${article.title}\n\n` + md;

  // Normalize extra blank lines
  md = md
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n");

  // Clip to token budget
  return clipByTokens(md, DEFAULT_MAX_TOKENS);
}

async function downloadWebPage(url) {
  const httpsAgent = new Agent({ rejectUnauthorized: false });
  const res = await axios.get(url, {
    httpsAgent,
    maxRedirects: 10,
    timeout: 5000,
    headers: { "User-Agent": process.env.USER_AGENT || "ai-answers" },
  });
  return {
    markdown: htmlToLeanMarkdown(res.data, url),
    res
  };
}

const downloadWebPageTool = tool(
  async ({ url }) => {
    try {
      const { markdown, res } = await downloadWebPage(url);

      // Successfully received response
      const req = res.request;
      const config = res.config || {};

      console.log("Actual Request Sent:", {
        method: req?.method || config.method?.toUpperCase() || 'UNKNOWN',
        path: req?.path || config.url || 'UNKNOWN',
        headers: (typeof req?.getHeaders === 'function' ? req.getHeaders() : null) || config.headers || 'N/A'
      });
      return markdown;
    } catch (error) {
      const req = error.request || error.response?.request;
      // Fallback to config if request object is incomplete (common in timeouts/network errors)
      const config = error.config || {};

      console.log("Actual Request (Failed):", {
        method: req?.method || config.method?.toUpperCase() || 'UNKNOWN',
        path: req?.path || config.url || 'UNKNOWN',
        headers: (typeof req?.getHeaders === 'function' ? req.getHeaders() : null) || config.headers || 'N/A'
      });

      console.error(`Download error for ${url}:`, {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data
      });

      if (error.code === "ECONNREFUSED") throw new Error(`Connection refused: ${url}`);
      if (error.response?.status === 403) throw new Error(`Access forbidden (403): ${url}`);
      if (error.response?.status === 404) throw new Error(`Page not found (404): ${url}`);
      if (error.code === "ETIMEDOUT") throw new Error(`Request timed out: ${url}`);
      throw new Error(`Failed to download webpage: ${url} - ${error.message}`);
    }
  },
  {
    name: "downloadWebPage",
    description:
      "Download a web page, isolate main content with Readability, and return lean Markdown (links preserved).",
    schema: {
      type: "object",
      properties: { url: { type: "string", description: "URL to fetch" } },
      required: ["url"],
    },
  }
);

export default downloadWebPageTool;
