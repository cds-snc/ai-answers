# Using Evals for Answers

Expert evaluations stored against past interactions are fed back into live answer generation through **two mechanisms**:

1. **Short-circuit serving** — when an incoming question closely matches a perfect-score (100) past Q/A, skip the LLM entirely and serve the past answer. Implemented by `SimilarAnswerService`.
2. **Similar-questions injection** — fetch a few expert-rated past Q/A pairs for the incoming question and inject them into the system prompt as worked examples. Lower-rated examples carry the expert's notes so the LLM can avoid the same mistakes. Implemented by `QuestionAnswerService`.

Both mechanisms read from the same vector index (`DocDBVectorService` or `IMVectorService`) and the same `ExpertFeedback` corpus. Different graphs combine them differently — the table below is the load-bearing summary.

---

## Graph comparison

| Graph | Short-circuit (`SimilarAnswerService`) | Similar-questions injection (`QuestionAnswerService`) | Notes |
|---|---|---|---|
| `DefaultWithVectorGraph` | ✅ rating = 100 (`eq`) | ❌ | The primary production graph. Will serve a verified past answer when one exists; otherwise runs the full pipeline with **no** in-prompt eval examples. |
| `GenericGraph` | ❌ | ❌ | Baseline — runs context → answer with no eval-driven steps. Useful as a control. |
| `GenericWithQAGraph` | ❌ | ✅ rating ≤ 100 (`lte`, k=3, threshold=0.6) | Always runs the LLM, but feeds it expert-rated examples — including perfect-score ones — for in-context learning. |
| `InstantAndQAGraph` | ✅ rating = 100 (`eq`) | ✅ rating < 100 (`lt`, k=3, threshold=0.6) | Both mechanisms: short-circuit on a perfect match, otherwise feed the LLM only **imperfect** examples (so the model sees flagged-issue cases to avoid, while perfect ones are reserved for short-circuit). |

All four graphs share the same backbone: `init → validate → redact → translate → … → answer → verify → persist`. The eval-aware graphs add a `shortCircuit` node before `contextNode` and/or a `similarQuestions` node between `contextNode` and `answerNode`.

**Graph selection:** the client picks a graph by name (`src/workflows/GraphClient.js`) and `api/chat/chat-graph-run.js` resolves it through `agents/graphs/registry.js`, falling back to `DefaultWithVectorGraph`.

---

## Mechanism 1 — Short-circuit serving (`SimilarAnswerService`)

**Purpose:** when an incoming question is a near-duplicate of a past question whose answer was rated 100/100 by an expert, serve that past answer verbatim and skip the LLM call.

**Why score = 100 only:** the past answer is served as-is with no chance for correction. Anything less than perfect means at least one flagged issue, so it must not be re-served.

**How a graph wires it in:** a `shortCircuit` node runs immediately after `translate`. It calls `workflow.checkSimilarAnswer(...)`, which calls `SimilarAnswerService.findSimilarAnswer({ requestedRating: 100 })`. On hit, the graph short-circuits to `persistNode`; on miss it flows into `contextNode`.

**Skip-on-history:** the node bails out (no lookup) when the conversation already has a prior AI reply — short-circuiting in mid-conversation would ignore the established context.

**Recency in this service:** `applyRecencyFilter` (drops items older than `recencyDays`, default `3650` ≈ 10 yrs, with `expertFeedback.neverStale === true` as escape hatch) and `buildQuestionFlows` (sorts survivors newest-first by `interaction.createdAt`) before the LLM ranker picks the best candidate.

See `services/SimilarAnswerService.js` and `agents/graphs/workflows/GraphWorkflowHelper.js#checkSimilarAnswer`.

---

## Mechanism 2 — Similar-questions injection (`QuestionAnswerService`)

**Purpose:** before invoking the LLM, retrieve a few expert-rated past Q/A pairs for the incoming question and embed them into the system prompt. Perfect-score pairs serve as "do it like this"; imperfect ones serve as "and here's what the expert said was wrong."

