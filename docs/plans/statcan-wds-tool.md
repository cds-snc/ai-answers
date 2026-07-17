# Statistics Canada WDS Tool — Pilot Plan

Add a `getStatCanData` LangChain tool so the answer agent can fetch current Statistics Canada indicators (CPI, unemployment, population, etc.) on demand. The Web Data Service (WDS) at `https://www150.statcan.gc.ca/t1/wds/rest/` is open (no auth, no documented rate limit), but it has no natural-language layer — callers must already know the **vector ID** for the series they want. To bridge that, this pilot ships a curated JSON catalogue of the top ~50 high-traffic indicators with EN/FR aliases, and the tool resolves a free-text topic to the right vector before calling WDS.

Source page: https://www.statcan.gc.ca/en/developers/wds

## Background

- WDS is a public REST API exposing 15 methods over StatsCan's data warehouse. Of those, only the **data retrieval** methods are useful as live agent tools — discovery/change/bulk-download methods are offline tooling for building catalogues.
- Vector IDs (e.g. `v41690973` = CPI all-items Canada, monthly) are stable identifiers for a specific time series within a cube/table. The model cannot guess them; they must be looked up.
- Without a catalogue, the model would either hallucinate vector IDs or refuse to answer. With a 50-entry catalogue covering the most common public/government questions, the tool can answer the long tail of "what's the current X" and "what was X in year Y" questions.
- AI Answers already has a `context-statcan/statcan-scenarios.js` scenario file (currently focused on HS/NAICS code lookups). This tool extends StatsCan coverage from classification codes to actual statistics.

## Scope — Pilot (Latest N values for curated indicators)

**In scope:**
- One tool: `getStatCanData` wrapping `getDataFromVectorsAndLatestNPeriods`.
- Curated JSON catalogue (~50 entries) of high-traffic indicators with EN/FR topic aliases, vector ID, units, frequency, and source-table PID.
- Fuzzy topic match: agent passes a free-text topic ("unemployment rate Ontario"), tool resolves to vector ID via the catalogue.
- Bilingual output (units, frequency, source-table link) matching detected language.
- Scenario instructions telling the agent when to use the tool and when to fall back to citing the source table.

**Out of scope (future phases):**
- Date-range queries (`getDataFromVectorByReferencePeriodRange`) — phase 2.
- Cube/coordinate-based queries (`getDataFromCubePidCoordAndLatestNPeriods`) — would need a coordinate-construction layer.
- Bulk downloads, change feeds, full-table CSV/SDMX.
- Auto-expanding the catalogue from user questions (could be a future feedback loop).
- In-tool charting or trend analysis — return numbers; the agent answers.

## Architecture

### New tool: `agents/tools/getStatCanData.js`

A LangChain tool that:
1. Accepts `{ topic: string, lang?: 'en'|'fr', latestN?: number }`.
2. Resolves `topic` against the catalogue (exact match on `id`, else case-insensitive substring match against `aliases.en` / `aliases.fr`).
3. Returns a "no match — direct user to source table" message if nothing matches confidently.
4. Calls `POST https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods` with `[{ vectorId, latestPeriods }]`.
5. Formats response as: indicator name (EN/FR), latest value with units, reference period, frequency, source-table URL (EN/FR).

