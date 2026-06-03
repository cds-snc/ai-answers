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

## AWS / Bedrock account setup

The application-side IAM (ECS task role → `sts:AssumeRole` on `BEDROCK_ROLE_ARN`) is already provisioned by `terragrunt/aws/iam/iam.tf` and the role ARN is exposed to ECS via SSM (`cross_account_bedrock_role` → `BEDROCK_ROLE_ARN`). Both staging and production point at `arn:aws:iam::144414543732:role/ai-answers-bedrock-invoke` in `ca-central-1` (`terragrunt/env/{staging,production}/ssm/terragrunt.hcl`).

What **is not** in this repo, and is the source of the "fair bit of work" estimate, is everything inside that target Bedrock account (`144414543732`). The connectivity probes for Claude/Nova work today because that role exists and has Claude/Nova model access — Cohere access has to be added separately, and if the target account's Terraform lives in a different repo, those changes land there rather than here. Steps below assume the target-account infra is managed somewhere; confirm with the infra team where before writing code.

### A1. Request Cohere model access in the Bedrock account

In the AWS console for account `144414543732`, region `ca-central-1` (or wherever Cohere lands — see risks):

1. Bedrock → **Model access** → request access to the Cohere Command-R / Command-R+ models.
2. This is a per-account, per-region gate. Approval is usually fast for Cohere but **not guaranteed in `ca-central-1`** — if Cohere isn't offered in `ca-central-1`, the data-residency question in the risks section has to be resolved before continuing. Confirm availability before requesting.
3. Record the exact Bedrock `modelId` that appears after approval (e.g. `cohere.command-r-plus-v1:0`) — this is what goes in `config/ai-models.js` in step 3.

### A2. Extend the `ai-answers-bedrock-invoke` role's permissions

The role currently has `bedrock:InvokeModel` scoped to the Claude and Nova model ARNs that the connectivity probes hit. Cohere's model ARN is not in that policy, so `InvokeModel` against it will fail with AccessDenied even after model access is granted.

Add to the inline/managed policy on `ai-answers-bedrock-invoke`:

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
  "Resource": [
    "arn:aws:bedrock:ca-central-1::foundation-model/cohere.command-r-plus-v1:0",
    "arn:aws:bedrock:ca-central-1::foundation-model/cohere.command-r-v1:0"
  ]
}
```

Exact ARNs depend on the approved `modelId` from A1 and the region. Include both `command-r` and `command-r-plus` if both are in scope; otherwise trim.

**`InvokeModelWithResponseStream`** is only needed if streaming is used — `ChatBedrockConverse` streams by default when the LangChain caller asks for it, so include it to avoid a follow-up permissions change.

### A3. Confirm the trust policy on `ai-answers-bedrock-invoke`

The role's trust policy must allow `sts:AssumeRole` from the ECS task role in the **application** account (the account this repo deploys into). This is already in place for the Claude/Nova probes, so no change is expected — but verify before assuming it covers the new call site. If the trust policy is scoped by `sts:ExternalId` or a source-ARN condition, make sure the Cohere factory path produces the same assume-role call shape (the credentials helper in step 2 should mirror `ConnectivityService.js` exactly, which already works).

### A4. Verify from a staging ECS task

Before writing any of the Node code, prove the path end-to-end with the AWS CLI from inside a running staging ECS task (exec into it):

```bash
aws sts assume-role \
  --role-arn "$BEDROCK_ROLE_ARN" \
  --role-session-name cohere-smoketest \
  --duration-seconds 900

# then, with the returned temporary creds exported:
aws bedrock-runtime converse \
  --region "$BEDROCK_REGION" \
  --model-id cohere.command-r-plus-v1:0 \
  --messages '[{"role":"user","content":[{"text":"ping"}]}]'
```

If this returns a completion, the whole chain (ECS task role → STS → Bedrock role → Cohere model access) is healthy and the remaining work is purely Node/LangChain. If it fails, the error identifies exactly which of A1–A3 is wrong, and fixing it there is much faster than chasing it from inside the application code.

### A5. Staging first, production second

Do A1–A4 in staging, confirm, then repeat for production. The two environments share the same target account (`144414543732`) per `terragrunt/env/*/ssm/terragrunt.hcl`, so model access and role policy changes only need to happen once if that's accurate — but confirm the infra team hasn't split them since. If they're split, everything in A1–A3 has to be done twice.

---

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