The service is a thin orchestration layer over the existing vector index and the `Interaction` / `Answer` / `ExpertFeedback` / `Question` / `Chat` models. It does no embedding or scoring of its own.

### `services/QuestionAnswerService.js`

Singleton service exposing two methods:

- **`getSimilarQuestionsContext(question, opts)`** — main entry point. Returns a formatted multi-block string (or `''` on no results / error).
- **`buildQuestionFlow(interactionId)`** — looks up the `Chat` that contains the interaction, walks its `interactions[]` in order, and returns the prior user turns leading up to (and including) the target interaction. Used to give the LLM the conversational lead-up, not just the isolated question.

#### `opts`

| Option | Default | Purpose |
|---|---|---|
| `k` | `3` | Max hits to include. |
| `threshold` | `0.8` | Cosine similarity floor passed to the vector service. |
| `expertFeedbackRating` | `null` | Rating bound for filtering (`null` means no bound). |
| `expertFeedbackComparison` | `'lt'` | One of `lt` / `lte` / `eq`. Combined with `expertFeedbackRating`. |
| `language` | `null` | Restricts to matching `pageLanguage` when the vector service supports it. |
| `maxAnswerChars` | `400` | Truncation length for the answer body. |
| `includeQuestionFlow` | `true` | When true, runs `buildQuestionFlow` for each hit. |
| `recencyDays` | `365` | Drops hits whose `expertFeedback.createdAt` is older than this many days. `null` / `0` / negative disables the filter. The `neverStale` escape hatch (below) bypasses it. |

#### Execution flow

1. `dbConnect()`.
2. `initVectorService()` → `matchQuestions([question], { provider: 'azure', modelName: 'text-embedding-3-large', k: vectorK, threshold, expertFeedbackRating, expertFeedbackComparison, language })`. The service **over-fetches** from the vector layer: `vectorK = min(k * 3, 15)`. This gives the recency filter (step 6) headroom to still return `k` survivors when some hits are stale.
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
- **Hard cutoff, not a re-rank.** Survivors stay in the vector-similarity order returned by `matchQuestions`. Recency drops old hits; it doesn't promote newer ones over more-similar ones.
- **`neverStale` escape hatch** — `expertFeedback.neverStale === true` always passes the filter. This is the same flag `SimilarAnswerService` honours for evergreen content.
- **Over-fetch ratio (`k * 3`, capped at 15)** — picked to absorb the common case where 1–2 of the top hits have stale feedback without ballooning the populate query. If the corpus becomes thin in the recent window the section may still return fewer than `k` blocks (or empty), which the system prompt handles cleanly by omitting the section.
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

Per-graph tuning is shown in the graph comparison table above. Both pass `language: state.lang` and `includeQuestionFlow: true`. Neither overrides `recencyDays`, so both inherit the 365-day default.

### Workflow → agent

`agents/graphs/workflows/GraphWorkflowHelper.js` forwards `context.similarQuestions` into the answer request payload. `services/AnswerGenerationService.js#invokeAgent` destructures `similarQuestions` and passes it to `buildAnswerSystemPrompt`.

### System prompt assembly

`agents/prompts/systemPrompt.js` accepts a `similarQuestions` option. When the string is non-empty it injects a `## Verified Similar Questions` section between the general scenarios and the department scenarios. The section's preamble tells the model how to use the block:

- Score 100 pairs → treat as a known-good model and follow their approach, structure, and citation choice.
- Lower-score pairs → read the feedback notes and don't repeat the cited problems.
- If feedback contains a `Citation: ... correct-url=...` field, prefer that URL over the AI's original `Citation:` line.
- Reference material only — don't quote verbatim.

When `similarQuestions` is empty the entire section is omitted (no header, no preamble).

---

## Shared dependencies

- **Vector index** — `DocDBVectorService` or `IMVectorService` (selected by `initVectorService()`). Both must return `interactionId`, `expertFeedbackId`, and propagate `expertFeedbackRating` so the service-level filter and the threshold/rating filter can work.
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
