# Plan: Test Coveo passage retrieval to reduce page downloads in the answer step

Status: proposed, not started. Access to the Coveo Passage Retrieval (CPR) API comes through
the Canada.ca search API. The Canada.ca search team has confirmed the endpoint and that our
existing search credentials work with it (see [API notes](#api-notes)). Coveo's search
engineer has advised on how to use it (see [Coveo's advice](#coveos-advice)) and answered
our questions (see [Coveo's answers](#coveos-answers)).

## Goal

Find out whether giving the answer agent relevant **passages** from Canada.ca pages lets it
answer with fewer `downloadWebPage` calls, cutting answer-step latency **without** lowering
answer quality or citation accuracy.

## Coveo's advice

Coveo's search engineer suggested a different shape from the one this plan first assumed:

- **Passages are an addition to search, not a replacement.** Use the Passage Retrieval API
  alongside the Search API, *when required*.
- **Give the agent tools.** An orchestrating agent can use Coveo "search", "passages" and
  "fetch" as separate tools, and decide when to call each. It can also fetch a page directly
  without Coveo (which is what our `downloadWebPage` does).
- **A/B testing search against passages** would be worthwhile.
- **MCP is an option.** Coveo offered to enable MCP tools on the Canada.ca Coveo org. We
  won't use MCP, for security reasons (see [Direct API, not MCP](#direct-api-not-mcp)).
- **Passage retrieval is its own two-stage retrieval**, not a lookup on pages we already found:
  1. A **Semantic Encoder** (vector search added to lexical search) finds candidate pages,
     improving recall.
  2. The **Passage Retrieval model** picks the most relevant passages from those pages, with
     score fusion and passage merging to improve precision.
- **Chunking** is structure-aware by default and handles tables well. Fixed-size chunking
  exists, but Coveo recommends the default.
- **Tuning lives in the Coveo query pipeline**, not in our request:
  - PR model: number of passages returned, whether to use thesaurus terms.
  - Semantic Encoder: similarity threshold, semantic boost, number of items returned.

Further reading from Coveo:
[Associate a CPR model with a query pipeline — advanced configuration](https://docs.coveo.com/en/oaie6403/leverage-machine-learning/associate-a-passage-retrieval-cpr-model-with-a-query-pipeline#cpr-model-association-advanced-configuration),
[Chunking strategy — structure-aware chunking](https://docs.coveo.com/en/p9ub0044/leverage-machine-learning/chunking-strategy#structure-aware-chunking).

### What Coveo's docs add

**Query pipeline association** (first link):

- The pipeline must have **both** a CPR model and a Semantic Encoder model associated. Model
  associations can carry a pipeline **condition**. `customContext: 'globalSemantic'` is what
  turns on the Semantic Encoder for our trial (confirmed; see
  [API notes](#confirmed-by-the-canadaca-search-team)).
- **`numberOfDocumentsToConsider`** (default 40, range 1–100): how many first-stage items
  the PR model takes passages from. Coveo marks this as advanced, and the default suits most
  cases. Our `maxPassages` (request, 1–20) controls how many passages come back.
- **Stop-word rules are never applied** to the CPR query.
- **Thesaurus rules are off by default.** When on, CPR supports only synonym, one-way synonym
  and replace rules. It applies only the first matching rule, to the first matching term. It
  ignores rules with conditions, and can misbehave on rules containing query syntax
  (`@field=…`) or regex. If Canada.ca's thesaurus has rules like that, turning it on needs
  care.
- With the thesaurus off, CPR uses the raw query **as sent**, with no transformation. So what
  we send matters, which is why Phase 0 compares full questions with rewritten keywords.

**Chunking** (second link):

- **Structure-aware chunking is the default only for CPR models created after October 2025.**
  Older models default to fixed-size (250 words, up to 10% overlap, no passage merging). The
  active strategy is in the model JSON (`extraConfig.chunkerConfig.strategy`). Ask Coveo
  which one ours uses.
- Structure-aware chunks average **400 tokens** (200–500). They follow headings, paragraphs
  and subject shifts, and keep tables, lists and sections in one chunk where possible. There's
  no overlap between chunks.
- **Passage merging** (joining nearby passages from the same page) only works with
  structure-aware chunking.
- Chunks are built from a **Markdown** version of HTML/PDF pages when one exists, and keep
  that formatting. Pages indexed before Markdown streams existed don't have one until their
  source is rebuilt. Without it, chunks are plain text and structure is detected less well.
- Each page is embedded up to **1,000 chunks** (default). Text past that limit can't be
  retrieved.
- Passages come from the **CPR model build**, not the live index. Structure-aware builds can
  take up to 3× longer than fixed-size builds, which can limit how often the model refreshes
  (see risk 2).

### What this changes in the plan

The first draft treated passages as an enrichment of our top-5 search results: call both
APIs, join passages to results by URL, put everything in `<searchResults>`. Coveo's
description shows why that fits poorly. The passage call runs its **own** first-stage
retrieval, so its pages won't necessarily match our top 5. At the default settings, joining
by URL would mostly be appending. (Coveo later confirmed overlap can be tuned; see
[Overlap is configurable](#overlap-is-configurable).)

The plan now tests **two** ways to use passages, and keeps the first draft's approach as one
of them because it needs no new agent tool:

| Approach | What the answer agent sees | Who decides to retrieve passages |
|---|---|---|
| **Passages in search results** | Passages appended inside `<searchResults>`, below the standard top 5 | Always runs, at the search step |
| **Passage tool** (Coveo's suggestion) | A new `retrievePassages` tool, next to `downloadWebPage` | The agent, when it needs more than the search excerpts |

The tool approach matches how the agent already works. It reads search results, then decides
which pages to download. A passage tool gives it a cheaper middle step: ask a focused
question, get the relevant chunks from several pages at once, and download only if the
passage isn't enough.

## Approach in one paragraph

Probe the API first. Then build both variants behind batch-level switches, so experimental
batches can run the production graph with only one thing changed. Each variant gets a short
prompt block, loaded **only** when that variant is active, telling the model when a passage
is enough to skip a download. Compare against a production baseline on the same dataset.

### Why not a new workflow

- `ExperimentalBatchService.js` already passes `batch.config.searchProvider` into the graph,
  and `SearchContextService.performSearch` already routes on it.
- Neither variant changes graph nodes. One changes what goes into `<searchResults>`; the other
  adds a tool to the answer agent. A copied graph (`DefaultWithVectorGraph.js` is ~400 lines)
  would drift from production and muddy the comparison.

### Why the prompt has to change

`agenticBase.js` Step 3 makes `downloadWebPage` **required** ("read at least 1 page before
answering"). With unchanged prompts, the best case is going from 2–3 reads to 1. Getting to
0 reads needs a variant instruction. The tool variant also needs the tool listed under
`### TOOLS`, or the model won't know when to use it. Production prompts stay untouched.

### Direct API, not MCP

**Decision: no MCP, for security reasons.** All Coveo calls go directly to the REST API from
our own server code, as standard search does today. This also fits the codebase:

- Our tools are plain LangChain tools in `agents/tools/`, wired in `AgentFactory.createTools`.
  `ToolTrackingHandler` already records every call (`tool`, `duration`) as a `Tool` document,
  which gives us the batch metrics for free.
- A direct tool reuses `canadaCaContextSearch.js`'s retry wrapper, timeout and secret masking.

We only want Coveo's "passages" capability. We keep our own `downloadWebPage` rather than
Coveo's "fetch", because it reads the **live** page (see risk 2). We keep our own search step,
because the context node depends on it.

## API notes

### Confirmed by the Canada.ca search team

- **Endpoint:** `POST https://employmentandsocialdevelopmentcanadaproduction3vn562uw.org.coveo.com/rest/search/v3/passages/retrieve`
  — the same Coveo org as standard search.
- **Auth:** our existing bearer token (`CANADA_CA_SEARCH_API_KEY`) works. No new credentials.
  Add one env var for the URL (e.g. `CANADA_CA_PASSAGES_URI`) next to `CANADA_CA_SEARCH_URI`.
- **Working example request:**

  ```json
  {
    "query": "What ESDC stands for",
    "additionalFields": ["clickableuri"],
    "maxPassages": 5,
    "searchHub": "canada-gouv-public-websites",
    "localization": { "locale": "en-CA", "timezone": "America/Montreal" },
    "context": {
      "searchPageUrl": "https://www.canada.ca/en/sr/srb.html",
      "searchPageRelativeUrl": "/en/sr/srb.html",
      "customContext": "globalSemantic"
    }
  }
  ```

- **Fields:** every indexed URL has fields such as `dateissued`, `datemodified`, `title` and
  `author`. Any of them can come back through `additionalFields`.

How this differs from our standard search call (`canadaCaContextSearch.js`):

| | Standard search | Passage example |
|---|---|---|
| Query | `q` + `cq` | `query` (+ `filter` for the `cq` part) |
| Locale | `locale: 'en'` | `localization: { locale: 'en-CA', timezone }` |
| Pipeline | `pipeline: 'Canada public websites - Generic'` | none set; `context.customContext: 'globalSemantic'` |
| Search hub | `canada-gouv-public-websites` | same |
| `mlParameters` filters | yes | not used |

**`customContext: 'globalSemantic'` is required.** It turns on the Semantic Encoder, and the
trial needs the Semantic Encoder for passage retrieval to work (confirmed). Every passage
call must send it; don't drop it when changing the request. Start from the example body
as-is and change one thing at a time.

Our standard search call doesn't send `globalSemantic`, so it runs without the Semantic
Encoder. That's one reason passage pages won't exactly match our top 5.

### From Coveo docs (not yet confirmed for our org)

- Body also accepts `filter` (advanced query expression), `maxPassages` 1–20, up to 20
  `additionalFields` (`primaryid` always returned), and `pipeline`.
- Response is a list of passages sorted by relevance, each with text, score and the source
  document's fields. Response size is capped at 540 KB.
- Docs list languages other than English as **beta**. Coveo says many customers use them in
  production (see [Coveo's answers](#coveos-answers)). Phase 0 tries `locale: 'fr-CA'` with
  the French search page URLs.

Docs: [Use the Passage Retrieval API](https://docs.coveo.com/en/o86c8334/),
[Passages V3 reference](https://docs.coveo.com/en/13/api-reference/search-api#tag/Passages-V3),
[About CPR](https://docs.coveo.com/en/oaie5277/),
[CPR implementation overview](https://docs.coveo.com/en/oaoe7068/).

## Phase 0 — Probe before building (≈ 1 day)

A standalone script (`scripts/probe-passage-retrieval.js`), no pipeline changes. Use two sets
of inputs from recent English interactions across the top departments:

- ~200 **rewritten search queries** (what the query-rewrite step produced) — the input the
  "passages in search results" variant would send.
- The same ~200 **user questions** as asked — closer to what the agent would send to a
  passage tool. Semantic retrieval may do better with a full question than with keywords.

For each input, call standard search and the passage endpoint (the example body above, with
`additionalFields` `["clickableuri", "title", "datemodified", "dateissued"]`). Throttle to
≤ 2 calls per second (Coveo's limit is 5 QPS, possibly shared with production; see risk 7).
Then report:

| Measure | Question it answers |
|---|---|
| **Answer rate**: for ~30 inputs with known answers, do the passages hold **enough** to answer without downloading the page? | Can a passage replace a download? (Coveo is clear passages are nearby text, not answers.) |
| **Coverage**: share of inputs returning ≥ 1 passage, by department/hostname | Is our content in CPR scope? |
| **Overlap**: share of passage pages that are also in the standard top 5 | Is arm A's join by URL viable at current settings, or do we need a lower `numberOfDocumentsToConsider`? |
| **Question vs keywords**: answer rate with the user question vs the rewritten query | Which input should each variant send? |
| **Latency**: p50/p95 passage call vs standard call | Does the extra call eat the savings? |
| **`cq` as `filter`**: does the rewritten query's site/URL clause work as `filter`? | Can we keep the query rewrite's scoping? |
| **Freshness**: `datemodified` on passage pages vs the live page | How stale can a passage be? (Feeds risk 2.) |
| **Tables and format**: spot-check passages from pages with rate/amount tables; note whether passages come back as Markdown or plain text | Does chunking keep rows and headers together? Do our pages have Markdown streams? |
| **Size**: tokens per passage and per response at `maxPassages` 5 and 10 | Token cost of each arm, compared with a typical `downloadWebPage` result |
| **French**: ~20 French questions with `fr-CA`, scored the same way as English | Is French (beta) good enough to add French arms? |

**Stop here** if passages rarely contain the answer. Share the results with Coveo before
tuning; the pipeline settings (passage count, thesaurus, SE threshold/boost/item count) are
theirs to change.

## Phase 1 — Shared passage client

One function both variants call, in `agents/tools/canadaCaPassages.js` (or alongside
`canadaCaContextSearch.js`, reusing its retry wrapper, timeout and `splitCoveoQuery`):

- Sends the confirmed request shape. Input: query text, optional `filter`, `maxPassages`.
- Returns passages with text, score, `clickableuri`, `title` and `datemodified`.
- **French (`lang` = fr):** returns nothing, flagged, so batch results show the fallback.
  (Unless Phase 0 shows French works.)
- On failure or timeout, returns nothing. Passages are an enhancement and must never fail a
  search or an answer.
- Tests: success shape, French fallback, failure fallback.

## Phase 2 — Variant A: passages in search results (`canadaca-passages` provider)

1. **Provider value.** Add `canadaca-passages` to `src/config/searchProviders.js`, with EN/FR
   label keys. This also makes it selectable in admin chat options for manual testing.
2. **Search.** Run standard search and the passage call **in parallel**. Search time becomes
   the slower of the two, not the sum.
   - **Always keep all standard results.** Add passages under any matching result, then
     append passage-only pages after the top 5, with a cap.
   - Show `datemodified` with each passage.
3. **Routing.** `SearchContextService.performSearch` routes the new value. The search cache
   key already includes `provider`, so cached results won't mix.
4. **Tags.** Passages go **inside** the existing `<searchResults>` block. Don't add or rename
   any tag.
5. **Tests.** The merge keeps results with no passage; passage text reaches the outgoing
   answer-agent message.

Risk 4 (token cost) applies to this variant only: `deriveContext` passes the same
`searchResults` to the context agent.

## Phase 3 — Variant B: `retrievePassages` tool

1. **Tool.** `agents/tools/retrievePassages.js`: a LangChain tool taking a `query` (a focused
   question in the user's words). It calls the shared client and returns passages with URL,
   title and `datemodified`.
2. **Wiring.** `AgentFactory.createTools` builds a fixed tool list today. Add the tool only
   when the variant is on, through a batch config flag (e.g. `batch.config.passageTool`) passed
   the same way as `searchProvider`. Production agents keep their current tools.
3. **Tracking.** Wrap it with `ToolTrackingHandler` like the other tools, so calls and
   durations land in `Tool` documents.
4. **Tests.** The tool is present only when the flag is on; failure returns an empty result
   the model can read, not an exception.

Search stays on `canadaca`, so this variant isolates the effect of the tool.

## Phase 4 — Prompt variants (maintainers only)

Per AGENTS.md, these are prompt changes and need a maintainer (Lisa Fast or Ryan Hyma) to
write and approve them.

- **Plumbing (code):** `sendAnswerRequest` doesn't receive `searchProvider` or batch flags
  today. Pass the active variant through `sendAnswerRequest` →
  `AnswerGenerationService.generateAnswer` → `buildAnswerSystemPrompt` options. Test that each
  block appears only for its variant, and neither appears in production.
- **Prompts (maintainers):** short blocks, kept terse because they ship on every call in the
  variant arm. Draft directions to tune:
  - *Variant A:* If a passage in `<searchResults>` directly states the answer, you may cite
    that page without downloading it. Download when the passage is partial, conditional, or
    the answer depends on eligibility, amounts or dates.
  - *Variant B:* add `retrievePassages` under `### TOOLS`, and a line on when to use it:
    before downloading, to find which page answers the question and whether its passage is
    enough on its own.
- Decide whether Step 3's "REQUIRED" wording needs a matching exception, or whether the
  variant block is enough to override it. Arm results will show this.
- Regenerate `docs/agents-prompts/system-prompt-documentation.md` if a shared prompt file
  changes.

## Phase 5 — Metrics in batch results

Before running arms, confirm batch items expose, per item:

- the number of `downloadWebPage` and `retrievePassages` calls (from the linked `Tool`
  documents, which already record `tool` and `duration`)
- answer-step duration and total duration
- the variant actually used, and whether the French fallback fired
- the share of answers given with **zero** page downloads

If any of these aren't on the batch results / analysis pages, add them there, not in a
one-off script, so later runs reuse them.

## Phase 6 — Experiment

Use the same **English** dataset for all arms: about 200 questions with reference answers,
covering the top departments. Run 2–3 trials per arm to smooth out model nondeterminism.

| Arm | Search provider | Passage tool | Prompt | What it tells us |
|---|---|---|---|---|
| Baseline | `canadaca` | off | production | Reference point |
| A | `canadaca-passages` | off | variant A | Do passages at the search step cut downloads? |
| B | `canadaca` | on | variant B | Does an on-demand passage tool cut downloads? (Coveo's suggestion) |

Compare: downloads per answer, passage calls per answer, answer-step and total latency
(p50/p95), expert score (`ExpertScorerAnalyzer` against reference answers), citation
accuracy, and zero-download rate.

If both arms fail on quality, a further arm with passages and the **production** prompt can
show whether passages hurt quality on their own, or only when downloads are skipped.

### Success criteria (agree before running)

An arm passes if, compared with the baseline:

- median `downloadWebPage` calls per answer drop by ≥ 1
- p50 total latency drops by ≥ _N_ seconds (set _N_ after Phase 0). For arm B, passage-call
  time counts against the savings.
- expert score and citation accuracy do not drop
- no rise in confident-but-incomplete answers (see risk 3); review a sample by hand

## Risks

1. **French.** Coveo supports French in beta, with customers in production, but our models
   may not be configured for it. The first experiment is English only, because a variant
   that only works in one language can't ship. If Phase 0's French probe looks good, add a
   French dataset and arms before any decision to ship. Until then, the French fallback
   stays.
2. **Freshness.** `downloadWebPage` exists to verify the **live** page. A passage is two steps
   behind it: the page must be re-crawled, **and then** the passage model must be rebuilt
   (daily at best, per Coveo). So a passage can be a day or more older than the live page.
   Skipping downloads is only safe if that's acceptable for fast-changing content (rates,
   deadlines, closures). Showing `datemodified` helps the model judge this, but
   `datemodified` comes from the index and may be newer than the passage text.
3. **Lost context.** A passage can state a rule without the exception two paragraphs later.
   Structure-aware chunking and passage merging should reduce this, but only if our model
   uses them (fixed-size is the default for models created before October 2025). Watch both
   arms for confident but incomplete answers, not just lower scores.
4. **Token cost (arm A).** `deriveContext` passes the same `searchResults` to the context
   agent, so passages add tokens there too. Fine for the experiment. If it ships, consider
   sending passages to the answer agent only.
5. **Extra round trips (arm B).** The agent may call the passage tool *and* still download,
   adding latency instead of saving it. The metrics in Phase 5 will show this.
6. **Pipeline settings aren't ours.** Passage count, thesaurus use and Semantic Encoder
   thresholds live in Coveo's query pipeline. Results depend on how Coveo has them set, and
   changes on their side could shift results between runs. Record the settings with each
   batch.
7. **Rate limit.** Coveo allows 5 queries per second, and our key may share that with
   production canada.ca search traffic. Arm A doubles Coveo calls per question; arm B adds
   one per tool call. Keep `BATCH_CONCURRENCY` at its default (2), run arms one after
   another, and throttle the Phase 0 script (≤ 2 calls/second). Tell Coveo in advance if we
   need more. Watch for 429 responses in batch logs.

## Coveo's answers

From Coveo's search engineer:

| Question | Answer | What it means for the plan |
|---|---|---|
| Is CPR English-only? | Other languages are documented as "beta", but many customers run them in production. Coveo documents how to configure the SE and CPR models for them. Coveo is checking the doc wording with its product team. | French is possible. Phase 0 tests it; a French arm follows if it looks good (see risk 1). |
| Full Canada.ca index or a subset? | Either: all of Canada.ca or specific domains. Testing should show whether it adds value. Coveo's experience is that it helps both precision and performance. | No scope limit to plan around. Phase 0 coverage still matters. |
| How often is the passage index refreshed? | There's no separate passage index, but there is a passage **model**. It can be updated daily. | Passages can be up to about a day behind the crawl (see risk 2). |
| Latency and rate limits? | Similar to the Search API. **5 queries per second**, as for search. Higher rates must be agreed with Coveo in advance. | Throttle the probe script; keep batch concurrency low (see risk 7). |
| Same query pipeline as standard search? | Coveo suggests using the same pipeline, but it can point at a different one. | `globalSemantic` turns on the Semantic Encoder, which the trial requires. Which pipeline it runs on is open question 1. |
| Which `additionalFields`? | Any document field. | Settled. |
| Overlap with our top 5? | We can set how many search results passages are drawn from (`numberOfDocumentsToConsider`). | Overlap is a setting, not a fixed property. See [Overlap is configurable](#overlap-is-configurable). |
| How much merging is needed? | The Passages API does passage merging itself. | Only arm A's join to our top 5 is ours to build. |
| Are passages answers? | No. They're nearby text found by vector search, not just lexical search. They still need a generative model to form an answer. | That's how we use them. The real question is whether a passage holds **enough** to answer without downloading the page. Phase 0's "answer rate" measures this. |

Also settled: the endpoint, auth (existing bearer token works), default chunking
(structure-aware, recommended). Declined: MCP tools (security).

### Overlap is configurable

If the passage call uses the same pipeline as standard search and `numberOfDocumentsToConsider`
is set low (e.g. 5–10), passages would come mostly from pages near our top results. That
would make arm A's join by URL work as first designed. Two caveats:

- The first stage adds Semantic Encoder (vector) results, so it won't exactly match our
  lexical top 5.
- `numberOfDocumentsToConsider` is set on the pipeline's model association, not per request.
  Changing it affects every caller of that association. Coveo calls it an advanced setting.
  Only change it in a pipeline (or condition) used just for this test.

Phase 0 should measure overlap at the current setting first, before asking for a change.

### Still open

1. `globalSemantic` turns on the Semantic Encoder (confirmed). Does it do that as a
   condition on `Canada public websites - Generic`, or by routing to a separate pipeline?
   What are the settings (thesaurus, SE similarity threshold, boost, item count,
   `numberOfDocumentsToConsider`)?
2. Could we have a test pipeline (or context value) for this experiment, so tuning doesn't
   affect canada.ca search?
3. Are our SE and CPR models configured for French today, or would that need setup?
4. How often is our passage model actually rebuilt (daily is possible, but is it set)?
5. Does `filter` accept our `cq`-style scoping (site/URL clauses)? Does it apply to both
   retrieval stages?
6. Which chunking strategy does our CPR model use (`chunkerConfig.strategy`)?
7. Have the Canada.ca sources been rebuilt since Markdown streams were added, so chunks keep
   page structure?
8. Is the thesaurus on for the CPR association? Does Canada.ca's thesaurus contain rules CPR
   doesn't support (conditions, query syntax, regex)?
9. Is the 5 QPS limit shared with production canada.ca search traffic on our key?

Phase 0 answers "full questions or keywords?" from our own data.

## Out of scope

- MCP integration with Coveo.
- Changing the production default search provider, production tools or production prompts.
- French arms in the first experiment (Phase 0 probes French; see risk 1).
- Replacing `downloadWebPage` with Coveo's "fetch", or changing its limits.
- Comparing Coveo semantic search against our standard search pipeline for the search step
  itself. Coveo suggested this A/B test and it's worth doing, but as a separate experiment.
