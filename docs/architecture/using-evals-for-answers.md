# Using Evals for Answers

Expert evaluations stored against past interactions are fed back into live answer generation through **two mechanisms**:

1. **Short-circuit serving** — when an incoming question closely matches a perfect-score (100) past Q/A, skip the LLM entirely and serve the past answer. Implemented by `SimilarAnswerService`. Questions need to be VERY similar to avoid serving the wrong answer. GOAL: reduce token usage and latency for frequent very similar questions. Top example question is "How can I immigrate/come live in Canada?" *Public-facing name (system card): **instant verified answers**.*
2. **Similar-questions injection** — fetch a few expert-evaluated past Q/A pairs for the incoming question and inject them into the system prompt as worked examples. May include perfect score and lower scored evaluations. Lower-rated examples carry the expert's comments about every sentence and the citation url so the LLM can avoid the same mistakes. GOAL: improve accuracy by avoiding previous mistakes and good solutions for both answer and citation. Also provides additional good citation urls for service to read. Implemented by `QuestionAnswerService`. *Public-facing name (system card): **eval-informed answering** — the card avoids the word "injection" because it reads as adversarial; this doc keeps "injection" as internal vocabulary.*

Both mechanisms read from the same vector index (`DocDBVectorService` or `IMVectorService`) and the same `ExpertFeedback` corpus. Different graphs combine them differently — the table below is the load-bearing summary.

---

## Graph comparison

| Graph | Short-circuit (`SimilarAnswerService`) | Similar-questions injection (`QuestionAnswerService`) | Notes |
|---|---|---|---|
| `GenericGraph` | ❌ | ❌ | Baseline — runs context → answer with no eval-driven steps. **This is the graph currently running in production** (and the control for the trial below). |
| `GenericWithQAGraph` | ❌ | ✅ rating ≤ 100 (`lte`, k=3, threshold=0.75) | Always runs the LLM, but feeds it expert-rated examples — including perfect-score ones and negative-feedback ones (so the model can avoid repeating past mistakes). **System card name: *eval-informed answering*. This is the graph targeted for the upcoming production trial** (the planned switch from `GenericGraph`). |
| `DefaultWithVectorGraph` | ✅ rating = 100 (`eq`) | ❌ | The registry's code-level fallback (used when a client names no graph) — **not the graph currently deployed in production**. Will serve a verified past answer when one exists; otherwise runs the full pipeline with **no** in-prompt eval examples. |
| `InstantAndQAGraph` | ✅ rating = 100 (`eq`) | ✅ rating < 100 (`lt`, k=3, threshold=0.75) | Both mechanisms: short-circuit on a perfect match, otherwise feed the LLM only **imperfect** examples (so the model sees flagged-issue cases to avoid, while perfect ones are reserved for short-circuit). |

