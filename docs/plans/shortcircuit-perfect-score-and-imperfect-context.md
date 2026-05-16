# Tighten step 5 shortCircuit + new graph for QA context without shortCircuit

## Context

**Two related problems with the current pipeline at step 5 (`shortCircuit` node, documented in `docs/architecture/pipeline-architecture.md:263`):**

### Problem 1 — shortCircuit fires on imperfect answers (correctness bug)

The shortCircuit was intended to fire **only when a previously-answered question received a perfect expert score of 100**. The current implementation does not enforce that intent:

- `GraphWorkflowHelper.checkSimilarAnswer` calls `SimilarAnswerService.findSimilarAnswer` **without** `requestedRating`, so the vector retrieval surfaces the top-5 most-similar past interactions regardless of their expert score (any candidate with *some* expertFeedback qualifies — score 0–100).
- The reranker downstream (`interpretRankResult`, `SimilarAnswerService.js:127`) decides based on `allPass(checks)` from agent verdicts. The candidate question/flow shown to the ranker (`buildQuestionFlows`) contains no score, so the ranker cannot weight by it.
- **Net result:** an answer with an expert score of 60 can short-circuit a new question if the reranker happens to certify it.

This is very likely why `DefaultWithVectorGraph` was tried in production a few times but turned off for being "not accurate enough" — it was serving sub-100 past answers verbatim.

### Problem 2 — no way to A/B test the "QA context" idea without shortCircuit risk

`InstantAndQAGraph` already does the thing the team wants to try: it injects similar past Q&A (with their expert scores and feedback notes) into the answer prompt so the model can see "here's what was wrong last time." But that graph **also bundles in** the shortCircuit behavior, which carries the accuracy risk above. There is no graph option that gives the QA-context injection **without** also turning on shortCircuit.

The matrix today:

|                                | No similarQuestions context | With similarQuestions context |
|--------------------------------|-----------------------------|-------------------------------|
| **No shortCircuit**            | `GenericGraph`              | *(missing)*                   |
| **With shortCircuit**          | `DefaultWithVectorGraph`    | `InstantAndQAGraph`           |

We want to fill the missing cell so the team can experiment with the context-injection approach on its own.

## Plan

### 1. Tighten shortCircuit retrieval to expert score = 100 only

**File:** `agents/graphs/workflows/GraphWorkflowHelper.js`, function `checkSimilarAnswer` (around line 293)

Pass `requestedRating: 100` when calling `SimilarAnswerService.findSimilarAnswer`. The default `expertFeedbackComparison` on the vector services is `'eq'`, so this becomes an exact-match filter at the vector retrieval layer.

```js
const similarJson = await SimilarAnswerService.findSimilarAnswer({
  chatId, questions, selectedAI,
  pageLanguage: lang || null,
  detectedLanguage: detectedLang || null,
  requestedRating: 100,            // NEW — only consider perfect-score past answers
});
```

No changes needed in `SimilarAnswerService`, `DocDBVectorService`, or `IMVectorService` — they already honor `expertFeedbackRating` when it is a number (`DocDBVectorService.js:328`, `IMVectorService.js:468`).

**Effect:** Both `DefaultWithVectorGraph` and `InstantAndQAGraph` (the two graphs that use this helper) now only short-circuit on score-100 candidates. `GenericGraph` is unaffected (no short-circuit). This should make `DefaultWithVectorGraph` safe to turn on again.

### 2. Add a new graph: `GenericWithQAGraph` (or rename as you prefer)

**New file:** `agents/graphs/GenericWithQAGraph.js`

Structurally this is **`GenericGraph` + the `similarQuestions` node from `InstantAndQAGraph`**. Same node sequence as `GenericGraph` (no shortCircuit), with one extra node inserted between `contextNode` and `answerNode` that calls `QuestionAnswerService.getSimilarQuestionsContext()` with `expertFeedbackRating: 100, expertFeedbackComparison: 'lt'` (i.e., imperfect past answers).

Mirror the existing `similarQuestions` node from `InstantAndQAGraph.js:166–191`:

```js
graph.addNode('similarQuestions', async (state) => {
  let similarQuestions = '';
  try {
    similarQuestions = await QuestionAnswerService.getSimilarQuestionsContext(state.userMessage, {
      k: 3,
      threshold: 0.8,
      expertFeedbackRating: 100,
      expertFeedbackComparison: 'lt',
      language: state.lang,
      includeQuestionFlow: true,
      provider: state.selectedAI,
    });
  } catch (err) {
    await ServerLoggingService.warn('similarQuestions node failed', state.chatId, err);
  }
  return { context: { ...state.context, similarQuestions } };
});
```

Edges: `START → init → validate → redact → translate → contextNode → similarQuestions → answerNode → verifyNode → persistNode → END`. No shortCircuit node, no `requireSimilarShortCircuit` conditional.

Export `genericWithQAGraphApp` for the registry.

The prompt-assembly side already handles injection — `systemPrompt.js:27-29` reads `context.similarQuestions` and prepends a "Verified Similar Questions" block to the answer prompt with `Score: X/100` and `Feedback: ...` per past Q&A. Nothing new needed prompt-side.

### 3. Register the new graph so it appears in the UI