```js
// Sketch — follows existing searchOpenData.js pattern
import { tool } from "@langchain/core/tools";
import axios from "axios";
import catalogue from "../prompts/scenarios/context-statcan/statcanVectorCatalogue.json" assert { type: "json" };

const WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest";
const DEFAULT_PERIODS = 1;
const MAX_PERIODS = 12;
const REQUEST_TIMEOUT_MS = 15000;

function resolveTopic(topic) {
  const q = topic.trim().toLowerCase();
  // Exact id match
  const byId = catalogue.find((e) => e.id === q);
  if (byId) return byId;
  // Alias substring match (EN + FR)
  return catalogue.find((e) =>
    [...(e.aliases?.en || []), ...(e.aliases?.fr || [])]
      .some((a) => a.toLowerCase().includes(q) || q.includes(a.toLowerCase()))
  );
}

const getStatCanDataTool = tool(
  async ({ topic, lang, latestN }) => {
    const language = lang === "fr" ? "fr" : "en";
    const entry = resolveTopic(topic);
    if (!entry) {
      return `No matching indicator in catalogue for "${topic}". Direct the user to https://www150.statcan.gc.ca/n1/en/type/data (EN) or https://www150.statcan.gc.ca/n1/fr/type/donnees (FR).`;
    }
    const periods = Math.min(Math.max(Number(latestN) || DEFAULT_PERIODS, 1), MAX_PERIODS);

    try {
      const response = await axios.post(
        `${WDS_BASE}/getDataFromVectorsAndLatestNPeriods`,
        [{ vectorId: entry.vectorId, latestN: periods }],
        { timeout: REQUEST_TIMEOUT_MS, headers: { "User-Agent": process.env.USER_AGENT || "ai-answers" } },
      );
      // WDS returns [{ status, object: { vectorDataPoint: [...] } }]
      const points = response.data?.[0]?.object?.vectorDataPoint || [];
      if (!points.length) {
        return `No data returned by StatsCan for ${entry.name[language]} (vector ${entry.vectorId}).`;
      }
      const lines = points.map((p) =>
        `${p.refPer}: ${p.value} ${entry.units[language]}`,
      );
      const pidUrl = entry.pid
        ? `https://www150.statcan.gc.ca/t1/tbl1/${language}/tv.action?pid=${entry.pid}`
        : "";
      return [
        `**${entry.name[language]}** (vector ${entry.vectorId})`,
        `Frequency: ${entry.frequency[language]}`,
        ...lines,
        pidUrl ? `Source table: ${pidUrl}` : "",
      ].filter(Boolean).join("\n");
    } catch (error) {
      console.error(`getStatCanData failed for topic "${topic}" / vector ${entry.vectorId}:`, {
        message: error.message,
        code: error.code,
        status: error.response?.status,
      });
      return `Statistics Canada WDS lookup failed for "${entry.name[language]}". Direct the user to the source table: https://www150.statcan.gc.ca/t1/tbl1/${language}/tv.action?pid=${entry.pid}`;
    }
  },
  {
    name: "getStatCanData",
    description:
      "Get the latest value(s) for a Statistics Canada indicator (CPI, unemployment, population, GDP, etc.). " +
      "Pass a plain-language topic; the tool resolves it against a curated catalogue of ~50 high-traffic indicators. " +
      "Returns the latest value(s) with units, reference period, frequency, and source-table URL. " +
      "Use for 'what is X right now' or 'recent X' questions. Do NOT use for arbitrary years (no date-range support yet) or for indicators outside the catalogue — direct users to the source table in that case.",
    schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Plain-language indicator name (EN or FR), e.g. 'unemployment rate Ontario', 'IPC Canada', 'population Quebec'" },
        lang: { type: "string", description: "'en' or 'fr' for output language (default 'en')" },
        latestN: { type: "number", description: `Number of most recent periods to return (default ${DEFAULT_PERIODS}, max ${MAX_PERIODS})` },
      },
      required: ["topic"],
    },
  },
);

