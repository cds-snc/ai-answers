# Plan: Cohere via Amazon Bedrock

## Context

Cohere is currently wired into `agents/AgentFactory.js` as a **direct-to-Cohere** provider using the `cohere-ai` SDK and a `COHERE_API_KEY` / `REACT_APP_COHERE_API_KEY` env var. That path is a relic from before the repo moved behind Azure and is effectively dead (see `docs/coding-agent-docs/architecture-quick-ref.md`: Cohere is listed as "initial configuration only, no graph workflow").

### Relic code found during investigation

Two things in the current direct-Cohere wiring are worth calling out before the rewrite, because they confirm the path is not in active use and should be deleted outright rather than migrated:

1. **Env var mismatch between the two Cohere branches.** `createCohereAgent` (`agents/AgentFactory.js:109`) reads `process.env.REACT_APP_COHERE_API_KEY`, while the `case 'cohere'` branch inside `createContextAgent` (`agents/AgentFactory.js:200`) reads `process.env.COHERE_API_KEY`. Only one of these could ever have been set at a time in any given deployment, so at least one of the two branches has been silently broken for a while. The `REACT_APP_` prefix is itself a relic from when this code ran in a Create-React-App frontend context — it has no meaning server-side.

2. **`case 'cohere'` in `createContextAgent` is almost certainly non-functional.** That branch constructs a raw `CohereClient` from the `cohere-ai` SDK (`agents/AgentFactory.js:199`) and then passes it into `createReactAgent({ llm, tools: [] })`. `createReactAgent` expects a LangChain `BaseChatModel` (like `ChatCohere`, `ChatOpenAI`, etc.) — a raw `CohereClient` does not implement that interface, so this would throw at runtime the first time it's invoked. The fact that nobody has reported this error is strong evidence the branch is unreachable in practice. Compare with `createCohereAgent` directly above it, which correctly uses `ChatCohere` from `@langchain/cohere`.

Both issues disappear in step 6 when the direct-Cohere code is deleted. Noting them here so the Bedrock rewrite doesn't accidentally preserve the bugs by copy-pasting.

---

The intent going forward is to reach Cohere through **Amazon Bedrock** using the same cross-account role assumption pattern that the Claude/Nova connectivity probes already use. The AWS infrastructure for this is already in place:

- IAM: ECS task role can assume `BEDROCK_ROLE_ARN` (`terragrunt/aws/iam/iam.tf`, `terragrunt/aws/pr_review/iam.tf`)
- SSM: `BEDROCK_ROLE_ARN` and Bedrock region exposed to ECS (`terragrunt/aws/ecs/inputs.tf`)
- SDK: `@aws-sdk/client-bedrock-runtime` already a dependency
- Reference implementation: `services/ConnectivityService.js` (`testBedrockWithRole`, `testBedrockClaudeCanada`, `testBedrockNova`) — STS assume-role → `BedrockRuntimeClient` → `InvokeModelCommand`

This plan assumes Shared Services Canada procurement unblocks Cohere on Bedrock. No work here depends on that unblock — the code can be written, merged behind config, and activated when the model access is granted.

## Goal

Replace the direct Cohere SDK branches in `AgentFactory.js` with a Bedrock-backed implementation, so Cohere becomes a usable provider inside the LangGraph pipeline under the same cross-account role already used for Claude/Nova connectivity tests.

## Non-goals

- Migrating Claude to Bedrock (separate effort).
- Changing the active production provider (Azure OpenAI stays default).
- Any UI or model-selector changes beyond what's needed to pick the Bedrock-Cohere provider.
- Touching the connectivity probes in `ConnectivityService.js` — they stay as-is.

## Approach

Use `@langchain/aws`'s `ChatBedrockConverse` rather than hand-rolled `InvokeModelCommand` calls. Reasons:

1. The rest of `AgentFactory.js` is LangChain-native (`ChatOpenAI`, `AzureChatOpenAI`, `ChatAnthropic`, `ChatCohere`). `ChatBedrockConverse` fits the same shape and plugs into `createReactAgent` without a custom adapter.
2. The Converse API normalizes request/response formats across Bedrock-hosted models, so switching between Cohere Command-R and other Bedrock models later is a `modelId` change rather than a body-schema rewrite.
3. Tool-calling support on Converse is consistent with what `createReactAgent` expects — the existing tool wiring (`downloadWebPage`, `checkURL`) should work without special-casing.

Trade-off: adds `@langchain/aws` as a new dep. The alternative — raw `BedrockRuntimeClient` + `InvokeModelCommand`, mirroring `ConnectivityService.js` — avoids the dep but requires writing a LangChain `BaseChatModel` wrapper by hand to integrate with `createReactAgent`. Not worth it.

## Implementation steps

### 1. Add dependency

```bash
npm install @langchain/aws
```

Verify peer-dep compatibility with the existing `@langchain/core` version. If `@langchain/aws` pulls in `@aws-sdk/client-bedrock-runtime` at a different version than the one already pinned in `package.json`, reconcile to avoid duplicate SDK copies in the bundle.

### 2. Add a credentials helper

New file: `agents/bedrockCredentials.js`

Responsibilities:
- Read `BEDROCK_ROLE_ARN` and `BEDROCK_REGION` (default `ca-central-1`) from env.
- Call `STSClient` + `AssumeRoleCommand` to get temporary credentials (900s duration, matching `ConnectivityService.js`).
- Cache the credentials in memory and refresh ~60s before expiry. The connectivity tests re-assume on every call because they run rarely; an agent factory can be invoked per-request, so caching is needed to avoid hammering STS.
- Export `getBedrockCredentials()` returning `{ accessKeyId, secretAccessKey, sessionToken }`.

Keep this file free of LangChain imports so it can be reused if a Claude-via-Bedrock path is added later.

### 3. Extend model config

Edit `config/ai-models.js` (or wherever `getModelConfig` is defined — confirm path during implementation) to add a `'cohere-bedrock'` provider entry:

```js
'cohere-bedrock': {
  name: 'cohere.command-r-plus-v1:0', // confirm exact Bedrock modelId at implementation time
  temperature: 0.0,
  maxTokens: 1024,
  timeoutMs: 60000,
  region: 'ca-central-1',
}
```

Keep the existing `'cohere'` entry temporarily for the rollout window, then delete it in step 6.

### 4. Add `createCohereBedrockAgent` to `AgentFactory.js`

Mirror the shape of `createCohereAgent`:

```js
import { ChatBedrockConverse } from '@langchain/aws';
import { getBedrockCredentials } from './bedrockCredentials.js';

const createCohereBedrockAgent = async (chatId = 'system') => {
  const modelConfig = getModelConfig('cohere-bedrock');
  const credentials = await getBedrockCredentials();

  const cohere = new ChatBedrockConverse({
    model: modelConfig.name,
    region: modelConfig.region,
    credentials,
    temperature: modelConfig.temperature,
    maxTokens: modelConfig.maxTokens,
  });

  const { tools, callbacks } = createTools(chatId, 'cohere-bedrock');
  const agent = await createReactAgent({ llm: cohere, tools });
  agent.callbacks = callbacks;
  return agent;
};
```