- **`agents/graphs/registry.js`** — add a loader entry:
  ```js
  GenericWithQAGraph: async () => {
    const mod = await import('./GenericWithQAGraph.js');
    return mod.genericWithQAGraphApp;
  },
  ```
- **`src/config/workflows.js`** — add to the `WORKFLOWS` array:
  ```js
  { value: 'GenericWithQAGraph', labelKey: 'workflows.genericWithQA' },
  ```
- **`src/locales/en.json`** and **`src/locales/fr.json`** — add `workflows.genericWithQA` to both. Suggested labels:
  - EN: `"Similar Q&A context (no short-circuit)"`
  - FR: `"Contexte Q-R similaires (sans court-circuit)"`

### 4. Update architecture docs

- **`docs/architecture/pipeline-architecture.md`** lines 263–285: rewrite step 5 to specify that only score-100 past answers can short-circuit (closes the design intent gap).
- **`docs/coding-agent-docs/architecture-quick-ref.md`** lines 44–51: add the new graph variant row. Describe it as "GenericGraph + similar-Q&A context injection, no short-circuit."

## Final state — graph matrix after this change

|                                | No similarQuestions context | With similarQuestions context |
|--------------------------------|-----------------------------|-------------------------------|
| **No shortCircuit**            | `GenericGraph`              | **`GenericWithQAGraph`** (NEW) |
| **With shortCircuit (score=100 only)** | `DefaultWithVectorGraph`    | `InstantAndQAGraph`           |

All four can be selected from the workflow dropdown, letting the team A/B test each lever independently.

## Critical files

- `agents/graphs/workflows/GraphWorkflowHelper.js` — shortCircuit tightening (one-line change in `checkSimilarAnswer`)
- `agents/graphs/GenericWithQAGraph.js` — **NEW** graph
- `agents/graphs/registry.js` — register new graph
- `src/config/workflows.js` — add to UI dropdown
- `src/locales/en.json`, `src/locales/fr.json` — add label key (both languages, real translation)
- `docs/architecture/pipeline-architecture.md` — step 5 description
- `docs/coding-agent-docs/architecture-quick-ref.md` — graph variants table

## Reused utilities (no new code needed)

- `QuestionAnswerService.getSimilarQuestionsContext` (`services/QuestionAnswerService.js:77-130`) — already formats imperfect Q&A with scores, sentence-level feedback, and citations.
- `VectorService.matchQuestions` `expertFeedbackRating` parameter (`DocDBVectorService.js:296`, `IMVectorService.js:395`) — already supports exact and less-than score filtering.
- `systemPrompt.js:27-29` "Verified Similar Questions" injection — already wired; nothing to add prompt-side.
- The `similarQuestions` node pattern in `InstantAndQAGraph.js:166-191` — copy as-is.

## Why a new graph and not a setting

Considered a boolean setting (`enableSimilarQuestionsContext`) but rejected:
- The codebase's established pattern is graph-as-variation-unit (`GenericGraph`, `DefaultWithVectorGraph`, `InstantAndQAGraph` each show in the UI dropdown).
- A setting that adds/removes a graph node based on database state makes graph behavior depend on hidden state, which is harder to reason about in logs and in production.
- A new graph entry costs only a few lines (registry + config + locale), and a colleague reading the workflow dropdown can immediately tell what each option does.

## Verification

1. **Unit test:** Add a vitest test that stubs `SimilarAnswerService.findSimilarAnswer` and asserts `checkSimilarAnswer` invokes it with `requestedRating: 100`.
2. **Existing tests:** Run `npx vitest run` over `services/` and `agents/` test suites to confirm no regressions in vector retrieval, graph wiring, or the workflows config.
3. **Manual integration check — new graph (QA context, no shortCircuit):**
   - Set workflow to `GenericWithQAGraph` in Settings.
   - Pick a question known to have a past answer with score < 100 (use eval dashboard to find one).
   - Send the question in dev; watch logs.
   - Confirm there is **no** `node:shortCircuit` log entry (the node doesn't exist in this graph).
   - Confirm `node:similarQuestions output { hasSimilar: true }`.
   - Inspect the answer prompt and confirm the "Verified Similar Questions" block with `Score: X/100` and `Feedback: ...` appears.
4. **Manual integration check — shortCircuit tightening:**
   - Set workflow to `DefaultWithVectorGraph`.
   - Send a question that previously triggered shortCircuit on a score-<100 answer (find one from logs).
   - Confirm shortCircuit now returns `{ shortCircuit: false }` and the full pipeline runs.
   - Then send a question that has a known score-100 past answer; confirm shortCircuit fires (`shortCircuit: true`).
5. **UI check:** Open the Settings page in dev (both EN and FR); confirm the new workflow option appears in the dropdown with the correct translated label, and that selecting it persists.
6. **Docs:** Confirm `pipeline-architecture.md` step 5 and `architecture-quick-ref.md` graph table reflect the new behavior.

## Out of scope (explicit)

- Refactoring `InstantAndQAGraph` to reuse shortCircuit's candidates instead of doing a second vector search.
- Removing `DefaultWithVectorGraph` even though it overlaps with `GenericGraph` once shortCircuit is tightened (it's still useful: it'll now serve verbatim only when the past answer is perfect-score, which is a legitimate fast-path).
- Adding a setting-based toggle for similarQuestions (alternative considered above).
