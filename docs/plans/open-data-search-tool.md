# Open Data Search Tool — Pilot Plan

Add a `searchOpenData` LangChain tool so the answer agent can search and describe datasets from Canada's Open Government portal (`open.canada.ca`) when users ask about government data. Agreed with TBS OpenGov team to start with find-and-describe only (no in-dataset querying). Skipping MCP in favour of a direct CKAN API tool for simplicity.

## Background

- The Open Government portal at `open.canada.ca` exposes the standard **CKAN Action API v3** at `https://open.canada.ca/data/api/3/action/`
- 46,500+ datasets, bilingual metadata (EN/FR titles, notes, keywords), Open Government Licence
- The `tbs-sct-scenarios.js` file already has an `### ATIP & government data` section that directs users to the portal — this tool lets the agent search it directly
- Future phase may add MCP integration or in-dataset SQL querying via DataStore API

## Scope — Pilot (Find & Describe)

**In scope:**
- Search datasets by keyword via `package_search`
- Return structured dataset summaries (title, description, organization, format, date, URL)
- Bilingual results matching the user's detected language
- Scenario instructions telling the agent when to use the tool

**Out of scope (future phases):**
- Querying data within datasets (`datastore_search`, `datastore_search_sql`)
- MCP server integration
- Croissant ML metadata enrichment
- Organization/group browsing tools

## Architecture

### New Tool: `agents/tools/searchOpenData.js`

A LangChain tool that wraps the CKAN `package_search` endpoint.

```js
// Simplified structure — follows existing downloadWebPage.js pattern
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";

const CKAN_BASE = "https://open.canada.ca/data/api/3/action";

const searchOpenData = tool(
  async ({ query, rows }) => {
    const response = await axios.get(`${CKAN_BASE}/package_search`, {
      params: { q: query, rows: rows || 5 },
      timeout: 15000,
    });

    const results = response.data.result.results;
    if (!results.length) return "No datasets found.";

    return results.map(ds => {
      const title = ds.title_translated?.en || ds.title || ds.name;
      const titleFr = ds.title_translated?.fr || "";
      const notes = ds.notes_translated?.en || ds.notes || "";
      const org = ds.organization?.title || "Unknown";
      const formats = [...new Set(
        (ds.resources || []).map(r => r.format).filter(Boolean)
      )].join(", ");
      const url = `https://open.canada.ca/data/en/dataset/${ds.id}`;
      const urlFr = `https://open.canada.ca/data/fr/dataset/${ds.id}`;
      const modified = ds.metadata_modified?.slice(0, 10) || "unknown";

      return [
        `**${title}**${titleFr ? ` / ${titleFr}` : ""}`,
        `Organization: ${org}`,
        `Description: ${notes.slice(0, 300)}`,
        `Formats: ${formats || "N/A"}`,
        `Last updated: ${modified}`,
        `EN: ${url}`,
        `FR: ${urlFr}`,
      ].join("\n");
    }).join("\n---\n");
  },
  {
    name: "searchOpenData",
    description:
      "Search Canada's Open Government data portal for datasets. " +
      "Use when a user asks about available government datasets, open data, " +
      "or wants to find specific data published by federal departments.",
    schema: z.object({
      query: z.string().describe("Search keywords for finding datasets"),
      rows: z.number().optional().describe("Number of results to return (default 5, max 20)"),
    }),
  }
);

export default searchOpenData;
```

### Key Design Decisions

1. **Direct API call, not MCP** — Fewer moving parts for the pilot. The CKAN API is public, stable, and well-documented. MCP adds protocol overhead with no benefit when we only need one endpoint.

2. **Bilingual output** — The CKAN API returns `title_translated`, `notes_translated`, and `keywords` with `en`/`fr` keys. The tool includes both language URLs so the agent can cite the appropriate one based on `pageLanguage`.

3. **Token-conscious** — Descriptions clipped to 300 chars, default 5 results. The agent can request up to 20 if needed. Keeps tool output well within budget alongside `downloadWebPage` results.

4. **EN/FR dataset page URLs** — Both provided so the agent can cite the correct language version per `citationInstructions.js` rules.

## Changes Required

### 1. New file: `agents/tools/searchOpenData.js`
Tool implementation as sketched above.

### 2. Register tool in `agents/AgentFactory.js`

Add to the `createTools` function alongside existing tools:

```js
import searchOpenDataTool from './tools/searchOpenData.js';

