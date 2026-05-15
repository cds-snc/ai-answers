# Workflow-scoped model templates refactor plan

## Goal

Replace ambiguous provider/model-family selection with explicit workflow-scoped model templates, while keeping chat and batch behavior stable during migration.

Primary objective:

- Preserve current runtime behavior by default.
- Introduce a safer architecture where workflows select templates and templates resolve per-step model plans.
- Prevent batch regressions during rollout.

## Current pain points

- `selectedAI` currently behaves like a virtual provider/model-family key and is passed across graphs/services with mixed naming (`provider`, `agentType`, `selectedAI`).
- `AgentFactory` contains implicit routing logic for which concrete model each step should use.
- UI and settings expose model choices that do not directly reflect actual per-step runtime models.
- Batch processing reuses this path; changes to selection semantics can silently alter batch outcomes.

## Proposed architecture

### 1) Model catalog remains centralized

Keep `config/ai-models.js` as the source of model defaults and provider-specific config.

Enhance model entries with explicit metadata (example fields):

- `provider`
- `deploymentName` or provider-specific model identifier
- `supportsReasoning`
- default limits (`maxTokens`, `timeoutMs`, `temperature`, etc.)

### 2) Add workflow-scoped template config

Create `config/workflow-model-templates.js` with templates organized per workflow.

Example shape:

```js
export const WORKFLOW_MODEL_TEMPLATES = {
  GenericGraph: {
    balanced: { ... },
    lowLatency: { ... },
    gpt5Heavy: { ... },
  },
  DefaultWithVectorGraph: {
    balanced: { ... },
    lowLatency: { ... },
  },
  InstantAndQAGraph: {
    balanced: { ... },
    lowLatency: { ... },
  },
};
```

Each template defines step-role mappings and optional overrides:

- `answer`
- `context`
- `queryRewrite`
- `translation`
- `pii`
- `ranker`
- `sentenceCompare`
- `fallbackCompare`
- `detectLanguage`

### 3) Add resolve/transform step

Create `services/ModelPlanResolver.js`:

- Input: `{ workflow, templateId }`
- Output: resolved per-role plan with merged params:
  - model catalog defaults
  - template-level overrides
  - role-specific overrides

This is the single place to apply non-default settings such as reasoning effort and token caps.

### 4) Simplify AgentFactory responsibility

Refactor `agents/AgentFactory.js` so it only instantiates a model from resolved inputs:

- `createAgentForRole({ role, modelKey, resolvedParams, chatId })`

Factory still handles provider constructor differences, but does not choose templates or business strategy.

## Batch-safe migration strategy

## Compatibility rules (must hold until cutover)

- Existing payloads with `selectedAI` continue to work unchanged.
- If no template is provided, server resolves to legacy-equivalent template for that workflow.
- Stored historical batch records remain processable without migration scripts.

## Batch-specific risks and mitigations

1. Risk: older batches store `aiProvider` only.
   Mitigation: derive template via compatibility mapping (`selectedAI` -> default template for workflow).

2. Risk: per-workflow step differences cause missing role mappings.
   Mitigation: resolver validates required roles per workflow and fails fast with clear error.

3. Risk: UI/API mismatch during rollout.
   Mitigation: server-side canonical resolution; UI fields are optional during transition.

4. Risk: unintended model/latency drift in batch reprocessing.
   Mitigation: persist resolved template id (and optional resolved answer-role model key) on new batch runs for traceability.

## Implementation phases

### Phase 0: Baseline lock + tests

- Add characterization tests for current behavior of:
  - chat workflow model selection
  - batch start/process paths
  - role-level model routing in `AgentFactory`
- Capture baseline fixtures for:
  - `GenericGraph`
  - `DefaultWithVectorGraph`
  - `InstantAndQAGraph`
- Ensure failing-policy mismatch is resolved first (reasoning effort consistency between config and tests).

### Phase 1: Introduce template + resolver behind compatibility layer

- Add `workflow-model-templates.js`.
- Add `ModelPlanResolver`.
- Keep all existing `selectedAI` interfaces; internally map to template ids.
- Add server fallback behavior:
  - prefer explicit `modelTemplate`
  - else map from `selectedAI`
  - else workflow default template

### Phase 2: AgentFactory refactor (internal)

- Switch factory callsites to consume resolved role plans.
- Keep existing exported factory functions temporarily as wrappers to avoid broad callsite churn.
- Verify no behavior changes under default mappings.

### Phase 3: API + settings + UI migration

- Add setting key(s):
  - `modelTemplate.defaultByWorkflow` (or equivalent normalized shape)
- Update chat options and batch upload to choose template (workflow-aware list).
- Keep legacy model selector hidden or compatibility-mapped during transition.

### Phase 4: Batch persistence and observability hardening

- Persist template id on batch metadata.
- Persist resolved answer-role model key on interaction metadata for auditability.
- Add logs/metrics:
  - workflow
  - template id
  - answer role model key
  - reasoning token usage when available

### Phase 5: Remove legacy pathways

- Remove direct `selectedAI` routing once all clients use templates.
- Remove obsolete compatibility mapping after one release cycle with no legacy traffic.

## Validation matrix

Run before enabling template-first mode:

1. Chat unauthenticated: default workflow + default template.
2. Chat authenticated: workflow override + template override.
3. Batch upload new batch: workflow/template persisted and processed.
4. Batch reprocess old batch records created pre-migration.
5. Eval pipeline paths that rely on default model setting continue to function.
6. Vector/embedding paths unaffected by template changes unless explicitly scoped.

## Test plan

- Unit:
  - `ModelPlanResolver` role coverage, merge precedence, error handling.
  - compatibility mapping from legacy `selectedAI`.
- Integration:
  - `chat-graph-run` resolution behavior.
  - batch start/process using legacy and template payloads.
- Regression:
  - existing `AnswerGenerationService` and graph workflow tests.
  - focused batch tests (`BatchService`, `batch-*` API routes).

## Rollout and rollback

Rollout:

1. Deploy with compatibility mode enabled by default.
2. Enable template-first in staging.
3. Run batch smoke suite and compare outputs/latency to baseline.
4. Enable in production with monitoring.

Rollback:

- Feature flag back to legacy resolution path (`selectedAI` mapping only).
- Keep template config deployed but bypass resolver.

## Open decisions

1. Template storage model:
   - static config file only, or admin-editable settings-backed templates.
2. Setting shape:
   - global default template, or per-workflow defaults only.
3. Backfill policy:
   - whether to backfill historical batch rows with inferred template ids.

## Definition of done

- Workflow-scoped templates drive all model-role selection.
- Batch processing works for both new and legacy records.
- AgentFactory no longer owns business model-routing decisions.
- UI and settings reflect template selection semantics clearly.
- Tests cover compatibility and template-first paths with no regression in batch flows.