export default getStatCanDataTool;
```

### New file: `agents/prompts/scenarios/context-statcan/statcanVectorCatalogue.json`

The catalogue lives **with the StatsCan scenario**, not with the tool. Rationale: the prompt guidance that tells the agent when to call the tool only loads when the context node matches to StatsCan, so the catalogue is conceptually tied to that scenario. This is a slight departure from convention (scenario folders normally hold `.js` prompt files only) but keeps related artefacts together.

Schema for each entry:

```json
{
  "id": "cpi-canada-monthly",
  "vectorId": "v41690973",
  "pid": "1810000401",
  "name": { "en": "Consumer Price Index, all-items, Canada", "fr": "Indice des prix à la consommation, ensemble, Canada" },
  "units": { "en": "index (2002=100)", "fr": "indice (2002=100)" },
  "frequency": { "en": "monthly", "fr": "mensuel" },
  "aliases": {
    "en": ["CPI", "consumer price index", "inflation Canada", "cost of living Canada"],
    "fr": ["IPC", "indice des prix à la consommation", "inflation Canada", "coût de la vie"]
  }
}
```

Proposed top-50 composition (categories + counts, summing to 50):

| Category | Count | Examples |
|----------|------:|----------|
| CPI — national + 10 provinces (all-items, monthly) | 11 | Canada, ON, QC, BC, AB, SK, MB, NS, NB, NL, PE |
| Unemployment rate — national + 10 provinces (monthly, SA) | 11 | LFS table 14-10-0287-01 |
| Employment level — national + 10 provinces | 11 | LFS table 14-10-0287-01 |
| Population — national + 10 provinces + 3 territories | 14 | Quarterly population estimates, 17-10-0009-01 |
| GDP — monthly, Canada (chained 2017 $) | 1 | 36-10-0434-01 |
| Merchandise trade balance — Canada, monthly | 1 | 12-10-0011-01 |
| Housing starts — Canada, monthly | 1 | 34-10-0143-01 |
| **Total** | **50** | |

This is a *proposed* allocation — final picks should be verified by querying `getCubeMetadata` for each table to confirm the exact vector ID for each geography/series combination. The catalogue can shift (e.g. swap one province-level employment vector for an all-items food CPI) without changing the tool code.

### Key design decisions

1. **Catalogue and prompt guidance live with the StatsCan scenario, not globally.** Any question that should trigger this tool reliably maps to StatsCan in the context step, so it's wasteful to surface the guidance in `scenarios-all.js` (every department call would pay the tokens). The tool itself is still registered globally in `AgentFactory` — what's scoped is *when the agent is told to use it*.
2. **Catalogue not inlined in the prompt.** Putting 50 entries in `statcan-scenarios.js` would burn ~3–5k tokens whenever StatsCan scenario loads. The agent passes a free-text topic; the tool does the fuzzy match against the JSON. Per [[feedback_agenticbase_tools_terse]], even conditional scenarios benefit from keeping detail out of the prompt when possible.
3. **One tool, one method.** `getDataFromVectorsAndLatestNPeriods` covers the bulk of "current value" questions. Adding `getDataFromVectorByReferencePeriodRange` doubles the surface; defer until the pilot demonstrates demand for historical queries.
4. **No coordinate-based access.** Cube coordinates (`[1,1,1,0,0,0,0,0,0,0]`-style arrays) are powerful but error-prone for an LLM to construct. The catalogue pins us to vectors, which are unambiguous.
5. **Graceful fallback to source-table URL.** Both "no catalogue match" and "WDS API error" return a citation to the source table on `www150.statcan.gc.ca`, so the agent can still give the user a useful next step.
6. **Catalogue is server-side only.** Lives under `agents/prompts/scenarios/context-statcan/` — never imported by `src/`, so the React build restriction doesn't apply.

## Changes Required

### 1. New file: `agents/tools/getStatCanData.js`
Tool implementation as sketched above.

### 2. New file: `agents/prompts/scenarios/context-statcan/statcanVectorCatalogue.json`
~50 entries following the schema above. See **Catalogue Sourcing** section below for how to actually pick the vector IDs.

### 3. Register tool in `agents/AgentFactory.js`

Add alongside the existing tools (mirror the `searchOpenDataTool` line at ~line 7 and ~line 35):

```js
import getStatCanDataTool from './tools/getStatCanData.js';

// In createTools():
return {
  tools: [
    wrapToolWithCallbacks(downloadWebPageTool),
    wrapToolWithCallbacks(checkUrlStatusTool),
    wrapToolWithCallbacks(searchOpenDataTool),
    wrapToolWithCallbacks(getStatCanDataTool),  // new
  ],
  callbacks
};
```

### 4. Update `agents/ToolTrackingHandler.js`

Mirror the `searchOpenData` status branch. In `handleToolStart`:

```js
if (toolName === 'getStatCanData') {
  this._emitStatus('fetchingStatCanData');
}
```

In `handleToolEnd` / `handleToolError`:

```js
if (toolCall.tool === 'getStatCanData') {
  this._emitStatus('generatingAnswer');
}
```

### 5. Update StatsCan scenario: `agents/prompts/scenarios/context-statcan/statcan-scenarios.js`

This is the **only** place the agent is told about the tool. Add a `### LIVE INDICATOR LOOKUPS` block to `STATCAN_SCENARIOS`:

