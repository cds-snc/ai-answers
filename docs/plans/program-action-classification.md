# Per-question program & action classification

**Status:** shipped (July 2026, merged to `main`). EN-first MVP per the plan below,
plus **Phase 2** (curated program `.md` for every scenario folder + eval-analysis
rationalization — see the Phase 2 section). FR display of *action* values and the
remaining "later phases" (program-name normalization, exec dashboard,
`FilterPanel` program/action filters) remain outstanding.
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
   `agents/prompts/scenarios/context-<dept-dashed>/<dept-dashed>-services.md`,
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

## French display — shipped (option 1, display-time translation)

Stored values remain canonical **English** strings (the pipeline classifies on
the English translation of the question, and consistency requires one canonical
language — a French user's question is still classified and stored in English).
French is **display-only**, translated at the render boundary and falling back to
English when unmapped, so grouping/search/sort stay on the single English value
and no service ever splits into an EN row and an FR row.

The translation sources (option 1 from the original plan — no classification-time
cost, no second LLM pass):

- **Programs/services** — the curated EN|FR `.md` per department, merged into the
  EN→FR map by `getAllProgramNameMap` (`programSeedsLoader.js`).
- **Actions** — the closed action vocabulary's `ACTION_FR` map in
  `programActionSeeds.js` (kept separate from `ACTION_SEEDS` so the classifier
  prompt stays English-only). Shared helper `api/util/programActionFr.js`
  (`frForProgram` / `frForAction`) applies both at the server boundary.

Where French now renders (all pick by `lang`, English fallback):

- **Partner dashboard** — "Question volume by service" card (`programFr`).
- **Eval dashboard table** — service and action columns (`programFr` / `actionFr`
  added in `eval-dashboard.js`; columns render by lang). Search/sort still operate
  on the stored **English** value — a known gap for a French partner searching a
  French service name.
- **Eval-analysis report** — the "Service — action" cross-tab: groups keep their
  English program/action parts, and `EvalAnalysisService.toClientDoc` builds a
  `labelFr` from the two maps (older reports without the stored parts fall back to
  the English label). The report's per-row table is not translated because
  `toClientDoc` strips `rows` before sending — it doesn't reach the client.

## Later phases (not in this PR)

- Accuracy/satisfaction breakdowns by program, drill into action within a
  program (partner dashboard)
- Program/action filters in `FilterPanel` (scan chats by program area)
- Exec dashboard volume-by-program view
- FR display of program **and action** values — **shipped** (option 1:
  display-time translation via the curated EN/FR `.md` map + the `ACTION_FR` map,
  English fallback; wired into the partner volume card, the eval dashboard table,
  and the eval-analysis cross-tab). See "French display — shipped" above.
  Remaining gap: French search/sort on the eval dashboard's service/action columns.
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
- The curated list per department (`context-<dept>/<dept>-services.md`, EN|FR)
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

> **See also Phase 2 below** — rolling curated `.md` lists to all partners is the
> **source-side** version of this mitigation (fix the seed vocabulary so the
> classifier snaps to canonical names), complementary to read-time coalescing.

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

## Phase 2 — curated program lists for all partners + eval-analysis rationalization

**Status:** shipped (July 2026, merged to `main`). **Owner:** Lisa Fast.

Phase 1 migrated only CRA-ARC to a curated `.md`. Phase 2 rolled a curated program
list to **every partner scenario folder**, seeded from a cleaned version of the
auto-harvested draft (`.../CDS/AI/programs-by-dept-draft.csv` — a dump of the
`context.program` values the classifier had emitted over the prior few weeks), and
rationalized the two places programs/actions get produced (this classifier vs. the
eval-analysis Tier-2). Curating the seed vocabulary at the source is the drift
mitigation from the section above, applied before the fact.

**What shipped vs. this plan:**

- **All 19 scenario folders got a `.md`, not 12.** The plan below scoped the
  rollout to the 13 draft departments (→ 12 files after PHAC folds into HC-SC) and
  left the seven data-less folders on model-knowledge fallback. In practice every
  scenario folder was stubbed — including AAFC-AAC, CBSA-ASFC, CDS-SNC, FIN, JUS,
  NRCAN-RNCAN, and VAC-ACC — so there is now one `context-<dept>/<dept>-services.md`
  per folder. PHAC-ASPC still has no folder and folds into `hc-sc-services.md` as
  planned.
- **Legacy seed arrays fully retired (§4 done).** `PROGRAM_SEEDS_BY_DEPARTMENT` is
  now `{}` — the EDSC-ESDC, IRCC, and TBS-SCT arrays were removed and merged into
  their `.md` files. `ACTION_SEEDS` and `OTHER_LABEL` remain.
- **Loader guards blank FR cells.** `programSeedsLoader.js` builds the EN→FR map
  from rows that actually have a French value, so an EN-only draft row no longer
  maps `en → ''` and clobbers the English fallback.
- **Eval-analysis Tier-2 rationalized (§5 done).** The emergent
  `evalAnalysisProgramsStrategy` proposal call was deleted; the service now reuses
  stored `context.program`/`context.action`, gates the LLM fallback on
  `rowNeedsClassification` (unclassified **and** `normal` answer type), and
  classifies the fallback against the curated seed list plus in-run names. The
  pre-existing answer-type gate bug is fixed.
- **Export logs** now include `context.program` and `context.action` columns.

### 1. Rollout target — done

One `context-<dept>/<dept>-services.md` per partner folder, same format as
`cra-arc-services.md` (English | Français, curated header, one service per row).
The draft covered 13 departments: BAC-LAC, CEO-BEC, DND-MDN, ECCC, EDSC-ESDC,
HC-SC, IRCC, ISED-ISDE, PHAC-ASPC, SAC-ISC, STATCAN, TBS-SCT, TC.

- **Aliased departments share the primary's file.** `PHAC-ASPC` has no scenario
  folder — it resolves to `HC-SC` via `resolveScenarioKey`, and the loader keys
  the file off the *resolved* abbrKey. So PHAC-ASPC programs are **merged into
  `hc-sc-services.md`**, not given their own file. Same rule for every other
  aliased abbrKey (Defence portfolio → DND-MDN, RCAANC → SAC-ISC, ACOA-APECA /
  CED-QR / CanNor → ISED-ISDE): curate at the primary folder.
- **Shipped wider than planned:** rather than leaving the seven data-less folders
  (AAFC-AAC, CBSA-ASFC, CDS-SNC, FIN, JUS, NRCAN-RNCAN, VAC-ACC) on model-knowledge
  fallback, every scenario folder got a `.md`. Net: **19 files**, one per folder,
  with PHAC folding into HC-SC.
- **Since this shipped (2026-08-19):** four regional development agencies —
  FedDev Ontario, FedNor, PacifiCan and PrairiesCan — became partners in their own
  right, so they were removed from `SCENARIO_ALIASES` and given their own scenario
  folders and `.md` files (**24 folders, one `.md` each** now). Their rows moved out of
  `ised-isde-services.md`. This is the general case to watch when de-aliasing a
  department: because `programSeedsLoader.js` resolves through `resolveScenarioKey`
  too, dropping an alias without creating the new folder's `.md` silently empties
  that department's seed vocabulary. The three RDAs still aliased to ISED-ISDE
  (ACOA-APECA, CED-QR, CanNor) stay curated in `ised-isde-services.md`.

### 2. CSV cleanup rules (draft → curated)

The harvest is raw classifier output and has three recurring defects. Apply
before writing each `.md`:

- **Department-name-as-program → drop it.** The classifier sometimes emitted the
  department's own name as the "program"; that carries no granularity — remove
  the row (the question then buckets as `unknown`/empty, which is correct).
  Examples to drop: "Environment and Climate Change Canada", "Health Canada",
  "Public Health Agency of Canada", "Statistics Canada" / "Statistics Canada
  surveys", "Indigenous Services Canada", "Treasury Board of Canada Secretariat",
  plus placeholder rows like "AI Answers" / "Canada.ca guidance" (CEO-BEC).
- **Strip the `Canadian Armed Forces` / `CAF` prefix (DND).** The harvest
  prepended the organization onto dozens of DND rows ("Canadian Armed Forces
  release process", "CAF Transition Services"), which is duplicative and makes
  names hard to parse. Strip the prefix and merge the sprawling
  release/transition/pay/benefits variants down to a small set of canonical
  programs. Stripping is safe here — the DND partners review their own file, and
  program names don't have to be unique across departments.
- **Dedupe variants/typos → one canonical name.** The whole point of the seed
  file is one name per program. Collapse case / punctuation / abbreviation /
  singular-plural / typo variants. Examples: "Consumer Price Index" +
  "Consumer Price Index (CPI)"; "Census" + "Census of Population" + "Statistics
  Canada Census" + "2021 Census of Population"; "Pleasure Craft Licence" +
  "(PCL)" + "Pleasure Craft Licensing"; "Pleasure Craft Operator Card" +
  "(PCOC)"; "Pensioners Dental Services Plan" + "Pensioners' Dental Services
  Plan"; "Public Service Pension" + "Public Service Pension Plan"; typos
  "Geneology" → "Genealogy", "Canada Dentall Care Plan" → "Canada Dental Care
  Plan".

**Programs need not be unique across departments.** Each partner curates its
**own** file, so a genuinely shared program (e.g. Public Service Health Care Plan
/ Pension Plan / Dental Care Plan) may legitimately appear in several department
files, and there is no requirement to coordinate identical wording across them.
Cleanup is only ever *within* a file: strip the department's own name and dedupe
that file's variants.

### 3. French names

Draft `.md` files land with the **English column populated** from the cleaned
harvest and the **Français column blank**. The loader tolerates an empty FR cell
(`getSeedPrograms` uses `.en`; `getAllProgramNameMap` skips en-only rows) — so an
EN-only draft is strictly better than today's English-only fallback arrays, with
no FR regression. Official French program names are filled in afterward by Lisa /
partners, same edit model as CRA-ARC. Do **not** machine-generate official GC
program names (consistent with the EN-first MVP).

### 4. Retire the legacy seed arrays — done

`programActionSeeds.js` previously hardcoded program arrays for **EDSC-ESDC**,
**IRCC**, and **TBS-SCT** (one entry). All three arrays were removed and their
entries merged into the department `.md` files (mirroring how CRA-ARC was
removed), so `PROGRAM_SEEDS_BY_DEPARTMENT` is now `{}` — the `.md` is the single
source of truth and the two can't diverge. The merge preserved curated names the
harvest missed (EI sub-benefit breakdowns, IRCC `Study permit` / `Citizenship`,
etc.). `ACTION_SEEDS` and `OTHER_LABEL` stay in `programActionSeeds.js` — actions
remain a global, non-department list. The empty map is kept only as the loader's
fallback for a folder that has neither a `.md` nor harvested programs (the loader
returns `[]` in that case).

### 5. Rationalize with the eval-analysis Tier-2 (shipped July 2026)

`partner-eval-analysis.md` predated this classifier, so its Tier-2 ran its own
two-pass emergent program/action grouping — which double-classified every recent
normal question (those already carry `context.program`/`context.action`).

Decision, now shipped: **read stored, keep Tier-2 as a fallback.** The emergent
program-proposal pass (`evalAnalysisProgramsStrategy`, `sampleRows`,
`PROGRAM_SAMPLE_SIZE`) was deleted; the classification vocabulary is now the
department's curated seed list (`getSeedPrograms`) plus program names already
stored on rows in the run. The gate lives in `rowNeedsClassification`
(`services/evalAnalysisStats.js`).

- Eval-analysis uses the stored `context.program` / `context.action` when
  present — so recent rows bucket **identically to the partner volume card** (one
  curated taxonomy). No re-classification of already-tagged rows.
- For rows still at `''` (historical, or a failed classify call), Tier-2 runs as
  before to fill the gap **for that report only** — it does **not** write back to
  `context.program` (see below). When it falls back it should classify against the
  **curated seed lists** (`programSeedsLoader.getSeedPrograms` for the row's
  department) rather than proposing a fresh emergent set, so a historical CPP row
  and a recent CPP row land in the same bucket.
- **Gate the fallback on answer type — only classify `normal`-type rows.**
  Non-normal answers (`not-gc`, `pt-muni`, `clarifying-question`) carry no GC
  program and must be skipped, exactly as the per-question classifier does via
  `NON_CLASSIFIABLE_ANSWER_TYPES` (`api/util/answerTypes.js`). **This is a bug in
  the current eval-analysis:** `EvalAnalysisService` already projects
  `interactions.answerType` (row fetch) but never filters on it, so today it
  classifies clarifying-question / not-gc / pt-muni rows too. Reuse the shared
  `NON_CLASSIFIABLE_ANSWER_TYPES` set so both paths gate identically — don't
  reimplement the type list.
- **No backfill** (decided): historical interactions are not re-run through the
  classifier. Dashboards read stored values only, so pre-feature rows stay in the
  existing `unknown`/empty bucket and coverage improves organically as new
  questions arrive. Revisit only if the historical gap proves to matter.

Net effect: one canonical program/action vocabulary (curated `.md` +
`ACTION_SEEDS`), produced once by the classifier for new questions and reused
everywhere; the eval-analysis Tier-2 shrinks to a gap-filler for old data. The
`partner-eval-analysis.md` Tier-2 section should get a pointer back here noting it
now prefers stored values.

### Open items for the walkthrough — resolved

- The shipped draft is a **first cut** for partners to curate; a reasonable
  canonical name was chosen per merged cluster (esp. the DND
  release/transition/pay family and the STATCAN census/CPI/survey clusters), and
  partners refine their own file afterward.
- **FR deferred:** draft `.md` files shipped with the English column populated and
  the Français column blank; official French names are filled in afterward by Lisa
  / partners (same edit model as CRA-ARC).
- **All seven data-less folders were stubbed now** rather than left on
  model-knowledge fallback (see §1).