Add a matching `'cohere-bedrock'` case to `createContextAgent` — same pattern, no tools, just the `ToolTrackingHandler` callback. This replaces the broken `case 'cohere'` branch that currently passes a raw `CohereClient` into `createReactAgent` (which expects a LangChain `BaseChatModel` — that branch almost certainly doesn't work today and should be deleted in step 6).

Export `createCohereBedrockAgent` from the bottom of the file.

### 5. Wire into the pipeline entry points

Find the callers of `createCohereAgent` / the `'cohere'` context-agent case (grep `createCohereAgent`, `'cohere'` in `agents/`, `api/`, `services/`). Add `'cohere-bedrock'` as a selectable `agentType` wherever provider selection happens. This likely means:

- The graph factory in `agents/graphs/` that picks a provider per node
- Any admin settings or env-driven provider selector
- The model selector in the UI, if Cohere is user-selectable (confirm during implementation — may be admin-only)

If Cohere is not currently reachable through any user-facing selector, step 5 may reduce to "add it to the internal enum and leave it off by default."

### 6. Remove dead direct-Cohere code

Once the Bedrock path is confirmed working end-to-end in a dev environment with a real role:

- Delete `createCohereAgent` and the `case 'cohere'` branch in `createContextAgent`.
- Remove the `import { ChatCohere } from '@langchain/cohere'` line.
- Remove `@langchain/cohere` and `cohere-ai` from `package.json` (both root and `server/package.json`) unless something else imports them — grep first.
- Delete `REACT_APP_COHERE_API_KEY` and `COHERE_API_KEY` references from env docs, `.env.example`, and any Terragrunt SSM definitions.

Rename `'cohere-bedrock'` → `'cohere'` in config and all call sites once the direct path is gone, so we don't carry the `-bedrock` suffix forever.

### 7. Connectivity probe (optional but recommended)

Add `testBedrockCohere` to `services/ConnectivityService.js` alongside the existing `testBedrockClaudeCanada` / `testBedrockNova`, using a minimal Converse call against the Cohere modelId. Surface it on the admin connectivity dashboard. This gives ops a fast way to confirm the role + model-access is healthy without routing a real chat through the pipeline.

## Gating and rollout

- Merge steps 1–4 behind a provider flag that defaults to off (so the code ships but isn't invoked). The `@langchain/aws` dep and the new factory branch are inert until a graph node actually selects `'cohere-bedrock'`.
- Once procurement grants model access on the Bedrock side:
  1. Run the connectivity probe from step 7 in staging.
  2. Flip the flag on in staging, run through the eval dashboard against a representative question set.
  3. Promote to prod.
- Do step 6 (dead code removal) only after the Bedrock path has been live in prod for long enough that rollback to direct-Cohere would not be desired.

## Risks and open questions

- **Exact Bedrock modelId for Cohere.** `cohere.command-r-plus-v1:0` is a placeholder — confirm the current GA modelId in `ca-central-1` (or whichever region procurement lands in) before shipping. Region availability for Cohere on Bedrock has historically lagged Claude.
- **Region.** Connectivity probes hardcode `us-east-1` for Claude US and `ca-central-1` for Claude CA. Data-residency rules for AI Answers almost certainly require `ca-central-1`. Confirm with the infra team before choosing the region in `getModelConfig('cohere-bedrock')`.
- **STS assume-role caching.** The connectivity tests re-assume on every call. A per-request agent factory cannot do that without rate-limit / latency problems. The helper in step 2 must cache; getting the refresh window wrong (too aggressive → STS throttling; too lax → expired creds mid-request) is the most likely source of runtime bugs.
- **Tool-calling parity.** `createReactAgent` drives tool use through the LLM's native tool-calling API. Confirm Cohere Command-R on Bedrock Converse supports tool use in the way LangChain expects, or the `downloadWebPage` / `checkURL` tools won't fire. If it doesn't, Cohere can still be used for the context agent (no tools) but not the main chat agent.
- **Procurement uncertainty.** The whole plan is blocked on SSC approving Cohere model access on Bedrock. Steps 1–4 can land independently of that; steps 5–7 cannot be validated without it.

## Files likely to change

- `agents/AgentFactory.js` — add `createCohereBedrockAgent`, update `createContextAgent`, eventually delete direct-Cohere branches
- `agents/bedrockCredentials.js` — new
- `config/ai-models.js` (or equivalent) — add `'cohere-bedrock'` provider entry
- `agents/graphs/*` — provider selection (scope TBD during implementation)
- `services/ConnectivityService.js` — optional `testBedrockCohere`
- `package.json` — add `@langchain/aws`, later remove `@langchain/cohere` / `cohere-ai`
- `.env.example` and any env docs — remove stale Cohere API key vars