```
### LIVE INDICATOR LOOKUPS ⚠️ Use getStatCanData tool, do NOT guess vector IDs:
- For current-value questions about CPI/inflation, unemployment rate, employment, population, GDP, merchandise trade balance, or housing starts, call the getStatCanData tool. Pass the topic in plain language (EN or FR) — the tool resolves it to the correct StatsCan vector ID via a curated catalogue of ~50 high-traffic indicators.
- The tool returns the latest published value(s) with units, reference period, frequency, and a source-table URL. Always cite that source-table URL.
- If the tool returns "no matching indicator", do not guess a vector ID and do not fabricate a number — direct the user to https://www150.statcan.gc.ca/n1/en/type/data or https://www150.statcan.gc.ca/n1/fr/type/donnees.
- The tool does NOT support arbitrary historical year queries (e.g. "what was CPI in 1995"). For those, cite the source-table URL and direct the user there.
- For classification codes (HS/NAICS), keep using the DOWNLOAD pattern in the CODES section above — getStatCanData is for time-series indicators only.
```

### 6. Add SSE status keys: `src/locales/en.json` and `src/locales/fr.json`

```json
// en.json
"status.fetchingStatCanData": "Fetching Statistics Canada data..."

// fr.json
"status.fetchingStatCanData": "Récupération des données de Statistique Canada..."
```

### 7. Update answer-agent TOOLS list in `agents/prompts/agenticBase.js`

Add `getStatCanData` to the `### TOOLS` block (~line 182, alongside `searchOpenData`):

```
### TOOLS
Access to:
- downloadWebPage: download page from URL to develop/verify answer.
- checkUrl: check if URL live/valid.
- searchOpenData: search Canada's Open Government data portal (open.canada.ca) for datasets by keyword.
- getStatCanData: get the latest value(s) of a Statistics Canada indicator (CPI, unemployment, population, GDP, trade, housing starts) by plain-language topic. Returns value, units, reference period, and source-table citation. Covers ~50 high-traffic indicators.
NO access - NEVER call:
- multi_tool_use.parallel ...
- generateContext
```

Per the existing memory `feedback_agenticbase_tools_terse.md`: keep this entry tight — agenticBase ships on every call. This one-liner is the only mention outside the StatsCan scenario; *when* to use the tool is left to `statcan-scenarios.js`.

### 8. Regenerate system prompt documentation

```bash
node scripts/generate-system-prompt-documentation.js
```

Required because `agenticBase.js` and `context-statcan/statcan-scenarios.js` change. The doc generator picks up department scenarios as well as always-on files.

## Catalogue Sourcing — How to actually pick the 50 vector IDs

This is the part that takes the most human judgement. The plan above assumes the catalogue exists; here's how to build it:

1. **Start from the StatsCan "Most-viewed tables" list** at https://www150.statcan.gc.ca/n1/pub/71-607-x/71-607-x2024001-eng.htm and the Daily Release archive — these reveal which tables drive public interest.
2. **For each target table (PID)**, call `getCubeMetadata` once (offline, via curl) to enumerate its series:
   ```bash
   curl -X POST https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata \
     -H "Content-Type: application/json" \
     -d '[{"productId": 1810000401}]'
   ```
   The response contains `dimension` (geography, characteristic, etc.) and the list of `vectorId`s for each combination. Pick the vector that matches the indicator + geography you want.
