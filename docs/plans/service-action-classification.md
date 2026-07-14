# Per-question service & action classification

**Status:** implementing (July 2026)
**Owner:** Lisa Fast

## Problem

AI Answers classifies each question by department (`context.department`), which
drives scenario loading and department-level statistics. We want a second, more
granular layer: what **task** the user was trying to accomplish, split into two
independent parts:

- **Service** — the specific program/service the question relates to
  (e.g. "Canada Pension Plan")
- **Action** — what the user wants to do with it (e.g. "Apply",
  "Check eligibility")

This extends the existing per-question department pattern; nothing is scoped
per chat. A conversation that spans CPP then EI is expected and already handled
by per-question scoping.

## Decisions (agreed with Lisa, July 2026)

| Decision | Choice |
|----------|--------|
| Where classification runs | **Fire-and-forget after persist** — zero added user latency; a failed call leaves the fields empty |
| Service vocabulary | **Open, seed-guided** — the model names the official GC program itself; `SERVICE_SEEDS_BY_DEPARTMENT` is a naming anchor, not a closed list. No taxonomy for public servants to maintain. |
| Action vocabulary | **Controlled list** (`ACTION_SEEDS` + synonyms) or `unknown` — actions are where consistency does the differentiating work |
| Unseeded departments | Classifier still runs; the model uses its own knowledge of GC programs for the service |
| Dashboard v1 | Volume-by-service card on the partner dashboard only |
| Examine/test surface | Service + Action columns on the Evaluation dashboard table |
| Language | **EN-first MVP** — canonical English values stored in the DB; FR display deferred (see below) |
| Model | Mini tier (`openai-gpt41-mini`), same as PII/translation/query-rewrite — it's a cheap tagging call |

### Accepted risks

1. **Naming drift.** Open service naming means the model may emit variant names
   for the same program over time ("EI regular benefits" vs "Employment
   insurance - regular benefits"). Mitigation: the prompt instructs exact reuse
   of seed names when they fit; drift is visible in the volume card, and a
   normalization pass can be added later if it proves to be a problem.
2. **Shared action seeds.** `api/data/serviceActionSeeds.js` is also the
   eval-analysis vocabulary; the account-action additions (Recover account,
   Use MFA) appear there too. This is intentional — one vocabulary.

## Data model

Two new optional string fields on the `Context` schema (`models/context.js`):

```js
service: { type: String, required: false, default: '' },
action:  { type: String, required: false, default: '' },
```

Semantics:

- `''` — never classified: all historical data (pre-feature), or the
  classification call failed. Displays as blank/unknown everywhere.
- `'unknown'` — the classifier ran but was not confident. A real, expected
  state, not an error.
- Each field is independent: a question can have both, either, or neither.

Only questions asked **after** this ships get values. No migration, no
backfill; historical docs simply lack the fields.

## Classification flow

```
persistNode → InteractionPersistenceService.persistInteraction()
                └─ (after interaction + chat saved, NOT awaited)
                   ServiceActionClassificationService.classifyInteraction()
                     ├─ buildMessages: English question + English answer +
                     │  context.department + citation URL + referring URL +
                     │  seed services (for the matched dept) + action list
                     ├─ mini-model LLM call via AgentOrchestratorService
                     └─ Context.updateOne({_id}, {$set: {service, action}})
```

- The answer and citation are inputs **by design** — users mix programs up, and
  the answer/citation often reveals the real program.
- The prompt encodes the accounts rule: account services (CRA Account, My
  Service Canada Account, IRCC account…) apply only when the user's task is
  *using* the account — sign in, register, recover/forgot password, MFA,
  locked out. A question about a program *inside* an account (e.g. "see my CPP
  entitlement in MSCA") gets the program as the service.
- Because the hook lives in the shared persistence service, all graph variants
  (Generic, DefaultWithVector, InstantAndQA, GenericWithQA) and batch runs get
  classification automatically.
- Skipped when the answer type is not a real answer attempt? No — v1 classifies
  every persisted interaction; even clarifying-question turns say something
  about what the user wanted. Revisit if the data says otherwise.
- Failure handling: log and leave `''`. Never throws into the persist path.
- Note for ops: fire-and-forget completes fine on ECS (CDS deployment mode).
  If the Vercel deployment mode is ever revived, the unawaited call may be
  killed when the response returns — same caveat as other post-persist work.

## New/changed files

| File | Change |
|------|--------|
| `models/context.js` | Add `service`, `action` fields |
| `api/data/serviceActionSeeds.js` | Add account actions (Recover account, Use MFA) |
| `agents/strategies/serviceActionClassifyStrategy.js` | **New** — prompt + parse, modeled on `evalAnalysisClassifyStrategy.js` |
| `agents/AgentFactory.js` | **New** `createServiceActionAgent` (mini model, mirrors `createQueryRewriteAgent`) |
| `services/ServiceActionClassificationService.js` | **New** — orchestrates the call, updates the Context doc |
| `services/InteractionPersistenceService.js` | Fire-and-forget hook after save |
| `api/eval/eval-dashboard.js` | Project `service`/`action` from the context lookup; add to search, columnSearch, sort |
| `src/pages/EvalDashboardPage.js` | Service + Action columns (after Department), per-column filters, updated order indexes, bumped table-state key |
| `api/metrics/metrics-services.js` | **New** — question volume grouped by `context.service`, shared filters |
| `server/server.js` | Register `/api/metrics/metrics-services` |
| `src/services/MetricsService.js` | `getServiceMetrics()` |
| `src/hooks/admin/useDashboardMetrics.js` | `includeServices` opt-in (best-effort, like referrals) |
| `src/components/admin/PartnerDashboard.js` | "Question volume by service" `HBarCard` |
| `src/locales/en.json` / `fr.json` | Keys for the card + columns |

## Partner dashboard v1

Single `HBarCard`: top services by question volume plus an "unknown" bucket
(empty + `'unknown'` merged for display), scoped by the applied filters (date
range, department, userType, …). Numbers via `formatNumber`. Chrome (title,
labels) fully bilingual via locale keys.

## French — deferred (MVP is EN-first)

Stored values are canonical **English** strings (the pipeline classifies on the
English translation of the question, and consistency requires one canonical
language). Service/action values shown in dashboards are dynamic DB content,
which is exempt from the locale-key rule — but a French admin/partner will see
English program names, which is not acceptable long-term.

Follow-up options when we get there:

1. **Display-time translation map** — seed the high-volume services with their
   official FR names (programs have official French names on canada.ca);
   fall back to the stored EN string when unmapped.
2. **Second LLM pass or bilingual output** — ask the classifier for both EN and
   FR names at classification time and store both.

Option 1 is likely sufficient for seeded services and costs nothing at
classification time. Decision deferred until the EN MVP has real data.

## Later phases (not in this PR)

- Accuracy/satisfaction breakdowns by service, drill into action within a
  service (partner dashboard)
- Service/action filters in `FilterPanel` (scan chats by program area)
- Exec dashboard volume-by-service view
- FR display of service/action values (above)
- Possible normalization pass if service-name drift shows up in the data
