# Per-question program & action classification

**Status:** shipped (July 2026, merged to `main`). EN-first MVP per the plan below;
FR display and the "later phases" remain outstanding.
**Owner:** Lisa Fast

Post-ship tuning of the partner "Question volume by program" card: real programs
are capped at the top 10 (client-side; the API still returns `MAX_PROGRAMS`), and
the `unknown`/unclassified bucket was moved out of the bars into the subtitle so
it no longer dominates the axis.

## Problem

AI Answers classifies each question by department (`context.department`), which
drives scenario loading and department-level statistics. We want a second, more
granular layer: what **task** the user was trying to accomplish, split into two
independent parts:

- **Program** — the specific government program the question relates to
  (e.g. "Canada Pension Plan"). Framed as *program*, not *service*: programs
  have clear accountability, "service" is nebulous, and the crisper concept
  keeps the LLM's naming consistent across runs (July 2026 team decision).
- **Action** — what the user wants to do with it (e.g. "Apply",
  "Check eligibility")

This extends the existing per-question department pattern; nothing is scoped
per chat. A conversation that spans CPP then EI is expected and already handled
by per-question scoping.

## Decisions (agreed with Lisa, July 2026)

| Decision | Choice |
|----------|--------|
| Where classification runs | **Fire-and-forget after persist** — zero added user latency; a failed call leaves the fields empty |
| Program vocabulary | **Open, seed-guided** — the model names the official GC program itself; `PROGRAM_SEEDS_BY_DEPARTMENT` is a naming anchor, not a closed list. No taxonomy for public servants to maintain. |
| Action vocabulary | **Controlled list** (`ACTION_SEEDS` + synonyms) or `unknown` — actions are where consistency does the differentiating work |
| Unseeded departments | Classifier still runs; the model uses its own knowledge of GC programs |
| Dashboard v1 | Volume-by-program card on the partner dashboard only |
| Examine/test surface | Program + Action columns on the Evaluation dashboard table |
| Language | **EN-first MVP** — canonical English values stored in the DB; FR display deferred (see below) |
| Model | Mini tier (`openai-gpt41-mini`), same as PII/translation/query-rewrite — it's a cheap tagging call |

### Accepted risks

