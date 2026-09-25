# Architecture Quick Reference

Read this before backend, pipeline, agent, or service work.

## Directory Map

| Directory | Purpose |
|-----------|---------|
| `agents/graphs/` | LangGraph state-machine workflows (nodes, edges, state) |
| `agents/graphs/workflows/` | `GraphWorkflowHelper.js` — shared node implementations |
| `agents/graphs/services/` | Graph-internal services (redaction, translation, answer/context helpers) |
| `agents/graphs/guardrails/` | Query-blocking guardrails and shared block-type errors/constants |
| `agents/prompts/` | System prompt assembly and base prompt text |
| `agents/prompts/scenarios/` | `scenarios-all.js` (global rules) + `context-{abbrKey}/` (per-dept) |
| `agents/strategies/` | Strategy pattern implementations (e.g. sentence compare) |
| `api/` | Express route handlers grouped by domain (chat, auth, db, eval, etc.) |
| `config/` | App configuration — AI models, Passport auth, evaluation settings |
| `middleware/` | Express middleware (auth, sessions, rate limiting) |
| `models/` | Mongoose schemas, one file per collection |
| `services/` | Business logic services |
| `server/` | Express server entry point (`server.js`) |
| `src/` | React frontend (components, pages, locales, client services) |
| `scripts/` | Dev/build/generation scripts |
| `test/` | Test setup and test data |
| `tests/e2e/` | Playwright E2E specs |
| `terragrunt/` | Infrastructure as Code (AWS) |

## LangGraph Pipeline Flow

```
START → init → validate → redact → translate → contextNode → [similarQuestions] → answerNode → verifyNode → persistNode → END
```

| Node | What it does |
|------|-------------|
| `init` | Set start time, status, selected AI model |
| `validate` | Reject short/invalid queries via shortQuery service |
| `redact` | Strip PII and sensitive content |
| `translate` | Detect language, translate non-English to English |
| `contextNode` | Run `contextSystemPrompt.js` to match department abbrKey, run search, load scenarios |
| `similarQuestions` | Inject expert-rated past Q&A as context — `GenericWithQAGraph` and `InstantAndQAGraph` only |
| `answerNode` | Invoke LLM with assembled system prompt (dept scenarios only loaded if context matched) |
| `verifyNode` | Validate citation URL |
| `persistNode` | Save interaction + linked docs to MongoDB |

### Graph Variants (in `agents/graphs/`)

