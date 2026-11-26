# Plan: Test Coveo passage retrieval to reduce page downloads in the answer step

Status: proposed, not started. Trial access to the Coveo Passage Retrieval (CPR) API is
offered through the Canada.ca search API.

## Goal

Find out whether giving the answer agent the relevant **passage** from each search result —
not just the standard title + excerpt — lets it answer without as many `downloadWebPage`
calls, cutting answer-step latency **without** lowering answer quality or citation accuracy.

## Approach in one paragraph

Add passage retrieval as a third **search provider** (`canadaca-passages`), not a new
LangGraph workflow. Experimental batches already choose a search provider per batch, so a
batch can run the production graph with only the search step changed. A short instruction in
the answer prompt, loaded **only** when this provider is active, tells the model when a passage
is enough to skip a download. Then compare three batch arms on the same dataset.

### Why not a new workflow

- `ExperimentalBatchService.js` already passes `batch.config.searchProvider` into the graph,
  and `SearchContextService.performSearch` already routes on it.
- Passages only change what goes into `<searchResults>`. Every node after search is the same.
  A copied graph (`DefaultWithVectorGraph.js` is ~400 lines) would drift from production and
  muddy the comparison.

### Why the prompt has to change

`agenticBase.js` Step 3 makes `downloadWebPage` **required** ("read at least 1 page before
answering"). With unchanged prompts, the best case is going from 2–3 reads to 1. Getting to
0 reads needs a variant instruction. Production prompts stay untouched.

## API notes (from Coveo docs — confirm with Coveo)

- `POST https://<org>.org.coveo.com/rest/search/v3/passages/retrieve`, bearer token.
- Body: `query` (required), `filter` (advanced query expression), `maxPassages` (1–20),
  `additionalFields` (≤ 20; `primaryid` always returned), `localization` (`locale`, `timezone`),
  plus `searchHub` / `pipeline` / `context` for query-pipeline routing.
- Response is a list of passages sorted by relevance, each with text, score and the source
  document's fields. Response size is capped at 540 KB.
- Requires a CPR model built over specific sources in the Coveo org.
- Reported as **English-only**. No language parameter found in the docs.

Docs: [Use the Passage Retrieval API](https://docs.coveo.com/en/o86c8334/),
[Passages V3 reference](https://docs.coveo.com/en/13/api-reference/search-api#tag/Passages-V3),
[About CPR](https://docs.coveo.com/en/oaie5277/),
[CPR implementation overview](https://docs.coveo.com/en/oaoe7068/).

## Phase 0 — Probe before building (≈ 1 day)

A standalone script (`scripts/probe-passage-retrieval.js`), no pipeline changes. Feed it
~200 real search queries that the query-rewrite step produced, sampled from recent English
interactions across the top departments. For each query, call standard search and the passage
endpoint, then report:

| Measure | Question it answers |
|---|---|
| **Coverage**: share of the top 5 results with ≥ 1 passage, by department/hostname | Is our content in CPR scope at all? (Also answers Coveo's "which subset" question with data.) |
| **Overlap**: are passages from the top-5 pages, or other pages? | How much merging is needed? |
| **Latency**: p50/p95 passage call vs standard call | Does the extra call eat the savings? |
| **Spot check**: for ~30 passages, does the passage actually contain the answer? | Are passages answers, or just nearby text? |

**Stop here** if coverage of high-traffic content is low or passages rarely contain the
answer.

## Phase 1 — `canadaca-passages` search provider

1. **Provider value.** Add `canadaca-passages` to `src/config/searchProviders.js`, with EN/FR
   label keys. This also makes it selectable in the admin chat options for manual testing.
2. **Tool.** New `agents/tools/canadaCaPassageSearch.js` (or a mode in
   `canadaCaContextSearch.js` — reuse `splitCoveoQuery`, the retry wrapper and timeout).
   - Run standard search and the passage call **in parallel** with the same keywords,
     `cq` → `filter`, and locale. Search time becomes the slower of the two, not the sum.
   - Request `additionalFields` for `clickableuri`, `title` and a last-modified date.
   - **Always keep all standard results.** Join passages to results by URL and add
     `Passage:` lines under matching results. Append passage-only pages after the top 5,
     with a cap.
   - **French (`lang` = fr):** skip the passage call and return standard results, flagged
     so batch results show the fallback happened.
   - If the passage call fails or times out, return standard results. Passages are an
     enhancement and must never fail the search.
3. **Routing.** `SearchContextService.performSearch` routes the new value to the tool. The
   search cache key already includes `provider`, so cached results won't mix.
4. **Tags.** Passages go **inside** the existing `<searchResults>` block. Don't add or
   rename any tag.
5. **Tests.**
   - The merge keeps results that have no passage.
   - Passage text appears in the outgoing answer-agent message.
   - French falls back to standard results.
   - A passage-call failure falls back to standard results.

## Phase 2 — Prompt variant for this provider (maintainers only)

Per AGENTS.md, this is a prompt change and needs a maintainer (Lisa Fast or Ryan Hyma) to
write and approve it.

- **Plumbing (code):** `sendAnswerRequest` doesn't receive `searchProvider` today. Pass it
  through `sendAnswerRequest` → `AnswerGenerationService.generateAnswer` →
  `buildAnswerSystemPrompt` options. Add a test asserting the block is present only for
  `canadaca-passages`, and absent for `canadaca` and `google`.
- **Prompt (maintainers):** a short block, kept terse because it ships on every call in the
  variant arm. Draft direction to tune:
  > If a passage in `<searchResults>` directly states the answer, you may cite that page
  > without downloading it. Download when the passage is partial, conditional, or the answer
  > depends on eligibility, amounts or dates.
- Consider whether Step 3's "REQUIRED" wording needs a matching exception, or whether the
  added block is enough for the model to override it. Check this in the arm B vs arm C
  results.
- Regenerate `docs/agents-prompts/system-prompt-documentation.md` if a shared prompt file
  changes.

## Phase 3 — Metrics in batch results

Before running arms, confirm batch items expose, per item:

- the number of `downloadWebPage` calls (the `Tool` documents linked to the answer already
  record `tool` and `duration`)
- answer-step duration and total duration
- the search provider actually used, and whether the French fallback fired
- the share of answers given with **zero** page reads

If any of these aren't surfaced on the batch results / analysis pages, add them there,
not in a one-off script, so later runs reuse them.

## Phase 4 — Experiment

Use the same **English** dataset for all arms: about 200 questions with reference answers,
covering the top departments. Run 2–3 trials per arm to smooth out model nondeterminism.

| Arm | Search provider | Prompt | What it tells us |
|---|---|---|---|
| A | `canadaca` | production | Baseline |
| B | `canadaca-passages` | production | Do passages alone change quality or the number of reads? |
| C | `canadaca-passages` | passage variant | **The real test**: latency and reads compared with quality |

Compare: `downloadWebPage` calls per answer, answer-step and total latency (p50/p95), expert
score (`ExpertScorerAnalyzer` against reference answers), citation accuracy, and zero-read
rate.

### Success criteria (agree before running)

Arm C passes if, compared with arm A:

- median `downloadWebPage` calls per answer drop by ≥ 1
- p50 total latency drops by ≥ _N_ seconds (set _N_ after Phase 0)
- expert score and citation accuracy do not drop
- no rise in confident-but-incomplete answers (see risk 3); review a sample by hand

## Risks

1. **French.** If CPR is English-only, French-page questions can't use it, because we must
   cite French URLs. This plan tests English only. Searching in English and mapping to the
   French page would give the model English evidence for a French answer — a separate
   experiment if wanted.
2. **Freshness.** `downloadWebPage` exists to verify the **live** page. A passage is only as
   current as Coveo's last crawl. Skipping downloads is only safe if the index refresh rate
   keeps up with fast-changing content (rates, deadlines, closures).
3. **Lost context.** A passage can state a rule without the exception two paragraphs later.
   Watch arm C for confident but incomplete answers, not just lower scores.
4. **Token cost.** `deriveContext` passes the same `searchResults` to the context agent, so
   passages add tokens there too. That's acceptable for the experiment. If it ships, consider
   sending passages to the answer agent only.
5. **Query pipeline mismatch.** If the passage endpoint doesn't use the same query pipeline
   as standard search (`Canada public websites - Generic`), the two result sets may barely
   overlap, and the merge becomes mostly appending.

## Questions for Coveo

1. Is English-only a limit of the CPR model itself, or of what's enabled for the trial? Is
   French on the roadmap?
2. Can the CPR model cover the full Canada.ca search index, or must it be a predefined subset
   of sources? If a subset, how large can it be? (Phase 0 coverage data can inform this.)
3. How often is the passage index refreshed compared with the standard index?
4. Expected latency (p50/p95) and rate limits for the trial?
5. Does the passage endpoint use the same query pipeline, synonyms and boosts as standard
   search?
6. Which document fields can come back through `additionalFields` (clickable URI, title,
   last-modified date)?

## Out of scope

- Changing the production default search provider or production prompts.
- French passage retrieval.
- Removing `downloadWebPage` or changing its limits for other providers.
