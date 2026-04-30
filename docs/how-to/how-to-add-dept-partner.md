# Department Partner Usage Guide

## Naming Convention

**⚠️ CRITICAL:** Department abbreviations (`abbrKey`) are defined in `departments_EN.js` and `departments_FR.js` and are the **source of truth**. You must use the exact `abbrKey` from those files—you cannot create new abbreviations.

Abbreviations are **bilingual**, ordered by **headquarters location**:
- **Anglophone headquarters (Ontario/Ottawa):** `ENGLISH-FRENCH` (e.g., `CRA-ARC`, `TBS-SCT`)
- **Francophone headquarters (Quebec):** `FRENCH-ENGLISH` (e.g., `EDSC-ESDC`, `SAC-ISC`)

### Current Departments (abbrKey from departments lists)

| abbrKey | English Name | French Name |
|---------|--------------|------------|
| `CBSA-ASFC` | Canada Border Services Agency | Agence des services frontaliers du Canada |
| `CEO-BEC` | Canada.ca Experience Office | Bureau de l'expérience Canada.ca |
| `CDS-SNC` | Canadian Digital Service | Service numérique canadien |
| `CRA-ARC` | Canada Revenue Agency | Agence du revenu du Canada |
| `DND-MDN` | National Defence (shared — see [Shared scenarios](#shared-scenarios-one-file-for-a-portfolio-of-departments)) | Défense nationale |
| `ECCC` | Environment and Climate Change Canada | Environnement et Changement climatique Canada |
| `EDSC-ESDC` | Employment and Social Development Canada | Emploi et Développement social Canada |
| `FIN` | Finance Canada | Finances Canada |
| `HC-SC` | Health Canada | Santé Canada |
| `IRCC` | Immigration, Refugees and Citizenship Canada | (bilingual name) |
| `ISED-ISDE` | Innovation, Science and Economic Development Canada | Innovation, Sciences et Développement économique Canada |
| `JUS` | Justice Canada (Department of) | Justice Canada, Ministère de la |
| `NRCan-RNCan` | Natural Resources Canada | Ressources naturelles Canada |
| `PHAC-ASPC` | Public Health Agency of Canada | Agence de la santé publique du Canada |
| `PSPC-SPAC` | Public Services and Procurement Canada | Services publics et Approvisionnement Canada |
| `RCAANC-CIRNAC` | Crown-Indigenous Relations and Northern Affairs Canada | Relations Couronne-Autochtones et Affaires du Nord Canada |
| `SAC-ISC` | Indigenous Services Canada | Services aux Autochtones Canada |
| `StatCan` | Statistics Canada | Statistique Canada |
| `TBS-SCT` | Treasury Board of Canada Secretariat | Secrétariat du Conseil du Trésor du Canada |

---

## Files to Update When Adding a Department

| # | File | What to Update |
|---|------|-----------------|
| 1 | **NEW FILE** `/agents/prompts/scenarios/context-{slug}/{slug}-scenarios.js` | Create with export constant (e.g., `CBSA_ASFC_SCENARIOS`) containing department-specific instructions |
| 2 | `FilterPanel.js` | Add department to `departmentOptions` array using `abbrKey` |
| 3 | `scenario-overrides.js` | Add department to `SUPPORTED_DEPARTMENTS` using `abbrKey` |
| 4 | `ScenarioOverridesPage.js` | Add department to `SUPPORTED_DEPARTMENTS` array using `abbrKey` |
| 5 | `how-to-add-dept-partner.md` | Add department to "Current Departments" table |
| 6 | System prompt docs | Run `node scripts/generate-system-prompt-documentation.js` to regenerate |

**Note:** `departments_EN.js` and `departments_FR.js` already contain the `abbrKey`—do NOT add entries there. Use the existing `abbrKey` from those files in all other locations.

**Note:** `systemPrompt.js` no longer requires manual updates—it uses dynamic imports to automatically load scenarios based on the department name.

---

## How It Works

1. Chat request arrives with department context (e.g., `"CBSA-ASFC"`)
2. `systemPrompt.js` dynamically imports the scenario file based on department name (e.g., `context-cbsa-asfc/cbsa-asfc-scenarios.js`)
3. Department-specific scenarios are injected into the LLM system prompt
4. Admin dashboard can filter chat logs by department via `FilterPanel.js`
5. Admin panel can override scenarios per department via `ScenarioOverridesPage.js`
6. Overrides are stored in database keyed by `departmentKey`

---

## Adding a Department as a Partner

**FIRST:** Look up the `abbrKey` in `departments_EN.js` or `departments_FR.js`. Use that exact `abbrKey` in all steps below.

Example: To add CBSA, search for "Canada Border Services Agency" → find `abbrKey: "CBSA-ASFC"`

### Step 1: Create Scenario File

**Location:** `/agents/prompts/scenarios/context-{slug}/{slug}-scenarios.js`

Replace `{slug}` with the lowercase department key (e.g., `cbsa-asfc` for CBSA-ASFC).

⚠️ **IMPORTANT:** Leave the scenario file **empty**. The department partner will add their own scenarios and URLs.

```javascript
export const {UPPER_KEY}_SCENARIOS = ``;
```

Example for CBSA:
```javascript
export const CBSA_ASFC_SCENARIOS = ``;
```

### Step 2: Update `FilterPanel.js`

Add to `departmentOptions` array (around line 89) in **alphabetical order**:

```javascript
{ value: '{ABBR_KEY}', label: '{ABBR_KEY}' }
```

Example for CBSA:
```javascript
{ value: 'CBSA-ASFC', label: 'CBSA-ASFC' }
```

### Step 3: Update `scenario-overrides.js`

Add to `SUPPORTED_DEPARTMENTS` object in **alphabetical order**:

```javascript
'{ABBR_KEY}': async () => {
  const mod = await import('../../agents/prompts/scenarios/context-{slug}/{slug}-scenarios.js');
  return mod.{UPPER_KEY}_SCENARIOS || '';
},
```

Example for CBSA:
```javascript
'CBSA-ASFC': async () => {
  const mod = await import('../../agents/prompts/scenarios/context-cbsa-asfc/cbsa-asfc-scenarios.js');
  return mod.CBSA_ASFC_SCENARIOS || '';
},
```

### Step 4: Update `ScenarioOverridesPage.js`

Add to `SUPPORTED_DEPARTMENTS` array (line 13) in **alphabetical order**:

```javascript
'{ABBR_KEY}'
```

Example for CBSA:
```javascript
'CBSA-ASFC'
```

### Step 5: Update Documentation

After adding the department partner, update the documentation:

1. **Update this document's partner list:** Add the new department to the "Current Departments" table at the top of this document (in alphabetical order by `abbrKey`)
2. **Run system-prompt-documentation script:** Generate updated system prompt documentation with the new partner list

```bash
node scripts/generate-system-prompt-documentation.js
```

This script updates the system prompt documentation to reflect the current list of department partners.

### Placeholder Reference

| Placeholder | Example | Description |
|------------|---------|------------|
| `{ABBR_KEY}` | `CBSA-ASFC` | The exact `abbrKey` from departments_EN.js |
| `{slug}` | `cbsa-asfc` | Lowercase version of abbrKey with hyphen |
| `{UPPER_KEY}` | `CBSA_ASFC` | Uppercase version of abbrKey with underscore |

---

## Shared scenarios (one file for a portfolio of departments)

When a partner covers a portfolio of related `abbrKey`s (e.g. National Defence and the six other Defence-portfolio entities), you don't create seven scenario files. Instead, one canonical scenario file is shared via the alias map.

### How it works

`agents/prompts/scenarios/scenario-aliases.js` maps non-canonical `abbrKey`s to the canonical `abbrKey` whose scenario file should be loaded. `systemPrompt.js` resolves the alias before the dynamic import.

Current aliases:
- **Defence portfolio → `DND-MDN`:** `CFHA-ALFC`, `DCC-CDC`, `DIA-AID`, `DRDC-RDDC`, `IRPDA-CIEAD`, `ONDCAF`
- **Crown-Indigenous / Indigenous Services → `SAC-ISC`:** `RCAANC-CIRNAC`

### Steps to add a new shared-scenario group

1. **Pick the canonical `abbrKey`** (the partner/home department, e.g. `DND-MDN`).
2. **Follow Steps 1–5 above using only the canonical `abbrKey`.** Create one scenario file, add one entry to `scenario-overrides.js`, one entry to `ScenarioOverridesPage.js`.
3. **Add alias entries** for every other `abbrKey` in the portfolio to `SCENARIO_ALIASES` in `scenario-aliases.js`, each mapping to the canonical `abbrKey`.
4. **Top-of-file comment in the scenario file:** list every `abbrKey` that resolves to this file (so a reader of the scenario file can see the full audience at a glance).
5. **`FilterPanel.js`:** add only the canonical `abbrKey` as a filter option — do NOT add the alias keys. Logs from all portfolio entities are filterable via the single canonical entry.
6. **`SUPPORTED_DEPARTMENTS` in `scenario-overrides.js` and `ScenarioOverridesPage.js`:** only the canonical entry. The partner manages one override that covers the whole portfolio.
7. Run `node scripts/generate-system-prompt-documentation.js` — the generator uses the alias map too, and the hardcoded portfolio descriptions in `getDepartmentDisplayName` should be updated to mention the shared group.

---

## Checklist for Adding a Department as a Partner

- [ ] Look up `abbrKey` in `departments_EN.js` or `departments_FR.js`
- [ ] Create `/agents/prompts/scenarios/context-{slug}/{slug}-scenarios.js` with empty export
- [ ] Add to `departmentOptions` in `FilterPanel.js` (alphabetically)
- [ ] Add to `SUPPORTED_DEPARTMENTS` in `scenario-overrides.js` (alphabetically)
- [ ] Add to `SUPPORTED_DEPARTMENTS` in `ScenarioOverridesPage.js` (alphabetically)
- [ ] Update "Current Departments" table in this document (alphabetically)
- [ ] Run `node scripts/generate-system-prompt-documentation.js` to update system prompt docs
- [ ] Test scenario loading in chat
- [ ] Test admin filtering by department
- [ ] Test scenario override for department