| File | UI label | How it works |
|------|----------|-------------|
| `GenericGraph.js` | Generic | Full pipeline: redact → translate → context → answer → verify → persist. No short-circuit. |
| `DefaultWithVectorGraph.js` | Instant answer ON | Same as GenericGraph, but after translation checks `SimilarAnswerService.findSimilarAnswer()` for a vector-similarity match against previously answered questions **with an expert score of 100**. If a perfect-score match is reranker-certified, **reuses the previous answer verbatim** and skips the full context → answer pipeline. Falls through to the full pipeline if no match. |
| `DefaultWithLocalModel.js` | Local-model instant answer ON | Same short-circuit as `DefaultWithVectorGraph`; identical graph code, different workflow name on the interaction. |
| `InstantAndQAGraph.js` | Instant answer with context ON | Same score-100 short-circuit check, and also runs `QuestionAnswerService.getSimilarQuestionsContext()` (score < 100) to inject **rich context** from expert-reviewed interactions: matched question, answer, expert feedback score, sentence-level feedback, citation, and conversation flow. This context informs the answer when the short-circuit doesn't fire. |
| `GenericWithQAGraph.js` | Past evals context ON | **The production graph since early August 2026.** Like GenericGraph (no short-circuit) but inserts a `similarQuestions` node between context and answer that injects expert-rated past Q&A (score ≤ 100 — perfect ones as a model to follow, lower ones with the expert's flagged issues to avoid) via `QuestionAnswerService.getSimilarQuestionsContext()`. No risk of serving a past answer verbatim. |
| `registry.js` | — | Lazy-loads and caches compiled graphs; `getGraphApp(name)` |

Batch runs go through the same registry (`services/experimental/ExperimentalBatchService.js` → `getGraphApp(batch.config.workflow)`), so a batch inherits whatever eval-driven nodes its workflow has — including eval-informed answering on `GenericWithQAGraph`. Pick the batch workflow deliberately when comparing against production.

Model selection is decoupled from workflow — the `model.default` setting controls which model family is used. `SettingsService` (`services/SettingsService.js`) is the single source of truth: it loads all settings from the database on startup and seeds required defaults (defined in `SETTING_DEFAULTS`) if missing. The server injects the model into the graph input at request time (`chat-graph-run.js`). All UI pages fetch the default from the Settings API — never hardcode model defaults in components. See [Model family routing](#model-family-routing-agentfactoryjs) for how each pipeline step maps to a specific model within the family.

## Prompt Assembly (`agents/prompts/systemPrompt.js`)

`buildAnswerSystemPrompt(language, options)` composes the final prompt in this order:

1. Role definition (AI Answers assistant for Canada.ca)
2. General instructions from `scenarios-all.js`
3. Similar-questions context (if available)
4. Department-specific scenarios from `context-{abbrKey}/`
5. Page language tag
6. Tagged context (department, URLs, search results)
7. **BASE_SYSTEM_PROMPT** from `agenticBase.js` — 7-step response framework
8. **SAFETY_INSTRUCTIONS** from `safety.js`
9. **CITATION_INSTRUCTIONS** from `citationInstructions.js`
10. Final reminder

### How department scenarios load

**The context node must run first.** `contextSystemPrompt.js` (via `ContextAgentService`) uses the user's question, referring URL, and search results to match a department `abbrKey`. Only after this match does `systemPrompt.js` dynamically import the scenario:

```js
// In systemPrompt.js — dynamic import using the abbrKey returned by contextSystemPrompt
const deptDashed = department.toLowerCase().replace(/\s+/g, '-');
const mod = await import(`./scenarios/context-${deptDashed}/${deptDashed}-scenarios.js`);
```

- `scenarios-all.js` is always included (global rules for all departments)
- `context-{abbrKey}/` folders provide department-specific overrides — one per partner department
- If context matching returns no department → no department scenario is loaded
- Falls back gracefully if a matched department has no scenario folder

## AI Model Config (`config/ai-models.js`)

Key exports: `getModelConfig(provider, modelName)`, `getEmbeddingModelConfig(provider, modelName)`

Providers configured here: `azure` (GPT-4.1 and 4.1-mini, GPT-4o and 4o-mini, GPT-5-mini, GPT-5-nano, GPT-5.1 and 5.1-chat, plus three embedding models), `openai`, `anthropic` — direct SDK IDs. Only `azure` is wired into a graph workflow. Defaults: temperature 0.0, maxTokens 1024, timeout 60s.

Set up but not called: `createCohereAgent` (`AgentFactory.js`) needs a `cohere` entry this file doesn't define. Bedrock has IAM and SSM config in `terragrunt/` and `@aws-sdk/client-bedrock-runtime` in `package.json`, but no importer.

### Model family routing (`AgentFactory.js`)

The "Default model family" setting selects a model **family**, not a single model. `AgentFactory` automatically routes each pipeline step to the appropriate model within that family:

| Pipeline step | Model used |
|---------------|-----------|
| PII redaction | Pinned to Azure `gpt-4o` — in-region (Canada East), family setting doesn't apply |
| Translation | Mini (`openai-gpt41-mini`) |
| Query rewrite | Mini (`openai-gpt41-mini`) |
| Context / search | Full model (e.g. GPT-5.1) |
| Answer generation | Full model |
| Auto-evaluation | Azure `openai-gpt41-mini`, hardcoded in sentence-compare and fallback-compare |
| Eval analysis | `openai-gpt51` — `EvalAnalysisService`; analyses eval results, doesn't score answers |
| Safety / bias analyzers | `createSafetyLLM` — mini; experimental analyzers only |

This means selecting "Azure GPT-5.1" uses GPT-5.1 for context and answer generation, while supporting steps automatically use the mini model for cost and speed. The admin does not need to configure this — it is handled internally by `AgentFactory`.

## Data Models (`models/`)

The ones you'll touch most; `models/` holds more (audit, counters, logs, backfill jobs, `experimental*`):

| Model | Purpose |
|-------|---------|
| `Chat` | Container for interactions; links aiProvider, user, pageLanguage |
| `Interaction` | Links Question + Answer + feedback + context; referringUrl, response time |
| `Question` | Redacted/original question, detected language, English translation |
| `Answer` | AI answer text, sentences, citation ref, token counts, model info |
| `Citation` | Citation URL, heading, provided vs AI citation |
| `Context` | Institution matched, search results, program/action classification, token usage. `topic`/`topicUrl` are dead fields pending removal — don't read or write them |
| `Eval` | Auto-evaluation: similarity scores, sentence match traces, fallback logic |
| `ExpertFeedback` | Sentence-level scores (1-4), harmful/content flags |
| `PublicFeedback` | User ratings (thumbs up/down, feedback text) |
| `Embedding` | Vector embeddings for Q+A pairs |
| `Tool` | Tool invocations (downloadWebPage, checkUrl) per answer |
| `User` | Auth user (admin/partner/expert roles) |
| `Batch` / `BatchItem` | Batch question processing |
| `ScenarioOverride` | Admin-created custom scenario text per department |
| `Setting` | App feature flags and settings |

**Key relationships:** Chat → many Interactions → each links Question, Answer, Context, Eval, ExpertFeedback, PublicFeedback. Answer → Citations, Tools.

## API Route Pattern (`api/`)

Each file exports `async function handler(req, res)`. Organised by domain:

| Subdirectory | Covers |
|-------------|--------|
| `api/auth/` | Login, signup, 2FA, reset, logout |
| `api/chat/` | Graph run, init, persist, similar-answer, dashboard, export |
| `api/data/` | Program/action seed data and loader |
| `api/db/` | DB connect/check, migrations, embeddings, evals, logs |
| `api/batch/` | Batch persist, list, retrieve, delete, stats |
| `api/experimental/` | Experimental batches and datasets |
| `api/feedback/` | Public and expert feedback CRUD |
| `api/eval/` | Evaluation run, get, delete, dashboard |
| `api/metrics/` | Usage, sessions, departments, AI eval, feedback metrics |
| `api/scenario/` | Scenario overrides (admin) |
| `api/setting/` | App settings |
| `api/user/` | User management |
| `api/vector/` | Vector reinitialise, similar chats, stats |
| `api/util/` | Shared utilities (backoff, cookies, connectivity, URL check) |


