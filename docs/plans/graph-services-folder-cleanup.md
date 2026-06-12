# Graph services folder cleanup

## Goal

Clarify the boundary between graph workflow code, graph-local helpers, and application-level services without changing runtime behaviour. The current structure has overlapping names:

- `services/` for application/domain services used by APIs, jobs, and graph workflows
- `agents/graphs/services/` for graph-local parsers and thin wrappers around root services
- `agents/graphs/workflows/` for `GraphWorkflowHelper`, even though `agents/graphs/` already represents workflow definitions

The cleanup should proceed from lowest-impact naming/documentation changes to higher-impact module moves.

## Step 1: Document the current boundary

Impact: lowest

Add or update architecture documentation to explicitly define:

- Root `services/` are application/domain services. They may be used by API routes, background jobs, admin features, and graph workflows.
- `agents/graphs/` contains LangGraph workflow definitions and graph-specific orchestration.
- `agents/graphs/services/` currently contains a mix of parsers and graph adapters, but that name is misleading.
- `agents/graphs/workflows/` currently only contains `GraphWorkflowHelper`, so the folder name is redundant with `graphs`.

Success criteria:

- A reader can understand why services exist outside `agents/`.
- The docs acknowledge the current awkwardness instead of implying the folder split is intentional domain design.
- No imports or runtime files change.

Suggested files:

- `docs/coding-agent-docs/architecture-quick-ref.md`

## Step 2: Rename pure parser modules

Impact: low

Move graph-local parsing logic into an explicit `agents/graphs/parsers/` folder.

Candidate changes:

- `agents/graphs/services/answerService.js` -> `agents/graphs/parsers/answerParser.js`
- Extract `parseContextMessage` from `agents/graphs/services/contextService.js` into `agents/graphs/parsers/contextParser.js`

Keep compatibility low-risk by updating only direct imports. Do not change parser behaviour.

Success criteria:

- Parsing modules do not call agents, services, databases, logging, settings, search, or network APIs.
- `GraphWorkflowHelper` imports answer/context parsing from `agents/graphs/parsers/`.
- Existing graph tests pass.

Suggested tests:

```bash
npx vitest run agents/graphs
npx vitest run agents/graphs/services
```

## Step 3: Inline or remove trivial graph adapters

Impact: low to medium

Review graph-local files that only pass through to root services. Remove wrappers that do not add meaningful graph-specific behaviour.

Likely candidates:

- `agents/graphs/services/translationService.js`
- `agents/graphs/services/piiService.js`

Decision rule:

- Remove the graph-local wrapper if it only forwards arguments.
- Keep it only if it normalizes graph state, centralizes graph-specific defaults, handles graph-specific failures, or meaningfully shields graph code from a volatile dependency.

Success criteria:

- Graph guardrails call root services directly where the graph-local wrapper was pure pass-through.
- No duplicate function names exist solely to hide a direct import.
- Tests still cover the guardrail behaviour.

Suggested tests:

```bash
npx vitest run agents/graphs/guardrails
npx vitest run agents/graphs
```

## Step 4: Rename remaining graph-local service folder

Impact: medium

After parsers and trivial wrappers are removed, rename the remaining graph-local service folder based on what is left.

Preferred outcomes:

- If only boundary wrappers remain, use `agents/graphs/adapters/`.
- If only graph step implementations remain, use `agents/graphs/steps/`.
- Avoid keeping `agents/graphs/services/` unless the files are genuinely graph-private services with meaningful behaviour.

Potential examples:

- `redactionService.js` -> `adapters/redactionAdapter.js`, if it remains a graph-specific wrapper around settings/logging/redaction behaviour.
- Any context orchestration left in `contextService.js` -> `adapters/contextAdapter.js` or fold into `GraphWorkflowHelper` if it is unused elsewhere.

Success criteria:

- Folder names communicate intent without requiring readers to inspect every file.
- There is no confusing pair of root `services/` and graph `services/` unless both are truly necessary.
- Import paths are updated in tests and docs.

Suggested tests:

```bash
npx vitest run agents/graphs
npx vitest run agents/graphs/guardrails
```

## Step 5: Rename `graphs/workflows`

Impact: medium

Rename `agents/graphs/workflows/` because `graphs/` already means workflow definitions in this project.

Preferred option:

- `agents/graphs/workflows/GraphWorkflowHelper.js` -> `agents/graphs/GraphWorkflowHelper.js`

Alternative:

- `agents/graphs/workflows/GraphWorkflowHelper.js` -> `agents/graphs/helpers/GraphWorkflowHelper.js`

Recommendation:

Put `GraphWorkflowHelper.js` directly under `agents/graphs/` unless more helper files accumulate. A `helpers/` folder is less useful once parsers/adapters/guardrails have explicit homes.

Success criteria:

- `agents/graphs/workflows/` no longer exists, unless it contains multiple true workflow-level modules.
- Existing graph files import `GraphWorkflowHelper` from a path that matches its role.
- Architecture docs no longer describe `graphs/workflows` as a separate concept.

Suggested tests:

```bash
npx vitest run agents/graphs
```

## Step 6: Consider moving graph guardrails up to `agents/guardrails`

Impact: medium to high

The current `agents/graphs/guardrails/` folder contains pipeline safety policy, not graph topology. Moving it to `agents/guardrails/` would make the conceptual boundary clearer:

- `agents/graphs/` = LangGraph workflow definitions and graph-specific orchestration
- `agents/guardrails/` = AI pipeline validation/blocking policy used by graph workflows

This should come after parser/adapter cleanup so import churn is smaller and reviewers can see that guardrails are the remaining cross-cutting policy layer.

Candidate changes:

- `agents/graphs/guardrails/` -> `agents/guardrails/`
- Update imports in `GraphWorkflowHelper`, graph tests, and guardrail tests.
- Update architecture docs that currently describe guardrails as graph-internal.

Decision rule:

- Move the folder if the guardrails are intended to be reusable across graph variants or future non-LangGraph agent flows.
- Keep it under `graphs/` if the team wants to signal that these guardrails are only valid inside the current graph state machine.

Success criteria:

- Guardrail modules do not depend on graph file layout.
- Graph workflow code imports guardrails from `agents/guardrails`.
- Tests still prove short-query, redaction, PII, and translation blocking behaviour.

Suggested tests:

```bash
npx vitest run agents/guardrails
npx vitest run agents/graphs
```

## Step 7: Reassess AI-specific root services

Impact: high

After the low-risk graph cleanup, evaluate whether some root services should move under `agents/services/`.

Possible candidates:

- `services/PIIAgentService.js`
- `services/TranslationAgentService.js`
- `services/ContextAgentService.js`
- `services/AnswerGenerationService.js`
- `services/SearchContextService.js`

This is higher impact because these services are referenced by tests, docs, tools, graph helpers, and possibly API routes. Do this only if the team wants the larger architectural boundary:

- `services/` = app/domain/backend services
- `agents/services/` = AI-agent pipeline services

Success criteria:

- Imports are updated across source, tests, scripts, and docs.
- The distinction is documented.
- No circular dependencies are introduced between root services and `agents/`.

Suggested tests:

```bash
npm test
```

## Recommended order

1. Document the current boundary.
2. Extract and rename pure parsers.
3. Remove trivial pass-through graph adapters.
4. Rename any remaining graph-local service folder to `adapters` or `steps`.
5. Rename or flatten `graphs/workflows`.
6. Consider moving graph guardrails up to `agents/guardrails`.
7. Only then consider moving AI-specific root services into `agents/services`.

This keeps the first few changes easy to review and behaviour-preserving, while leaving the larger service-boundary decision for a deliberate follow-up.
