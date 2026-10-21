# Plan: Test Coveo passage retrieval as an answer-agent tool

Status: proposed, not started. Access to the Coveo Passage Retrieval (CPR) API comes through
the Canada.ca search API. The Canada.ca search team has confirmed the endpoint, that our
existing search credentials work with it, and how to limit passages to one page (see
[API notes](#api-notes)). Coveo's search engineer has advised on how to use it (see
[Coveo's advice](#coveos-advice)) and answered our questions (see
[Coveo's answers](#coveos-answers)).

## Goal

Find out whether a `retrievePassages` tool lets the answer agent answer with fewer
`downloadWebPage` calls, cutting answer-step latency **without** lowering answer quality or
citation accuracy.

**Trial scope: CRA only.** CRA, IRCC and GAC are scraped into the passage model, but the
trial uses CRA alone to keep testing simple. The tool is offered only when the question is
matched to CRA, and it only returns passages from CRA pages. IRCC and GAC can follow if CRA
works.

## Decision: a tool, not passages in search results

Earlier drafts also tested appending passages to `<searchResults>` at the search step. After
discussion with the engineer, that variant is dropped. The plan now tests one thing: a
passage tool the answer agent calls when it needs it, next to `downloadWebPage`. This matches
Coveo's advice (passages are an addition to search, called *when required*, as an agent tool).

The tool matches how the agent already works. It reads search results, then decides which
pages to download. A passage tool gives it a cheaper middle step, in two modes:

| Mode | Input | Replaces |
|---|---|---|
| **Page passages** | A question **and** a URL (e.g. a page from `<searchResults>`) | Downloading that page to find the relevant part |
| **Open passages** | A question only | Guessing which page to download; returns passages from several CRA pages at once |

Page mode is the main bet. Today the agent downloads a whole page to read one section of it.
Page mode returns just the passages from that page that match the question.

Dropping the search-step variant also removes its problems: no join by URL to our top 5, no
extra tokens in the context agent, and no doubled Coveo call on every question.

## Approach in one paragraph

Build the passage client first and exercise it from an admin test page against real
questions and URLs, until every part of the request is known to work. Then wrap that same client as a
LangChain tool, offered only in an experimental batch arm and only for CRA questions. A
short prompt block, loaded only with the tool, tells the model when a passage is enough to
skip a download. Compare against a production baseline on the same dataset.

**Where it runs:** everything, the test page and the tool, runs only in the PR's preview
deployment, never merged to production during the trial. Previews already have the Canada.ca
search key (standard search works there), and the passages endpoint is reachable from outside
the GC VPN (a request without credentials returns `401`, not a timeout).

### Why not a new workflow

- `services/experimental/ExperimentalBatchService.js` already passes batch config
  (`searchProvider`) into the graph, so a tool flag can travel the same way.
- The variant changes no graph nodes. It adds a tool to the answer agent. A copied graph
  (`DefaultWithVectorGraph.js` is ~400 lines) would drift from production and muddy the
  comparison.

### Why the prompt has to change

`agenticBase.js` Step 3 makes `downloadWebPage` **required** ("read at least 1 page before
answering"). Without a prompt change, the model can't skip the download, and it won't know
the new tool exists or when to use it. The tool must be listed under `### TOOLS`, with a line
on when to use it. Production prompts stay untouched.

### Direct API, not MCP

**Decision: no MCP, for security reasons.** All Coveo calls go directly to the REST API from
our own server code, as standard search does today. This also fits the codebase:

- Our tools are plain LangChain tools in `agents/tools/`, wired in `AgentFactory.createTools`.
  `ToolTrackingHandler` already records every call (`tool`, `duration`) as a `Tool` document,
  which gives us the batch metrics for free.
- The client can reuse `canadaCaContextSearch.js`'s retry wrapper and secret masking.

We keep our own `downloadWebPage` rather than Coveo's "fetch", because it reads the **live**
page (see risk 2). We keep our own search step, because the context node depends on it.

## API notes

### Confirmed by the Canada.ca search team

- **Endpoint:** `POST https://employmentandsocialdevelopmentcanadaproduction3vn562uw.org.coveo.com/rest/search/v3/passages/retrieve`
  — the same Coveo org as standard search.
- **Auth:** our existing bearer token (`CANADA_CA_SEARCH_API_KEY`) works. No new credentials.
- **URL:** no new env var. The client builds the passages URL from `CANADA_CA_SEARCH_URI`
  (same host, path `/rest/search/v3/passages/retrieve`). A new variable would need an SSM
  parameter and a line in `.github/scripts/create-lambda-function.sh` before previews could
  see it. If `CANADA_CA_SEARCH_URI` isn't a `*.org.coveo.com` URL, the client throws a clear
  error rather than calling the wrong place. The test page's first query confirms this.
- **Passages for one page:** add a `filter` on `@clickableuri`. The same call can either
  return all passages from a page or search for passages only within it. Example request
  from the search team:

  ```json
  {
    "query": "how do i appeal a CRA decision?",
    "filter": "@clickableuri==\"https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/p148/p148-resolving-your-dispute-objection-appeal-rights-under-income-tax-act.html\"",
    "localization": { "locale": "en", "timezone": "America/Montreal" },
    "context": {
      "customContext": "globalSemantic",
      "searchPageUrl": "https://www.canada.ca/en/revenue-agency/search.html",
      "searchPageRelativeUrl": "/en/revenue-agency/search.html"
    },
    "pipeline": "Canada public websites - Generic - customContext",
    "searchhub": "canada-gouv-public-websites",
    "locale": "en",
    "additionalFields": ["clickableuri"],
    "maxPassages": 20
  }
  ```

  For open mode, drop `filter` (or replace it with a filter limiting results to CRA pages;
  see open question 3).

- **Fields:** every indexed URL has fields such as `dateissued`, `datemodified`, `title` and
  `author`. Any of them can come back through `additionalFields`.

**`customContext: 'globalSemantic'` is required.** It turns on the Semantic Encoder, which
passage retrieval needs. Every call must send it. Start from the example body as-is and
change one thing at a time.

### Differences between the two examples we've been given

The first example (from before the URL question) and the one above differ. The test page's
raw mode should pin down which settings matter:

| | First example | URL-filter example |
|---|---|---|
| `pipeline` | not set | `Canada public websites - Generic - customContext` |
| Locale | `localization.locale: 'en-CA'` | `localization.locale: 'en'` and top-level `locale: 'en'` |
| Search page | `/en/sr/srb.html` (Canada.ca search) | `/en/revenue-agency/search.html` (CRA search) |
| Search hub key | `searchHub` | `searchhub` (lowercase) |
| `maxPassages` | 5 | 20 |

Questions for the test page: does it matter whether we send the CRA search page or the
Canada.ca one? Is `searchhub` vs `searchHub` just case-insensitive? Is the named pipeline
required?

### From Coveo docs (not yet confirmed for our org)

- Body accepts `filter` (advanced query expression), `maxPassages` 1–20, up to 20
  `additionalFields` (`primaryid` always returned), and `pipeline`.
- Response is a list of passages sorted by relevance, each with text, score and the source
  document's fields. Response size is capped at 540 KB.
- Docs list languages other than English as **beta**. Coveo says many customers use them in
  production (see [Coveo's answers](#coveos-answers)).

Docs: [Use the Passage Retrieval API](https://docs.coveo.com/en/o86c8334/),
[Passages V3 reference](https://docs.coveo.com/en/13/api-reference/search-api#tag/Passages-V3),
[About CPR](https://docs.coveo.com/en/oaie5277/),
[CPR implementation overview](https://docs.coveo.com/en/oaoe7068/).

## Phase 1 — Passage client and admin test page

Everything in this phase runs in the PR's preview deployment, through the browser. No local
setup. The client is built first, as the module the tool will later wrap, so the test page
exercises the real code path and nothing is rewritten when it becomes a tool.

### 1a. Client: `agents/tools/canadaCaPassages.js`

- `retrievePassages({ query, url, lang, maxPassages })`. Builds the confirmed request body.
  With `url`, adds the `@clickableuri==` filter.
- **Scope check.** A `url`, if given, must be a CRA page (`canada.ca/en/revenue-agency/…` or
  `canada.ca/fr/agence-revenu/…`; exact prefixes are open question 4). Any other URL returns
  a clear "not available" result, with no call made.
- Uses the CRA search page context (`searchPageUrl`, `searchPageRelativeUrl`) for the
  language, as in the example.
- Returns passages with text, score, `clickableuri`, `title` and `datemodified`, plus the
  request body sent, the HTTP status and the latency (the test page shows these).
- Explicit `AbortSignal.timeout`. On failure or timeout, returns an empty result with a
  reason. Never throws into the agent.
- Masks the bearer token in logs, as `canadaCaContextSearch.js` does.
- Tests (vitest, mocked fetch): request body for page mode and open mode, `globalSemantic`
  always present, scope check rejects non-CRA URLs, failure and timeout return an empty
  result.

### 1b. Admin endpoint: `api/util/util-passages-test.js`

- `POST`, admin only: `withProtection(handler, authMiddleware, adminMiddleware)`, as
  `util-connectivity.js` does. Registered in `server/server.js`.
- Two modes:
  - **Client mode** (`{ query, url, lang, maxPassages }`): calls `retrievePassages`. This is
    what the tool will do.
  - **Raw mode** (`{ body }`): sends an edited request body as-is, with our auth added on the
    server. This is for trying the open settings one at a time (pipeline, search page,
    locale, `searchhub` spelling, French) without a redeploy per change. Whatever works gets
    built into the client.
- The key never leaves the server. The response returns the body sent, status, latency and
  the passages (or Coveo's error body).
- Validate inputs strictly (string query, optional string URL, `maxPassages` 1–20, `body` a plain object), and fail with `400` otherwise.

### 1c. Admin page: "Passage retrieval test"

A small admin page under the experimental section (route `experimental-passages`, e.g.
`experimental/passages` in both languages — "passages" is also the French word), linked from
the admin page's experimental list. Layered as usual: service → hook → page.

1. **Single query.** A form with question, optional CRA URL, language and `maxPassages`.
   "Send" runs client mode. The result shows the request body sent, status, latency, and
   each passage: score, URL, title, `datemodified`, text length and text.
   **Edit request** copies the body into a JSON text area; "Send raw" runs raw mode. This
   is how we get each piece of the API working: the example body first, then one change at
   a time (the questions in
   [Differences](#differences-between-the-two-examples-weve-been-given), French, open mode).
2. **Probe run.** Upload a CSV in the same format as our existing batch input exports
   (e.g. `CRA-T2 EN Golden.csv`): `chatId, createdAt, referringUrl, question, citationUrl,
   answer`, UTF-8 with a BOM. The page uses `question` as the query and `citationUrl` as the
   page-mode URL, and carries `answer` through to the results so passages can be judged
   against it. There's no language column, so the language is picked on the page for the
   whole file. Leading batch numbering (`01. `) is stripped from the question before sending,
   because CPR uses the query as sent. Each row runs in both page mode and open mode.
   The browser sends one call at a time, at most 2 per second (Coveo's limit is 5 QPS,
   possibly shared with production; see risk 6), and shows progress. "Download results"
   saves JSON and CSV with every row's question, golden answer, passages, status and
   latency. Running the loop in the browser keeps each request short, well under the
   preview Lambda's 300-second timeout.

Admin page conventions still apply: EN/FR locale keys, the labelled "back to admin" `<nav>`,
`StatusMessage` for errors and progress (never a raw `err.message`), sentence case.

The page exists for the trial. Whether it stays if the tool ever ships is a later decision.

### 1d. What the probe measures

Inputs for the probe run: start with `CRA-T2 EN Golden.csv` (14 golden CRA questions, all
citing `canada.ca/en/revenue-agency` pages), then a larger chat export of ~150 recent CRA
questions in the same format. English first; ~30 French once French single queries work.
Answer rate is judged by reading the downloaded passages against each row's answer.

| Measure | Question it answers |
|---|---|
| **Page-mode answer rate**: for the golden questions, do the passages from the cited URL hold **enough** to answer without downloading the page? | Can page mode replace a download? (Coveo is clear passages are nearby text, not answers.) |
| **Open-mode answer rate**: same questions, no URL. The results flag whether any passage came from the row's `citationUrl` | Does open mode find the right page on its own? |
| **Coverage**: share of cited URLs that return ≥ 1 passage | Are the pages we cite actually in the passage model? |
| **Latency**: p50/p95 per call, both modes | Is a passage call clearly cheaper than a download? |
| **Size**: tokens per response at `maxPassages` 5, 10 and 20, vs a typical `downloadWebPage` result | Token cost, and a sensible default `maxPassages` |
| **Freshness**: `datemodified` on passage pages vs the live page | How stale can a passage be? (Feeds risk 2.) |
| **Tables and format**: spot-check pages with rate/amount tables; note Markdown vs plain text | Does chunking keep rows and headers together? |
| **French**: same scoring on French questions | Is French (beta) good enough to include in the experiment? |

**Stop here** if passages rarely contain the answer. Share the results with Coveo before
tuning; the pipeline settings (passage count, thesaurus, Semantic Encoder threshold/boost/item
count) are theirs to change.

## Phase 2 — `retrievePassages` tool

1. **Tool.** `agents/tools/retrievePassages.js`: a LangChain tool wrapping the Phase 1 client.
   Inputs: `query` (a focused question in the user's words) and optional `url`. The schema
   description says the URL must be a CRA page.
2. **Gating, two layers:**
   - **Offered only for CRA questions.** The answer agent is created per request in
     `AnswerGenerationService` (via `createChatAgent`), after the context node has matched a
     department. Add the tool to `AgentFactory.createTools` only when the batch flag (e.g.
     `batch.config.passageTool`) is on **and** the department is `CRA-ARC` (the abbrKey in
     `departments_EN.js`). Every other question, and all production traffic, gets today's
     tools.
   - **Scope check in the client.** If the agent passes a non-CRA URL, the tool says
     passages aren't available for that page and to use `downloadWebPage`.
3. **Plumbing.** Pass the flag the same way `searchProvider` travels from the batch config
   to the graph, then through `sendAnswerRequest` → `AnswerGenerationService.generateAnswer`
   → `createChatAgent`/`createTools`. When changing that payload, carry every existing field
   through (see AGENTS.md on dropped prompt tags).
4. **Tracking.** Wrap it with `ToolTrackingHandler` like the other tools, so calls and
   durations land in `Tool` documents.
5. **Tests.** Tool present only with flag on and department `CRA-ARC`; absent otherwise;
   non-CRA URL returns the readable "not available" result; failure returns an empty
   result the model can read, not an exception.

Search stays on `canadaca`, so the tool is the only thing that changes.

## Phase 3 — Prompt variant (maintainers only)

Per AGENTS.md, this is a prompt change and needs a maintainer (Lisa Fast or Ryan Hyma) to
write and approve it.

- **Plumbing (code):** pass the same flag-and-department decision into
  `buildAnswerSystemPrompt` options, so the block loads exactly when the tool is offered.
  Test that it never appears without the tool, or in production.
- **Prompt (maintainers):** a short block, kept terse because it ships on every call in the
  arm. Draft direction to tune: list `retrievePassages` under `### TOOLS`. Before downloading
  a page from `<searchResults>`, ask for its passages with your question. If a passage
  directly states the answer, cite that page without downloading it. Download when the
  passage is partial or conditional, or when the answer depends on eligibility, amounts or
  dates.
- Decide whether Step 3's "REQUIRED" wording needs a matching exception, or whether the
  variant block is enough to override it. Arm results will show this.
- Regenerate `docs/agents-prompts/system-prompt-documentation.md` if a shared prompt file
  changes.

## Phase 4 — Metrics in batch results

Before running arms, confirm batch items expose, per item:

- the number of `downloadWebPage` and `retrievePassages` calls (from the linked `Tool`
  documents, which already record `tool` and `duration`), and page vs open mode
- answer-step duration and total duration
- whether the tool was offered (flag on and department `CRA-ARC`)
- the share of answers given with **zero** page downloads

If any of these aren't on the batch results / analysis pages, add them there, not in a
one-off script, so later runs reuse them.

## Phase 5 — Experiment

Use the same dataset for both arms: about 150 CRA questions with reference answers, English (plus French if Phase 1 shows it works). Run 2–3 trials per arm to smooth
out model nondeterminism.

| Arm | Passage tool | Prompt | What it tells us |
|---|---|---|---|
| Baseline | off | production | Reference point |
| Tool | on (CRA only) | tool variant | Does the tool cut downloads without hurting quality? |

Compare: downloads per answer, passage calls per answer (by mode), answer-step and total
latency (p50/p95), expert score (`ExpertScorerAnalyzer` against reference answers), citation
accuracy, and zero-download rate.

### Success criteria (agree before running)

The tool arm passes if, compared with the baseline:

- median `downloadWebPage` calls per answer drop by ≥ 1
- p50 total latency drops by ≥ _N_ seconds (set _N_ after Phase 1). Passage-call time counts
  against the savings.
- expert score and citation accuracy do not drop
- no rise in confident-but-incomplete answers (see risk 3); review a sample by hand

## Risks

1. **Narrow scope.** The trial covers CRA only, so a win here says nothing yet about other
   content. IRCC and GAC are already in the passage model and are the natural next step;
   beyond them, Coveo would need to scrape more sites.
2. **Freshness.** `downloadWebPage` exists to verify the **live** page. A passage is two steps
   behind it: the page must be re-crawled, **and then** the passage model must be rebuilt
   (daily at best, per Coveo). Skipping downloads is only safe if that's acceptable for
   fast-changing content (rates, deadlines, closures). Showing `datemodified` helps the model
   judge this, but `datemodified` comes from the index and may be newer than the passage text.
3. **Lost context.** A passage can state a rule without the exception two paragraphs later.
   Structure-aware chunking and passage merging should reduce this, but only if our model
   uses them (fixed-size is the default for models created before October 2025). Watch for
   confident but incomplete answers, not just lower scores.
4. **Extra round trips.** The agent may call the passage tool *and* still download, adding
   latency instead of saving it. The Phase 4 metrics will show this.
5. **Pipeline settings aren't ours.** Passage count, thesaurus use and Semantic Encoder
   thresholds live in Coveo's query pipeline. Changes on their side could shift results
   between runs. Record the settings with each batch.
6. **Rate limit.** Coveo allows 5 queries per second, and our key may share that with
   production canada.ca search traffic. The tool adds one call per use. Keep
   `BATCH_CONCURRENCY` at its default (2), run arms one after another, and throttle the
   test page's probe run (≤ 2 calls/second). Watch for 429 responses in batch logs.
7. **French.** Coveo supports French in beta. If Phase 1 shows French doesn't work, the tool
   is English only for the trial, which can't ship as is.

## Coveo's advice

Coveo's search engineer:

- **Passages are an addition to search, not a replacement.** Use the Passage Retrieval API
  alongside the Search API, *when required*.
- **Give the agent tools.** An orchestrating agent can use Coveo "search", "passages" and
  "fetch" as separate tools, and decide when to call each. This plan takes that approach for
  "passages" only.
- **MCP is an option.** Declined, for security reasons.
- **Passage retrieval is its own two-stage retrieval:** a **Semantic Encoder** (vector search
  added to lexical search) finds candidate pages, then the **Passage Retrieval model** picks
  the most relevant passages, with score fusion and passage merging. In page mode the
  `filter` narrows this to one page.
- **Chunking** is structure-aware by default and handles tables well.
- **Tuning lives in the Coveo query pipeline**, not in our request: number of passages,
  thesaurus terms, Semantic Encoder threshold, boost and item count.

Further reading:
[Associate a CPR model with a query pipeline — advanced configuration](https://docs.coveo.com/en/oaie6403/leverage-machine-learning/associate-a-passage-retrieval-cpr-model-with-a-query-pipeline#cpr-model-association-advanced-configuration),
[Chunking strategy — structure-aware chunking](https://docs.coveo.com/en/p9ub0044/leverage-machine-learning/chunking-strategy#structure-aware-chunking).

### What Coveo's docs add

- The pipeline must have **both** a CPR model and a Semantic Encoder model associated.
- **Stop-word rules are never applied** to the CPR query. **Thesaurus rules are off by
  default**; with them off, CPR uses the query **as sent**. So the query text the agent writes
  matters, which is why the tool asks for a focused question in the user's words.
- **Structure-aware chunking is the default only for CPR models created after October 2025.**
  Older models default to fixed-size (250 words, no passage merging). The active strategy is
  in the model JSON (`extraConfig.chunkerConfig.strategy`).
- Structure-aware chunks average **400 tokens** (200–500), follow headings and keep tables,
  lists and sections together where possible.
- Chunks are built from a **Markdown** version of pages when one exists. Pages indexed before
  Markdown streams existed don't have one until their source is rebuilt.
- Each page is embedded up to **1,000 chunks**. Text past that can't be retrieved.

## Coveo's answers

| Question | Answer | What it means for the plan |
|---|---|---|
| Is CPR English-only? | Other languages are "beta", but many customers run them in production. | Phase 1 tests French. |
| Full Canada.ca index or a subset? | Either. For this trial, CRA, IRCC and GAC are scraped. | Tool scope is CRA only, to keep testing simple. |
| How often is the passage model refreshed? | It can be updated daily. | Passages can be about a day behind the crawl (risk 2). |
| Latency and rate limits? | Similar to the Search API. **5 queries per second**. | Throttle the probe run; keep batch concurrency low (risk 6). |
| Can we get passages for one URL? | Yes, with a `filter` on `@clickableuri`: all passages from a page, or a search within it. | This is page mode, the main mode of the tool. |
| Which `additionalFields`? | Any document field. | Settled. |
| How much merging is needed? | The Passages API does passage merging itself. | Nothing for us to build. |
| Are passages answers? | No. They're nearby text and still need a generative model to form an answer. | The question is whether a passage holds **enough** to skip a download. Phase 1 measures this. |

### Still open

1. Does `searchPageUrl` need to be the CRA search page, and what's the French one
   (`/fr/agence-revenu/recherche.html`?)
2. Is the `Canada public websites - Generic - customContext` pipeline required, and what are
   its settings (thesaurus, SE threshold, boost, item count, `numberOfDocumentsToConsider`)?
3. For open mode, what's the right filter to return CRA pages only (IRCC and GAC are in the
   passage model too)?
4. Which CRA URL prefixes exactly are scraped? Only `canada.ca/en/revenue-agency` and
   `canada.ca/fr/agence-revenu`, or also CRA content under `canada.ca/en/services/taxes`?
5. Are our SE and CPR models configured for French?
6. How often is our passage model actually rebuilt?
7. Which chunking strategy does our CPR model use, and do the sources have Markdown streams?
8. Is the 5 QPS limit shared with production canada.ca search traffic on our key?

## Out of scope

- Passages in `<searchResults>` at the search step (dropped; see
  [Decision](#decision-a-tool-not-passages-in-search-results)).
- MCP integration with Coveo.
- Departments other than CRA, including IRCC and GAC (already scraped; a possible next step).
- Changing production tools, prompts or the default search provider.
- Replacing `downloadWebPage` with Coveo's "fetch", or changing its limits.
- Comparing Coveo semantic search against our standard search for the search step itself.
