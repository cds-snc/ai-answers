import { tool } from "@langchain/core/tools";
import axios from "axios";
import { Agent } from "https";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { getEncoding } from "js-tiktoken";
import { normalizeFetchUrl } from "../../api/util/normalizeFetchUrl.js";
import {
  retryOnTransientError,
  isTransientNetworkError,
  errorCodeChain,
} from "../../api/util/transient-retry.js";

const tokenizer = getEncoding("cl100k_base");

// Raised from 32000 after measuring 474 pages drawn from the scenario prompts:
// the median page is ~1,200 tokens and only six exceed 32k, so the higher cap
// costs nothing on almost every read. It buys the pages that matter — the
// counter-tariff list's current table alone runs to ~39k tokens, and at the old
// cap the tail of it was cut off mid-table.
const DEFAULT_MAX_TOKENS = 48000;

// Boilerplate that lives *inside* <main> on the GCWeb/Canada.ca templates and
// is noise in every extraction: page-feedback widgets, share buttons, the
// "date modified" block. Inline <style>/<script> matter most — a single page
// carried 5,691 characters of CSS inside <main>.
const MAIN_NOISE_SELECTOR = [
  "script",
  "style",
  "noscript",
  "iframe",
  ".pagedetails",
  ".gc-pg-hlpfl",
  ".wb-share",
  ".gc-rate",
  ".gc-followus",
  "#chat-bubble",
].join(",");

// A <main> holding less than this much text is a shell, not a page: some sites
// render the real content into it with JavaScript. Below the floor we fall
// through to Readability, which can sometimes recover the content from
// elsewhere in the document. Low enough that a short but genuine page — a
// contact card, a form — still takes the <main> path, and comfortably above
// MIN_CONTENT_CHARS so anything that clears it also clears the final check.
const MIN_MAIN_TEXT_CHARS = 200;

// Client-rendered pages (e.g. Nuxt/Angular SPAs) return HTTP 200 with an empty
// body, so Readability extracts nothing. Without this floor the agent receives
// an empty string as a successful read and answers from training data instead.
// Measured against live Canada.ca pages: the shortest genuine extraction is
// ~300 chars, while shells produce 0.
const MIN_CONTENT_CHARS = 50;

// NXDOMAIN and a refused port are settled answers, not blips: they cannot change
// within the ~750ms a retry would spend. The model also invents hostnames, which
// makes ENOTFOUND a routine outcome here rather than a network fault. Retrying
// either just delays the same error, so this tool opts out of both.
const SETTLED_FAILURE_CODES = new Set(["ENOTFOUND", "ECONNREFUSED"]);

export const REQUEST_TIMEOUT_MS = 5000;

// Deliberately below REQUEST_TIMEOUT_MS. retryOnTransientError checks this after
// a failure to decide whether to start another attempt, so any request that
// burned its full timeout is already over budget and will not be retried — one
// slow origin costs 5s, not 10s. Failures that return fast (a reset mid-read)
// are nowhere near the budget and still get all their attempts.
export const RETRY_TIME_BUDGET_MS = 3000;

function isWorthRetrying(error) {
  // Reads the whole cause chain, matching isTransientNetworkError. An opt-out
  // that only checked error.code would miss a code nested one level down and
  // let the retry it is meant to prevent happen anyway.
  if (errorCodeChain(error).some((code) => SETTLED_FAILURE_CODES.has(code))) return false;
  return isTransientNetworkError(error);
}

// Clipping used to be silent, which made a partial read indistinguishable from
// a complete one. On a long list page that turns "I did not read that far" into
// "it is not on the list" — a false negative the agent states with confidence
// and nothing flags. The notice is the only thing that makes truncation visible.
function truncationNotice(readTokens, totalTokens) {
  const percent = Math.max(1, Math.round((readTokens / totalTokens) * 100));
  return (
    `\n\n---\n[TRUNCATED] This page was too long to read in full. You have read about ` +
    `the first ${percent}% of it; the rest was not retrieved. What you are looking for ` +
    `may be in the part you did not read, so do not say that something is absent from ` +
    `this page, and do not treat any list above as complete.`
  );
}

function clipByTokens(text, maxTokens = DEFAULT_MAX_TOKENS) {
  const ids = tokenizer.encode(text);
  if (ids.length <= maxTokens) return text;

  // Budget for the notice inside the cap so a clipped page never exceeds it.
  const noticeBudget = tokenizer.encode(truncationNotice(maxTokens, ids.length)).length;
  const kept = Math.max(1, maxTokens - noticeBudget);
  return tokenizer.decode(ids.slice(0, kept)) + truncationNotice(kept, ids.length);
}

