import { tool } from "@langchain/core/tools";
import axios from "axios";

const CKAN_BASE = "https://open.canada.ca/data/api/3/action";
const DEFAULT_ROWS = 5;
const MAX_ROWS = 20;
const DESCRIPTION_CHAR_LIMIT = 300;
const REQUEST_TIMEOUT_MS = 15000;

function pickLocalized(field, lang) {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object") {
    const preferred = lang === "fr" ? field.fr : field.en;
    return preferred || field.en || field.fr || "";
  }
  return "";
}

function formatDataset(ds, lang) {
  const titleEn = pickLocalized(ds.title_translated, "en") || ds.title || ds.name || "Untitled dataset";
  const titleFr = pickLocalized(ds.title_translated, "fr");
  const notes = pickLocalized(ds.notes_translated, lang) || ds.notes || "";
  const org = pickLocalized(ds.organization?.title_translated, lang) || ds.organization?.title || "Unknown";
  const formats = [...new Set(
    (ds.resources || []).map((r) => r.format).filter(Boolean)
  )].join(", ");
  const slug = ds.name || ds.id;
  const url = `https://open.canada.ca/data/en/dataset/${slug}`;
  const urlFr = `https://open.canada.ca/data/fr/dataset/${slug}`;
  const modified = typeof ds.metadata_modified === "string"
    ? ds.metadata_modified.slice(0, 10)
    : "unknown";

  const truncated = notes.length > DESCRIPTION_CHAR_LIMIT
    ? `${notes.slice(0, DESCRIPTION_CHAR_LIMIT)}…`
    : notes;

  return [
    `**${titleEn}**${titleFr && titleFr !== titleEn ? ` / ${titleFr}` : ""}`,
    `Organization: ${org}`,
    `Description: ${truncated || "N/A"}`,
    `Formats: ${formats || "N/A"}`,
    `Last updated: ${modified}`,
    `EN: ${url}`,
    `FR: ${urlFr}`,
  ].join("\n");
}

const searchOpenDataTool = tool(
  async ({ query, rows, lang }) => {
    const requestedRows = Math.min(
      Math.max(Number(rows) || DEFAULT_ROWS, 1),
      MAX_ROWS,
    );
    const language = lang === "fr" ? "fr" : "en";

    try {
      const response = await axios.get(`${CKAN_BASE}/package_search`, {
        params: { q: query, rows: requestedRows },
        timeout: REQUEST_TIMEOUT_MS,
        headers: { "User-Agent": process.env.USER_AGENT || "ai-answers" },
      });

      const results = response.data?.result?.results || [];
      if (!results.length) {
        return `No datasets found on open.canada.ca for query: ${query}`;
      }

      return results.map((ds) => formatDataset(ds, language)).join("\n---\n");
    } catch (error) {
      console.error(`searchOpenData failed for query "${query}":`, {
        message: error.message,
        code: error.code,
        status: error.response?.status,
      });
      return `Open data portal search failed for "${query}". Direct the user to https://search.open.canada.ca/opendata/ (EN) or https://rechercher.ouvert.canada.ca/donneesouvertes/ (FR).`;
    }
  },
  {
    name: "searchOpenData",
    description:
      "Search Canada's Open Government data portal (open.canada.ca) for datasets by keyword. " +
      "Returns dataset summaries with title, description, organization, formats, and EN/FR dataset page URLs. " +
      "Use when a user asks about available government datasets, open data, or wants to find specific data published by federal departments. " +
      "Do NOT use to retrieve or query data inside a dataset — direct users to the dataset page URL for that.",
    schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keywords for finding datasets",
        },
        rows: {
          type: "number",
          description: `Number of results to return (default ${DEFAULT_ROWS}, max ${MAX_ROWS})`,
        },
        lang: {
          type: "string",
          description: "Preferred language for descriptions: 'en' or 'fr' (default 'en')",
        },
      },
      required: ["query"],
    },
  },
);

export default searchOpenDataTool;