// In createTools():
return {
  tools: [
    wrapToolWithCallbacks(downloadWebPageTool),
    wrapToolWithCallbacks(checkUrlStatusTool),
    wrapToolWithCallbacks(searchOpenDataTool),  // new
  ],
  callbacks
};
```

### 3. Update `agents/ToolTrackingHandler.js`

Add SSE status event for the new tool so the UI shows a status message while searching:

```js
// In handleToolStart or equivalent:
case 'searchOpenData':
  // emit 'searchingOpenData' status
```

### 4. Add global scenario instruction: `agents/prompts/scenarios/scenarios-all.js`

Add a global rule so the tool is discoverable regardless of which department (or no department) the context node matches. This is important because open data questions often have no TBS signal (e.g., "what datasets are available about immigration?").

```
### Open Government Data
- When the user asks about government datasets, open data, or what data is publicly available, use the searchOpenData tool to search Canada's Open Government portal. Summarize results with title, description, organization, formats, and cite the dataset page URL.
- Do NOT attempt to download or query data within datasets — direct users to the dataset page to access the actual data files.
```

### 5. Update TBS scenario: `agents/prompts/scenarios/context-tbs-sct/tbs-sct-scenarios.js`

Expand the `### ATIP & government data` section with a TBS-specific reinforcement (the global rule handles the general case, this adds context for TBS-matched questions):

```
### ATIP & government data
- Open government portal - search & filter government data https://search.open.canada.ca/opendata/ https://rechercher.ouvert.canada.ca/donneesouvertes/
- When the user asks about specific datasets, what data is available, or wants to find open data published by the government, use the searchOpenData tool to search the Open Government portal. Summarize the top results with title, description, organization, formats, and provide the dataset page URL as citation.
- Do NOT attempt to download or query data within datasets — direct users to the dataset page to access the actual data files.
- Make access to information request ...
```

### 6. Add SSE status message to locales

Add translation keys for the searching status in `src/locales/en.json` and `src/locales/fr.json`:

```json
// en.json
"status.searchingOpenData": "Searching open data portal..."

// fr.json
"status.searchingOpenData": "Recherche dans le portail de données ouvertes..."
```

### 7. Regenerate system prompt documentation

```bash
node scripts/generate-system-prompt-documentation.js
```

Required since `scenarios-all.js` is being changed (it's not a department scenario, so it's included in the generated docs).

## Testing

### Unit test: `searchOpenData.test.js`
- Mock axios to return sample CKAN response
- Verify bilingual title/description extraction
- Verify URL construction for EN/FR
- Verify graceful handling of 0 results, API timeout, malformed response

### Integration test
- Verify the tool is available to the agent (check `createTools()` output)
- Verify `ToolTrackingHandler` emits correct status events

### Manual / E2E
- Ask: "What datasets are available about water quality?"
- Ask: "Est-ce qu'il y a des données ouvertes sur l'immigration?"
- Ask: "Find open data about COVID-19 testing" (should match datasets like the ones visible in the CKAN API test)
- Verify citations point to correct EN/FR dataset pages

## Future Phases

| Phase | Feature | Notes |
|-------|---------|-------|
| 2 | `package_show` tool | Deep-dive into a specific dataset's resources and metadata |
| 3 | `datastore_search` | Query tabular data within datasets — needs token limits and SQL guardrails |
| 4 | MCP integration | Swap direct API calls for MCP client if OpenGov ships a production MCP server |
| 5 | Croissant metadata | Enrich dataset descriptions with ML-friendly schema info if CKAN adopts Croissant |

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| CKAN API rate limits or downtime | Tool returns graceful error message; agent falls back to directing user to portal URL |
| Large result payloads | Capped at 20 results, descriptions clipped to 300 chars |
| Stale or low-quality metadata | Tool shows `last updated` date; agent can note if data is old |
| Tool used for non-TBS questions | Tool is available to all department contexts — this is fine since open.canada.ca is cross-government. Scenario instructions in TBS specifically prompt its use, but other departments' agents can also call it if relevant |