3. **Verify each vector** by calling `getDataFromVectorsAndLatestNPeriods` once with `latestN: 1` to confirm it returns a recent value and that the units match expectations.
4. **Fill in EN/FR names, units, frequency** from `getCubeMetadata`'s bilingual fields — don't translate by hand.
5. **Write 4–8 aliases per entry per language.** Include common abbreviations (CPI, IPC, GDP, PIB), plain-language phrasings ("cost of living", "coût de la vie"), and province names in both forms ("Ontario", "ON"). Aliases drive the fuzzy match — under-specifying them is the most likely cause of false "no match" returns.
6. **Commit the catalogue with a "verified on YYYY-MM-DD" comment** in a sibling `statcanVectorCatalogue.README.md`. Vector IDs are stable but tables do get retired occasionally; we'll want a refresh cadence (e.g. once a year, or when a "no match" rate alarm fires).

Budget: 4–8 hours of focused work for one person to build and verify all 50 entries.

## Testing

### Unit test: `agents/tools/__tests__/getStatCanData.test.js`
- Mock axios. Verify:
  - Exact `id` match resolves correctly.
  - Alias substring match (EN + FR) resolves correctly.
  - No-match case returns the fallback message (does NOT call WDS).
  - WDS success case formats `vectorDataPoint` correctly with units + refPer.
  - WDS error case returns the source-table fallback message.
  - `latestN` is clamped to `[1, 12]`.
  - `lang: 'fr'` returns French names/units.

### Catalogue smoke test
- A small script (not a unit test — too brittle for CI) that iterates the catalogue and calls `getDataFromVectorsAndLatestNPeriods` for each vector with `latestN: 1`. Fails if any vector returns no data, signalling a retired or wrong vector ID. Run manually before each catalogue update.

### Integration test
- Verify the tool is registered in `createTools()` output (mirror existing tests for `searchOpenData`).
- Verify `ToolTrackingHandler` emits `fetchingStatCanData` on start and `generatingAnswer` on end.

### Manual / E2E
- "What is the current unemployment rate in Canada?" → tool resolves to national unemployment vector, returns latest monthly value with source-table cite.
- "Quel est le taux de chômage au Québec?" → FR alias match, FR units, FR source-table URL.
- "What's the population of PEI?" → resolves to PE population vector.
- "What was inflation in 1995?" → tool should return a "no historical range support" message OR the latest CPI value with a suggestion to visit the source table; verify the agent handles this gracefully and cites the table rather than fabricating a 1995 number.
- "Show me CPI for the last 6 months" → `latestN: 6`, returns 6 monthly values.
- Out-of-catalogue: "What's Canada's life expectancy?" → no-match fallback, agent cites the StatsCan portal.

## Future Phases

| Phase | Feature | Notes |
|-------|---------|-------|
| 2 | Date-range tool wrapping `getDataFromVectorByReferencePeriodRange` | Unlocks "what was X in 2015" and trend questions. Same catalogue. |
| 3 | Catalogue expansion to 100–150 entries | Driven by tracked "no match" cases from production logs. Could be partially automated by clustering unmatched topics. |
| 4 | Coordinate-based fallback for in-catalogue tables | When a user asks for a slice not pre-vectorised (e.g. CPI by category × province), construct cube coordinates from `getCubeMetadata`. Higher complexity; requires tighter guardrails. |
| 5 | Refresh job for catalogue verification | Scheduled monthly run of the smoke test; opens an issue if any vector retires. |

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| WDS downtime or latency spike | Tool returns graceful error with source-table citation; 15s timeout prevents hung calls. |
| Vector ID retired by StatsCan | Smoke test catches this before release; production fallback returns the source-table URL so the answer remains useful. |
| Agent calls the tool for indicators outside the catalogue | "No match" path returns a helpful fallback rather than failing. Track miss rate to drive catalogue expansion (phase 3). |
| Agent attempts historical year queries the tool can't answer | Scenario instruction explicitly tells the agent to cite the source table for arbitrary historical questions. Phase 2 lifts this limit. |
| Catalogue gets stale (wrong units, renamed series) | Catalogue includes `verified on` date in the README; phase 5 schedules verification. |
| Token bloat in agenticBase | Tool description kept terse per [[feedback_agenticbase_tools_terse]]. Catalogue stays out of the prompt entirely. |
