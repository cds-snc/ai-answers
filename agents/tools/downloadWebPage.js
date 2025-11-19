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
    timeout: 10000,
    headers: { "User-Agent": process.env.USER_AGENT || "Mozilla/5.0 (ContentFetcher)" },
  });
  return htmlToLeanMarkdown(res.data, url);
}

const downloadWebPageTool = tool(
  async ({ url }) => {
    try {
      return await downloadWebPage(url);
    } catch (error) {
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