// Readability keeps the single densest subtree it scores and discards its
// siblings. On a page built from several large blocks that silently drops most
// of the page — and the tool still reports success, so nothing surfaces it.
// Measured over 474 pages from the scenario prompts, 63 retained under half of
// their <main> text and 35 under a third. The pages it hurts most are the ones
// Canada.ca builds from <details> accordions and link lists: top-task pages,
// sign-in pages, contact pages, funding pages. On the most-cited page in
// production it returned 138 tokens of a sidebar blurb and dropped the H1 and
// the entire funding-programs list.
//
// <main> is already this function's own fallback, so preferring it is a change
// of order rather than a new dependency. Readability still runs for the pages
// that have no usable <main>.
//
// Readability.parse() mutates the document it is given, so it must run last —
// anything read from the DOM after it has been chewed on is unreliable.
export function pickContent(doc) {
  const mainEl = doc.querySelector("main") || doc.querySelector('[role="main"]');

  if (mainEl) {
    const clone = mainEl.cloneNode(true);
    clone.querySelectorAll(MAIN_NOISE_SELECTOR).forEach((node) => node.remove());
    const text = (clone.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length >= MIN_MAIN_TEXT_CHARS) {
      return { html: clone.innerHTML, title: doc.title, source: "main" };
    }
  }

  const article = new Readability(doc).parse();
  if (article?.content) {
    return { html: article.content, title: article.title, source: "readability" };
  }
  return { html: doc.body?.innerHTML || "", title: doc.title, source: "body" };
}

function buildTurndown() {
  // Turndown defaults produce lean Markdown:
  // - Headings/lists kept
  // - Links preserved as [text](url)
  // - Images become ![alt](src)
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });

  // A <summary> labels the block that follows it. Turndown has no rule for it,
  // so it renders inline and dissolves into the first row of the section it
  // titles. That is how the counter-tariff page lost all three of its
  // "Effective <date>" headings, leaving three lists concatenated with no way
  // to tell which one was current.
  td.addRule("summary", {
    filter: "summary",
    replacement: (content) => `\n\n#### ${content.trim()}\n\n`,
  });

  return td;
}

function htmlToLeanMarkdown(html, baseUrl) {
  const dom = new JSDOM(html, { url: baseUrl });
  const { html: contentHTML, title } = pickContent(dom.window.document);

  const td = buildTurndown();
  let md = td.turndown(contentHTML);

  // Prepend the title only when the extracted content did not already carry a
  // heading of its own — taking <main> keeps the page's real <h1>, and adding
  // the document title on top of it just duplicates the line.
  if (title && !/^#\s/m.test(md)) md = `# ${title}\n\n` + md;

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
  const config = {
    httpsAgent,
    maxRedirects: 10,
    timeout: REQUEST_TIMEOUT_MS,
    headers: { "User-Agent": process.env.USER_AGENT || "ai-answers" },
  };
  console.log("User Agent config:", process.env.USER_AGENT);
  console.log("Attempting Request:", {
    method: 'GET',
    url,
    headers: config.headers
  });

  // A single dropped socket used to fail the whole tool call, leaving the agent
  // to answer without ever reading the page. Transient failures get another go;
  // 404s, 403s and the like still fail on the first attempt.
  const res = await retryOnTransientError(() => axios.get(url, config), {
    maxElapsedMs: RETRY_TIME_BUDGET_MS,
    isRetryable: isWorthRetrying,
    onRetry: ({ error, attempt, attempts }) => {
      console.warn(
        `Read web page attempt ${attempt}/${attempts} failed with a transient error, retrying: ${url}`,
        error.code || error.message
      );
    },
  });
  return {
    markdown: htmlToLeanMarkdown(res.data, url),
    res
  };
}

const downloadWebPageTool = tool(
  async ({ url }) => {
    // Normalized outside the try below so a bad URL is not reported as a
    // network failure — an http:// URL never reaches the network at all in the
    // deployed VPC. See api/util/normalizeFetchUrl.js.
    url = normalizeFetchUrl(url);

    let markdown;
    try {
      const result = await downloadWebPage(url);
      markdown = result.markdown;

      // Successfully received response
      console.log("Read web page - Status:", result.res.status);
    } catch (error) {
      const req = error.request || error.response?.request;
      // Fallback to config if request object is incomplete (common in timeouts/network errors)
      const config = error.config || {};

      console.log("Read web page (Failed):", {
        method: req?.method || config.method?.toUpperCase() || 'UNKNOWN',
        path: req?.path || config.url || 'UNKNOWN',
        headers: (typeof req?.getHeaders === 'function' ? req.getHeaders() : null) || config.headers || 'N/A'
      });

      console.error(`Read web page (Failed): ${url}:`, {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data
      });

      if (error.code === "ECONNREFUSED") throw new Error(`Connection refused: ${url}`);
      if (error.response?.status === 403) throw new Error(`Access forbidden (403): ${url}`);
      if (error.response?.status === 404) throw new Error(`Page not found (404): ${url}`);
      if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED")
        throw new Error(`Request timed out: ${url}`);
      throw new Error(`Failed to download webpage: ${url} - ${error.message}`);
    }

    // Thrown outside the catch above so it is not re-wrapped as a network error.
    if (markdown.trim().length < MIN_CONTENT_CHARS) {
      console.log("Read web page (No content):", url);
      throw new Error(
        `No readable content at ${url}. The page returned HTTP 200 but renders its ` +
        `content with JavaScript, which this tool cannot execute. The URL is valid ` +
        `and may still be cited, but you did NOT read it — do not state any facts ` +
        `from this page, and do not retry it.`
      );
    }

    return markdown;
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