1. **Naming drift.** Open program naming means the model may emit variant names
   for the same program over time ("EI regular benefits" vs "Employment
   insurance - regular benefits"). Mitigation: the prompt instructs exact reuse
   of seed names when they fit; drift is visible in the volume card, and a
   normalization pass can be added later if it proves to be a problem.
   *Update (post-ship):* the seed vocabulary is moving to a curated,
   partner-editable EN/FR Markdown table per department at
   `agents/prompts/scenarios/context-<dept-dashed>/<dept-dashed>-programs.md`,
   loaded by `api/data/programSeedsLoader.js` (`getSeedPrograms`, with an
   EN→FR map via `getProgramNameMap` for future French display). CRA-ARC has
   migrated; departments without a file fall back to the arrays in
   `programActionSeeds.js`. Curation is the drift mitigation. There is **no**
   runtime write-back to these files (ECS filesystem is ephemeral) — emergent
   names already land in `Context.program`, so a later DB→file reconcile/review
   step can promote good ones into the curated list.
2. **Shared action seeds.** `api/data/programActionSeeds.js` is also the
   eval-analysis vocabulary; the account-action additions (Recover account,
   Use MFA) appear there too. This is intentional — one vocabulary.

## Data model

Two new optional string fields on the `Context` schema (`models/context.js`):

```js
program: { type: String, required: false, default: '' },
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
                   ProgramActionClassificationService.classifyInteraction()
                     ├─ buildMessages: English question + English answer +
                     │  context.department + citation URL + referring URL +
                     │  seed programs (for the matched dept) + action list
                     ├─ mini-model LLM call via AgentOrchestratorService
                     └─ Context.updateOne({_id}, {$set: {program, action}})
```

- The answer and citation are inputs **by design** — users mix programs up, and
  the answer/citation often reveals the real program.
- The prompt encodes the accounts rule: accounts (CRA Account, My
  Service Canada Account, IRCC account…) apply only when the user's task is
  *using* the account — sign in, register, recover/forgot password, MFA,
  locked out. A question about a program *inside* an account (e.g. "see my CPP
  entitlement in MSCA") gets the program itself.
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
| `models/context.js` | Add `program`, `action` fields |
| `api/data/programActionSeeds.js` | Add account actions (Recover account, Use MFA) |
| `agents/strategies/programActionClassifyStrategy.js` | **New** — prompt + parse, modeled on `evalAnalysisClassifyStrategy.js` |
| `agents/AgentFactory.js` | **New** `createProgramActionAgent` (mini model, mirrors `createQueryRewriteAgent`) |
| `services/ProgramActionClassificationService.js` | **New** — orchestrates the call, updates the Context doc |
| `services/InteractionPersistenceService.js` | Fire-and-forget hook after save |
| `api/eval/eval-dashboard.js` | Project `program`/`action` from the context lookup; add to search, columnSearch, sort |
| `src/pages/EvalDashboardPage.js` | Program + Action columns (after Department), per-column filters, updated order indexes, bumped table-state key |
| `api/metrics/metrics-programs.js` | **New** — question volume grouped by `context.program`, shared filters |
| `server/server.js` | Register `/api/metrics/metrics-programs` |
| `src/services/MetricsService.js` | `getProgramMetrics()` |
| `src/hooks/admin/useDashboardMetrics.js` | `includePrograms` opt-in (best-effort, like referrals) |
| `src/components/admin/PartnerDashboard.js` | "Question volume by program" `HBarCard` |
| `src/locales/en.json` / `fr.json` | Keys for the card + columns |

## Partner dashboard v1

Single `HBarCard`: top programs by question volume plus an "unknown" bucket
(empty + `'unknown'` merged for display), scoped by the applied filters (date
range, department, userType, …). Numbers via `formatNumber`. Chrome (title,
labels) fully bilingual via locale keys.

## French — deferred (MVP is EN-first)

Stored values are canonical **English** strings (the pipeline classifies on the
English translation of the question, and consistency requires one canonical
language). Program/action values shown in dashboards are dynamic DB content,
which is exempt from the locale-key rule — but a French admin/partner will see
English program names, which is not acceptable long-term.

Follow-up options when we get there:

1. **Display-time translation map** — seed the high-volume programs with their
   official FR names (programs have official French names on canada.ca);
   fall back to the stored EN string when unmapped.
2. **Second LLM pass or bilingual output** — ask the classifier for both EN and
   FR names at classification time and store both.

Option 1 is likely sufficient for seeded programs and costs nothing at
classification time. Decision deferred until the EN MVP has real data.

## Later phases (not in this PR)

- Accuracy/satisfaction breakdowns by program, drill into action within a
  program (partner dashboard)
- Program/action filters in `FilterPanel` (scan chats by program area)
- Exec dashboard volume-by-program view
- FR display of program values — **shipped** (option 1: curated EN/FR `.md`,
  merged map served as `programFr`, English fallback). FR display of *action*
  values is still outstanding.
- Program-name normalization (drift) — see the dedicated section below.

## Program-name normalization (drift)

**Status:** not started. First real evidence of drift observed (July 2026):
the classifier stored `Registered retirement saving plan (RRSP)` (singular
"saving") against the curated `Registered retirement savings plan (RRSP)`, and a
retired program name (`Canada Carbon Rebate`) appeared as its own bucket. Both
show as separate bars and neither maps to a French name, because both the
volume-chart grouping and the EN→FR lookup are **exact-string** matches on the
stored `context.program` value.

### Why it happens

Program naming is open (seed-guided, not a closed list — a deliberate decision,
see the Decisions table). The classifier is instructed to reuse a seed name
verbatim when one fits, but nothing enforces it, so it emits near-duplicates
(case / whitespace / punctuation / singular-plural / abbreviation variants) and
names for programs not in the curated list (new, renamed, or retired). The
curated `.md` per department is the intended mitigation, but it only helps
questions the model chooses to snap to it.

### Data contract (what's fixed today)

- `context.program` stores a **canonical English** string, or `''` (never
  classified) / `'unknown'` (ran, not confident). Non-normal answers are never
  classified (see the answer-type gate).
- The curated list per department (`context-<dept>/<dept>-programs.md`, EN|FR)
  is the source of truth for **canonical** names + their French display value.
- Both the volume chart (`metrics-programs.js`) and FR display key off the
  **exact** stored string. Any normalization must reconcile a stored variant to
  a canonical name; it must **not** mutate history blindly (a wrong merge is
  hard to undo).

### Approach options (decision needed)

| Option | What it does | Good for | Cost / risk |
|--------|--------------|----------|-------------|
| A. **Alias table** | Hand-maintained `variant → canonical` map, applied at read time | Known, recurring variants | Cheap, exact, auditable; doesn't scale to the long tail; manual |
| B. **Deterministic normalize + match** | Coalesce on a normalized key (trim, lowercase, collapse whitespace/punctuation, singular↔plural) when comparing stored→canonical | Typos & formatting variants ("saving"/"savings") | Cheap, no LLM; risk of false merges (two real programs with near-identical names); English-only heuristics |
| C. **LLM reconcile pass** | Batch job: given the curated list + the distinct stored names, map each unmapped variant → a canonical name or flag "genuinely new" | Semantic variants ("EI regular benefits" vs the canonical) | Handles the hard cases; token cost; **must** be reviewed, not auto-applied |
| D. **Review surface** | Admin/partner UI lists stored program names not in the curated `.md`, with counts; a human promotes → curated name, merges, or adds a new program | Curation + catching new programs | Safest (human-in-loop); most build effort |

These compose: the likely shape is **B applied at read time** (so the chart and
FR map coalesce obvious variants immediately, no data migration), plus a
**D-style review list** feeding the curated `.md` for the rest, with **C**
reserved only if semantic drift dominates once we can measure it.

### Where it runs / write-back

- Read-time coalescing (A/B) lives next to `getAllProgramNameMap` /
  `metrics-programs.js` — it changes display only, never the stored value.
- Promotion (D) writes to the curated **`.md` in the repo** via normal
  edit/PR review — **not** a runtime file write (ECS filesystem is ephemeral;
  see the shared-loader note). The DB (`context.program`) is the discovery feed,
  the `.md` is the curated truth.
- Rewriting stored `context.program` values (a true migration) is a separate,
  later step and should only follow a reviewed mapping — reserve it for when a
  canonical rename must apply retroactively.

### First step before building

A read-only audit query over staging/prod: distinct `context.program` values
with counts, split into (a) exact matches to a curated name, (b) close variants
of a curated name, (c) no curated match. That sizing decides whether drift is a
handful of aliases (→ A) or a long tail (→ B + D), and whether C is worth it.

### Open decisions

- Coalesce at **read time** (display-only, reversible) vs **migrate** stored
  values (retroactive, riskier)? Recommend read-time first.
- Singular/plural and punctuation folding in B: acceptable, or too aggressive
  for GC program names that differ by a single word? Needs the audit data.
- Who curates the review list (D) — CDS only, or partners for their own
  department, mirroring the `.md` edit model?