> **Production status of the short-circuit / instant-answer path (Mechanism 1):** still **experimental — not in production**. In testing it has not performed reliably enough to deploy (risk of serving a near-match's answer to a subtly different question), so every graph that relies on it (`DefaultWithVectorGraph`, `InstantAndQAGraph`) is held back. The eval-informed answering path (`GenericWithQAGraph`) is the one moving toward production first.

> **The `threshold=0.75` similarity floor is now enforced** on the injection path (Path A — implemented). Both vector backends re-score candidates and drop those below the floor, so off-topic examples are no longer injected. `0.75` is the initial value, pending preview calibration. See [Similarity threshold — now enforced](#similarity-threshold--now-enforced-path-a) under Mechanism 2 for the mechanics.

All four graphs share the same backbone: `init → validate → redact → translate → … → answer → verify → persist`. The eval-aware graphs add a `shortCircuit` node before `contextNode` and/or a `similarQuestions` node between `contextNode` and `answerNode`.

**Graph selection:** the client picks a graph by name (`src/workflows/GraphClient.js`) and `api/chat/chat-graph-run.js` resolves it through `agents/graphs/registry.js`, falling back to `DefaultWithVectorGraph`.

---

## Mechanism 1 — Short-circuit serving (`SimilarAnswerService`)

**Purpose:** when an incoming question is a near-duplicate of a past question whose answer was rated 100/100 by an expert, serve that past answer verbatim and skip the LLM call.

**Why score = 100 only:** the past answer is served as-is with no chance for correction. Anything less than perfect means at least one flagged issue, so it must not be re-served.

**How a graph wires it in:** a `shortCircuit` node runs immediately after `translate`. It calls `workflow.checkSimilarAnswer(...)`, which calls `SimilarAnswerService.findSimilarAnswer({ requestedRating: 100 })`. On hit, the graph short-circuits to `persistNode`; on miss it flows into `contextNode`.

**Skip-on-history:** the node bails out (no lookup) when the conversation already has a prior AI reply — short-circuiting in mid-conversation would ignore the established context.

**Recency in this service:** `applyRecencyFilter` (drops items older than `recencyDays`, `DEFAULT_RECENCY_DAYS = 365` at `SimilarAnswerService.js:18`, with `expertFeedback.neverStale === true` as escape hatch) and `buildQuestionFlows` (sorts survivors newest-first by `interaction.createdAt`) before the LLM ranker picks the best candidate.

See `services/SimilarAnswerService.js` and `agents/graphs/workflows/GraphWorkflowHelper.js#checkSimilarAnswer`.

---

## Mechanism 2 — Similar-questions injection (`QuestionAnswerService`)

**Purpose:** before invoking the LLM, retrieve a few expert-rated past Q/A pairs for the incoming question and embed them into the system prompt. Perfect-score pairs serve as "do it like this"; imperfect ones serve as "and here's what the expert said was wrong."

The service is a thin orchestration layer over the existing vector index and the `Interaction` / `Answer` / `ExpertFeedback` / `Question` / `Chat` models. It does no embedding or scoring of its own.

### Similarity threshold — now enforced (Path A)

> **History:** previously the `threshold` option was accepted and logged but **never enforced** — both backends returned the top-`k` nearest neighbours regardless of distance, so a weakly-related past Q/A (the "How do I apply for EI?" example injected for "How do I get a business number?") could still be injected, and lowering the threshold had no effect. Path A fixed this.

Both backends now re-score each candidate against the query embedding and drop those below the floor:

- **`DocDBVectorService.matchQuestions`** — the `$search.vectorSearch` stage surfaces no score, but the `$project` already returns `questionsEmbedding`, so each candidate is re-scored in JS with `cosineSimilarity(queryEmb, r.questionsEmbedding)` (the same helper `_searchQA` uses). Candidates below `threshold` are dropped, survivors sorted with `compareVectorMatches`, then sliced to `k`.
- **`IMVectorService.matchQuestions`** — the score already exists (`r.similarity`); candidates below `threshold` are filtered out, then sorted with `compareVectorMatches` and sliced.

Sort order is similarity-first with a recency tie-break — see [Ordering](#ordering--similarity-first-recency-as-tie-break) below.

When `threshold` is `null` (the short-circuit caller, `SimilarAnswerService`) no floor is applied — behaviour there is unchanged.

### Expert-feedback promotion — removed (Path A)

> **History:** both backends used to run a **promotion step** that pulled the first hit carrying an `expertFeedbackId` to the front of the result list, regardless of similarity.

This was **already inert** on every production path: both QA graphs and the short-circuit caller pass a numeric `expertFeedbackRating`, and the rating filter runs *before* promotion — so every surviving hit already had feedback and "the first hit with feedback" was just the first hit. (It also was **not** why the EI example was injected — that was the missing threshold above.) Promotion only ever did anything for a caller passing no rating filter, which none do. Path A removed it: results are returned in similarity order (with the recency tie-break below). Removing it was set-identical for `SimilarAnswerService` (which re-sorts by recency and LLM-ranks downstream anyway).

### Ordering — similarity first, recency as tie-break

`matchQuestions` does **not** return pure similarity order. Both backends sort with `compareVectorMatches` (`services/vectorMatchOrdering.js`) before slicing to `k`:

- Similarity is the primary signal — a more-similar candidate always outranks a less-similar one.
- When two candidates have *identical* similarity, the one with the more recent `expertFeedbackCreatedAt` ranks first.
- Missing or unparseable timestamps sort as `-Infinity`, i.e. oldest.

Applied at `IMVectorService.js` (`matchQuestions`, sort-then-slice) and `DocDBVectorService.js` (`mapped.sort`). This is ordering only — it never rescues a hit that the threshold or recency filters would drop.

### `services/QuestionAnswerService.js`

Singleton service exposing two methods:

- **`getSimilarQuestionsContext(question, opts)`** — main entry point. Returns a formatted multi-block string (or `''` on no results / error).
- **`buildQuestionFlow(interactionId)`** — looks up the `Chat` that contains the interaction, walks its `interactions[]` in order, and returns the prior user turns leading up to (and including) the target interaction. Used to give the LLM the conversational lead-up, not just the isolated question.

#### `opts`

| Option | Default | Purpose |
|---|---|---|
| `k` | `3` | Max hits to include. |
| `threshold` | `0.8` | Cosine similarity floor passed to the vector service. **Enforced** (Path A) — candidates below it are dropped. See [Similarity threshold — now enforced](#similarity-threshold--now-enforced-path-a). |
| `expertFeedbackRating` | `null` | Rating bound for filtering (`null` means no bound). |
| `expertFeedbackComparison` | `'lt'` | One of `lt` / `lte` / `eq`. Combined with `expertFeedbackRating`. |
| `language` | `null` | Restricts to matching `pageLanguage` when the vector service supports it. |
| `maxAnswerChars` | `400` | Truncation length for the answer body. |
| `includeQuestionFlow` | `true` | When true, runs `buildQuestionFlow` for each hit. |
| `recencyDays` | `365` | Drops hits whose `expertFeedback.createdAt` is older than this many days. `null` / `0` / negative disables the filter. The `neverStale` escape hatch (below) bypasses it. |
| `useDenormalizedPreFilter` | `false` | When true, the vector layer filters on denormalized fields **before** the search instead of `$lookup`-ing afterwards. Collapses the over-fetch and skips the lookup stages — see [Denormalized pre-filter](#denormalized-pre-filter--bi-implemented). `GenericWithQAGraph` passes `true`; nothing else does yet. |

#### Execution flow

1. `dbConnect()`.
2. `initVectorService()` → `matchQuestions([question], { provider: 'azure', modelName: 'text-embedding-3-large', k: vectorK, threshold, expertFeedbackRating, expertFeedbackComparison, language, recencyDays, useDenormalizedPreFilter })`. `vectorK` depends on the path (`QuestionAnswerService.js:121`): `useDenormalizedPreFilter ? k : Math.min(k * 3, 15)`. The over-fetch on the legacy path gives the recency filter (step 6) headroom to still return `k` survivors when some hits are stale; with the pre-filter that headroom is unnecessary because staleness is already excluded at the vector layer. (`threshold` is forwarded here and now [enforced](#similarity-threshold--now-enforced-path-a) by both vector services.)
3. Filter hits to those with **both** `interactionId` and `expertFeedbackId` (the service treats expert feedback as required — hits without it are dropped, not used).
4. Single `Interaction.find({ _id: { $in: ids } })` populating `question`, `answer` → `citation`, and `expertFeedback`.
5. Compute the recency cutoff: `Date.now() - recencyDays * 86400000` (or `null` when `recencyDays` is non-positive).
6. Walk hits in vector-similarity order, stopping once `k` blocks have been built. For each hit:
   - Skip if the answer or expert feedback didn't populate.
   - Apply the recency filter (when cutoff is set): keep the hit iff `expertFeedback.neverStale === true` **or** `expertFeedback.createdAt >= cutoff`. Otherwise skip.
   - Skip if question text or answer text is empty.
   - Build a text block (see below) and push.
7. Join blocks with `\n\n`. Return `''` on any thrown error (logged via `ServerLoggingService.error`).

#### Recency filter — design notes

- **Timestamp used:** `expertFeedback.createdAt` (when the expert rated the answer), **not** `interaction.createdAt`. A two-year-old question rated last week is treated as fresh; what matters is how current the expert judgement is. `ExpertFeedback` already carries `timestamps: true` and indexes `createdAt`.
- **Hard cutoff, not a re-rank.** Survivors stay in the order returned by `matchQuestions`. Recency drops old hits; it never promotes a newer hit over a more-similar one. Note this filter is distinct from the ordering tie-break below — the cutoff decides *whether* a hit survives, the tie-break only decides the order of hits that are already equally similar.
- **Two places recency applies.** This service-level cutoff is the last line of defence. On the `useDenormalizedPreFilter` path the same window is already applied at the vector layer (`expertFeedbackCreatedAt >= cutoff` OR `expertFeedbackNeverStale: true`), so most stale hits never reach here. Recency also acts as an ordering tie-break — see [Ordering](#ordering--similarity-first-recency-as-tie-break).
- **Unknown age is treated as stale.** A hit is kept iff `Number.isFinite(efCreated) && efCreated >= cutoff`. Missing `createdAt` (legacy records pre-dating `timestamps: true`) and unparseable `createdAt` (`new Date('garbage').getTime() === NaN`) both fail this check and are dropped. Conservative by design — when in doubt, exclude.
- **`neverStale` escape hatch** — `expertFeedback.neverStale === true` always passes the filter, including for unknown-age records. This is the same flag `SimilarAnswerService` honours for evergreen content.
- **Over-fetch ratio (`k * 3`, capped at 15)** — legacy path only. Picked to absorb the common case where 1–2 of the top hits have stale feedback without ballooning the populate query. With `useDenormalizedPreFilter` there is no over-fetch (`vectorK = k`). Either way, if the corpus is thin in the recent window the section may return fewer than `k` blocks (or empty), which the system prompt handles cleanly by omitting the section.
- **Disabling the filter:** pass `recencyDays: 0` (or `null`). Useful for backfill / debug scenarios.

#### Block format

Each hit becomes:

```
Q: <question text — prefers redactedQuestion, falls back to englishQuestion>
Flow: <prior user turns, "Question 1: ...\nQuestion 2: ...">    # only when includeQuestionFlow
A: <answer text, truncated to maxAnswerChars>
Score: <totalScore>/100 (expert feedback)                       # only when present
Feedback: <sentence feedback> | <citation feedback> | <overall feedback>
Citation: <providedCitationUrl> | <aiCitationUrl> | head=<citationHead>
```

Sub-formatters (all return `''` when there's nothing to surface):

- **`formatSentenceFeedback`** — for sentences 1–4, emits `S<n>: score=<n>; flags=harmful/content-issue; note=<explanation>` for each sentence that has any of a score, flag, or explanation.
- **`formatCitationFeedback`** — emits `Citation: score=<n>; note=<explanation>; correct-url=<expertCitationUrl>`. The `correct-url` is what the expert says **should** have been cited when the AI picked the wrong URL. The system prompt explicitly tells the model to prefer it over the original `Citation:` line when relevant.
- **`formatOverallFeedback`** — emits `Improvement: <answerImprovement> | Overall: <feedback>`.
- **`formatCitation`** — pipe-joins the answer's actual citation URLs and `citationHead`.

### Graph node

`GenericWithQAGraph` and `InstantAndQAGraph` register a `similarQuestions` node between `contextNode` and `answerNode`:

```
contextNode → similarQuestions → answerNode
```

The node calls `QuestionAnswerService.getSimilarQuestionsContext(state.userMessage, { ... })` and writes the result onto `state.context.similarQuestions`. Failures are caught and logged as warnings — the node always returns, so a vector or DB outage degrades gracefully to "no examples" instead of failing the whole graph.

Per-graph tuning is shown in the graph comparison table above. Both pass `language: state.lang`, `includeQuestionFlow: true`, and `recencyDays: 365` declared explicitly at the call site (so the behaviour is visible from the graph file, not inherited silently from a service default).

### Workflow → agent

`agents/graphs/workflows/GraphWorkflowHelper.js` forwards `context.similarQuestions` into the answer request payload. `services/AnswerGenerationService.js#invokeAgent` destructures `similarQuestions` and passes it to `buildAnswerSystemPrompt`.

### System prompt assembly

`agents/prompts/systemPrompt.js` accepts a `similarQuestions` option. When the string is non-empty it injects a `## Verified Similar Questions` section between the general scenarios and the department scenarios. The section's preamble tells the model how to use the block:

- Score 100 pairs → treat as a known-good model and follow their approach, structure, and citation choice.
- Lower-score pairs → read the feedback notes and don't repeat the cited problems.
- If feedback contains a `Citation: ... correct-url=...` field, prefer that URL over the AI's original `Citation:` line.
- Reference material only — don't quote verbatim.

When `similarQuestions` is empty the entire section is omitted (no header, no preamble).

### What needs to change to meet the goal

**Goal** (per the summary at the top): inject only past Q/A pairs that are *actually relevant* to the incoming question, so the LLM learns from genuinely comparable examples — and isn't nudged toward off-topic ones like the EI/business-number case. That requires a real similarity floor.

**Path A — implemented.** Steps 1–3 below are done (see the [threshold](#similarity-threshold--now-enforced-path-a) and [promotion](#expert-feedback-promotion--removed-path-a) sections above); step 4 is in progress in preview.

1. ✅ **Surface a similarity score on both backends.** DocDB re-scores in JS with `cosineSimilarity(queryEmb, r.questionsEmbedding)` (the `$project` already returns `questionsEmbedding`), reusing the helper `_searchQA` uses; `similarity` is no longer hard-coded `null`. IM uses its existing `r.similarity`.
2. ✅ **Apply the threshold after scoring, then re-sort, then slice.** Both backends filter the full candidate list by `similarity >= threshold`, sort with `compareVectorMatches`, then `slice(0, k)`.
3. ✅ **Drop the promotion step.** Removed from both `matchQuestions` paths. Set-identical for the short-circuit caller (`threshold: null`, re-sorted downstream).
4. 🔄 **Calibrate the value.** Shipped at `0.75` (the per-graph value in `InstantAndQAGraph.js:175` / `GenericWithQAGraph.js:156`). Because the floor was never enforced before, the cosine distribution is unmeasured — validate in preview with the business-number → EI case as a regression check and adjust if needed.

**Search cost — also addressed since.** Path A fixed correctness only; the `engineK` over-fetch was left open. It has since been closed for `GenericWithQAGraph` by the denormalized pre-filter below.

### Denormalized pre-filter — B(i), implemented

**The problem it solves.** `InteractionPersistenceService.js` embeds **every** interaction during persistence, so the `Embedding` collection holds one vector per question across the *entire federal online ecosystem*, not just expert-rated ones. Rated interactions are a tiny fraction. Originally the embedding document stored `interactionId` but no feedback metadata, so "is this rated?" was only knowable by `$lookup`-ing embedding → interaction → expertFeedback — which can only happen *after* the vector search returns candidates. Hence a deep over-fetch to go needle-hunting in a haystack.

**The fix.** Feedback metadata is now denormalized onto the embedding document (`models/embedding.js:41-46`):

| Field | Used for |
|---|---|
| `expertFeedbackId` | "is this rated?" — the pre-filter requires it to exist |
| `expertFeedbackTotalScore` | the `lt` / `lte` / `eq` rating bound |
| `expertFeedbackCreatedAt` | the recency window, and the ordering tie-break |
| `expertFeedbackNeverStale` | the recency escape hatch |
| `pageLanguage` / `interactionLanguage` | language match |

Two compound indexes back the pre-filter (`models/embedding.js:62-63`). `EmbeddingMetadataService.js` keeps the fields in sync as feedback is created, changed, or deleted; `api/vector/vector-backfill-metadata.js` backfills existing rows.

With `useDenormalizedPreFilter: true`, `DocDBVectorService.matchQuestions` puts a `$match` **before** `$search.vectorSearch` (`DocDBVectorService.js:363-394`) and skips the four `$lookup`/`$unwind` stages entirely (`:396`). `IMVectorService` applies the equivalent filter against its in-memory metadata map.

**Effect on the funnel.** Trace a single `GenericWithQAGraph` injection call (graph passes `k: 3`):

| Stage | Where | Legacy path | With pre-filter |
|---|---|---|---|
| `vectorK` | `QuestionAnswerService.js:121` | `min(3*3, 15)` = **9** | `k` = **3** |
| `engineK` | `DocDBVectorService.js:353-355` | `max(9*20, 100)` = **180** | `max(3*4, 25)` = **25** |
| rated / rating / language / recency filter | pre-`$search` `$match` | ❌ post-search, after lookups | ✅ before the search |
| `$lookup` / `$unwind` stages | `DocDBVectorService.js:396-404` | 4 stages × up to 180 candidates | skipped |
| recency filter | `QuestionAnswerService.js:161-180` | → up to **3** blocks | → up to **3** blocks (rarely drops anything; already filtered) |

The search now runs over only the rated, in-language, in-window subset, so `engineK` is genuine search depth over the needles rather than worst-case headroom over the haystack.

**What made this possible.** The cluster has since been upgraded to **DocumentDB engine 8.0** (`terragrunt/aws/database/documentdb.tf:93`, `engine_version = "8.0.0"`, family `docdb8.0`). DocumentDB supports a `$match` *before* `$vectorSearch` only on **engine 8.0 / Planner v3** — per AWS docs, "Only Planner v3 works when vectorSearch stage is not the first stage… Planner v1 does not support `$vectorSearch` stage" ([query planner v3](https://docs.aws.amazon.com/documentdb/latest/developerguide/query-planner-v3.html)). On the previous 5.0 cluster the vector search had to be the first pipeline stage, which is why the over-fetch existed. Vector search remains HNSW-only ([vector search docs](https://docs.aws.amazon.com/documentdb/latest/developerguide/vectorSearch.html)).

**Current status.** Only `GenericWithQAGraph` passes `useDenormalizedPreFilter: true` (`GenericWithQAGraph.js:163`). `InstantAndQAGraph`, `DefaultWithVectorGraph`, and `SimilarAnswerService` still take the legacy post-`$lookup` path with the `max(k*20, 100)` over-fetch. Extending the flag to the short-circuit path is the obvious next step; B(ii) (a separate `ratedEmbeddings` collection) is no longer needed, since the pre-filter achieves the same "search the needles" outcome without a second collection to keep in sync.

**Decisions that still hold:**
- Losing the count guarantee is **fine** — zero injected examples is strictly better than injecting an irrelevant one (the EI/business-number failure). The system prompt already omits the section when empty.
- The corpus is sparse by nature (whole federal ecosystem): ~half of traffic is canada.ca top tasks (immigration especially) with potential coverage; the rest are one-offs that will usually have **no** rated match.
- Latency budget: "a little is fine."

---

## Inspecting what was injected (manual testing)

The full text of the injected eval block is **not persisted** on `Interaction` or `Answer`. It lives only in the graph event log.

Both QA-graph nodes emit a `node:similarQuestions output` event after the service returns. The event's metadata carries:

| Field | Meaning |
|---|---|
| `hasSimilar` | Boolean — did the service return anything? |
| `similarQuestionsLength` | Length in characters of the injected block. Useful for a quick sanity check. |
| `similarQuestionsText` | The **complete injected block**, exactly as it appears in the system prompt. |

`logGraphEvent` (`agents/graphs/GraphEventLogger.js`) routes the event to three sinks:

1. **MongoDB `Logs` collection** (`models/logs.js`) — the durable, query-friendly copy. Schema: `chatId`, `logLevel`, `message`, `metadata`, `createdAt`. Indexed on `chatId`.
2. **Blob storage** (`Storage.js`) — JSON file at `${chatId}/${interactionId}/${timestamp}-${suffix}.json`. Note: this event fires **before** `persistNode` assigns an `interactionId`, so its blob lands under `system` rather than the real interaction id. Mongo is the more reliable lookup.
3. **Live SSE stream** — forwarded to the browser during execution (consumed by the ChatViewer page below).

### Three ways to view the injected block

**ChatViewer page** (`/en/chat-viewer`, `/fr/visualiseur-de-clavardage`, admin/partner only). Paste any chatId — past or in-progress — and the page fetches that chat's full log stream from Mongo. Look for the `node:similarQuestions output` row and expand its metadata to see `similarQuestionsText`. Easiest path for manual testing.

The page has a **"Download logs (JSON)"** button next to **Refresh**. It exports the full set of logs currently loaded for that chatId as a self-describing JSON file (`chatId`, `exportedAt`, `logCount`, `logs[]`). Handy for handing a prod or staging run to someone (or an LLM) for offline analysis.

**API.** Hit `GET /api/db/db-log?chatId=<chatId>&limit=1000` (admin or partner auth required). Filter the response for entries where `message === 'node:similarQuestions output'` and read `metadata.similarQuestionsText`.

**MongoDB direct.**
```js
db.logs.find(
  { chatId: '<chatId>', message: 'node:similarQuestions output' },
  { metadata: 1, createdAt: 1 }
).sort({ createdAt: -1 })
```

### Related logged events

| Event message | What it tells you |
|---|---|
| `node:similarQuestions input` | Node started. Currently logs only `lang`. |
| `node:similarQuestions output` | Node finished. Contains the injected block. |
| `node:answer input` | Logs `hasSimilar: Boolean(state.context?.similarQuestions)` so you can confirm the block actually reached the answer node. |
| `node:shortCircuit output` (Default / Instant graphs) | Tells you whether the short-circuit mechanism fired instead. If it did, no `similarQuestions` event will follow. |

### Confirming the block hit the LLM

Set the system prompt to debug-log mode is not currently wired, but you can verify indirectly: if the `node:answer input` event reports `hasSimilar: true` and `similarQuestionsLength > 0`, the block was passed to `buildAnswerSystemPrompt` and embedded between general scenarios and department scenarios in the final prompt.

---

## Shared dependencies

- **Vector index** — `DocDBVectorService` or `IMVectorService` (selected by `initVectorService()`). Both return `interactionId`, `expertFeedbackId`, `expertFeedbackCreatedAt`, and propagate `expertFeedbackRating` so the rating filter can work. Both re-score each hit's cosine similarity and **enforce the `threshold`** floor (see [Similarity threshold](#similarity-threshold--now-enforced-path-a)), sort with `compareVectorMatches` (see [Ordering](#ordering--similarity-first-recency-as-tie-break)), and support the [denormalized pre-filter](#denormalized-pre-filter--bi-implemented).
- **Denormalized feedback metadata** — `models/embedding.js` carries `expertFeedbackId` / `expertFeedbackTotalScore` / `expertFeedbackCreatedAt` / `expertFeedbackNeverStale` / language fields, kept in sync by `EmbeddingMetadataService.js` and backfilled by `api/vector/vector-backfill-metadata.js`. These are what make the pre-filter possible; if they drift, the pre-filter path silently under-returns.
- **Mongo models** — `Interaction`, `Answer` (with populated `Citation`), `ExpertFeedback`, `Question`, `Chat`.
- **Expert feedback is required.** A hit without an `expertFeedbackId` is silently dropped. If the expert-feedback corpus is empty, both mechanisms become no-ops.

---

## Failure modes (`QuestionAnswerService`)

| Condition | Behaviour |
|---|---|
| No question / non-string input | Returns `''` immediately. |
| Vector service throws | Caught at service level → logs error, returns `''`. Graph node's own try/catch is a second safety net. |
| Zero hits after filtering | Returns `''`. Section omitted from prompt. |
| Hit's interaction missing answer or expertFeedback after populate | That hit is skipped; other hits still rendered. |
| Hit's `expertFeedback.createdAt` older than `recencyDays` and `neverStale !== true` | That hit is skipped. If recency drops all hits, the section is omitted. |
| `buildQuestionFlow` throws | Logged as warning, returns `''` for that hit's flow only. |

---

## Related files

- `services/QuestionAnswerService.js`, `services/__tests__/QuestionAnswerService.test.js`
- `services/SimilarAnswerService.js`
- `services/VectorServiceFactory.js`, `services/DocDBVectorService.js`, `services/IMVectorService.js`
- `agents/graphs/registry.js`
- `agents/graphs/DefaultWithVectorGraph.js`, `agents/graphs/GenericGraph.js`, `agents/graphs/GenericWithQAGraph.js`, `agents/graphs/InstantAndQAGraph.js`
- `agents/graphs/workflows/GraphWorkflowHelper.js`
- `services/AnswerGenerationService.js`
- `agents/prompts/systemPrompt.js`
- Models: `models/interaction.js`, `models/answer.js`, `models/expertFeedback.js`, `models/question.js`, `models/chat.js`
- Related architecture doc: [`pipeline-architecture.md`](./pipeline-architecture.md)
