# Department Partner Usage Guide

## Naming Convention

**⚠️ CRITICAL:** Department abbreviations (`abbrKey`) are defined in `departments_EN.js` and `departments_FR.js` and are the **source of truth**. You must use the exact `abbrKey` from those files—you cannot create new abbreviations.

Abbreviations are **bilingual**, ordered by **headquarters location**:
- **Anglophone headquarters (Ontario/Ottawa):** `ENGLISH-FRENCH` (e.g., `CRA-ARC`, `TBS-SCT`)
- **Francophone headquarters (Quebec):** `FRENCH-ENGLISH` (e.g., `EDSC-ESDC`, `SAC-ISC`)

### Current Departments (abbrKey from departments lists)

| abbrKey | English Name | French Name |
|---------|--------------|------------|
| `CDS-SNC` | Canadian Digital Service | Service numérique canadien |
| `CRA-ARC` | Canada Revenue Agency | Agence du revenu du Canada |
| `ECCC` | Environment and Climate Change Canada | Environnement et Changement climatique Canada |
| `EDSC-ESDC` | Employment and Social Development Canada | Emploi et Développement social Canada |
| `FIN` | Finance Canada | Finances Canada |
| `HC-SC` | Health Canada | Santé Canada |
| `IRCC` | Immigration, Refugees and Citizenship Canada | (bilingual name) |
| `ISED-ISDE` | Innovation, Science and Economic Development Canada | Innovation, Sciences et Développement économique Canada |
| `NRCan-RNCan` | Natural Resources Canada | Ressources naturelles Canada |
| `PHAC-ASPC` | Public Health Agency of Canada | Agence de la santé publique du Canada |
| `PSPC-SPAC` | Public Services and Procurement Canada | Services publics et Approvisionnement Canada |
| `RCAANC-CIRNAC` | Crown-Indigenous Relations and Northern Affairs Canada | Relations Couronne-Autochtones et Affaires du Nord Canada |
| `SAC-ISC` | Indigenous Services Canada | Services aux Autochtones Canada |
| `TBS-SCT` | Treasury Board of Canada Secretariat | Secrétariat du Conseil du Trésor du Canada |

---

## Files to Update When Adding a Department

| # | File | What to Update |
|---|------|-----------------|
| 1 | **NEW FILE** `/src/services/systemPrompt/context-{slug}/{slug}-scenarios.js` | Create with export constant (e.g., `TBS_SCT_SCENARIOS`) containing department-specific instructions |
| 2 | `systemPrompt.js` | Add entry to `departmentModules` object with async import using `abbrKey` |
| 3 | `FilterPanel.js` | Add department to `departmentOptions` array using `abbrKey` |
| 4 | `scenario-overrides.js` | Add department to `SUPPORTED_DEPARTMENTS` using `abbrKey` |
| 5 | `ScenarioOverridesPage.js` | Add department to `SUPPORTED_DEPARTMENTS` array using `abbrKey` |

**Note:** `departments_EN.js` and `departments_FR.js` already contain the `abbrKey`—do NOT add entries there. Use the existing `abbrKey` from those files in all other locations.

---

## How It Works

1. Chat request arrives with department context (e.g., `"TBS-SCT"`)
2. `systemPrompt.js` dynamically imports the scenario file from `departmentModules`
3. Department-specific scenarios are injected into the LLM system prompt
4. Admin dashboard can filter chat logs by department via `FilterPanel.js`
5. Admin panel can override scenarios per department via `ScenarioOverridesPage.js`
6. Overrides are stored in database keyed by `departmentKey`

---

## Adding a Department as a Partner

**FIRST:** Look up the `abbrKey` in `departments_EN.js` or `departments_FR.js`. Use that exact `abbrKey` in all steps below.

Example: To add TBS, search for "Treasury Board" → find `abbrKey: "TBS-SCT"`

### Step 1: Create Scenario File

**Location:** `/src/services/systemPrompt/context-{slug}/{slug}-scenarios.js`

Replace `{slug}` with the lowercase department key (e.g., `tbs-sct` for TBS-SCT).

⚠️ **IMPORTANT:** Leave the scenario file **empty**. The department partner will add their own scenarios and URLs.

```javascript
export const {UPPER_KEY}_SCENARIOS = ``;
```

### Step 2: Update `systemPrompt.js`

Add to `departmentModules` object (lines 10-60):

```javascript
'{ABBR_KEY}': {
  getContent: async () => {
    const { {UPPER_KEY}_SCENARIOS } = await import('./systemPrompt/context-{slug}/{slug}-scenarios.js');
    return { scenarios: {UPPER_KEY}_SCENARIOS };
  },
},
```

### Step 3: Update `FilterPanel.js`

Add to `departmentOptions` array (line 87):

```javascript
{ value: '{ABBR_KEY}', label: '{ABBR_KEY}' }
```

### Step 4: Update `scenario-overrides.js`

Add to `SUPPORTED_DEPARTMENTS` object:

```javascript
'{ABBR_KEY}': async () => {
  const { {UPPER_KEY}_SCENARIOS } = await import('../../src/services/systemPrompt/context-{slug}/{slug}-scenarios.js');
  return {UPPER_KEY}_SCENARIOS;
},
```

### Step 5: Update `ScenarioOverridesPage.js`

Add to `SUPPORTED_DEPARTMENTS` array in **alphabetical order**:

```javascript
'{ABBR_KEY}'
```

### Placeholder Reference

| Placeholder | Example | Description |
|------------|---------|------------|
| `{ABBR_KEY}` | `TBS-SCT` | The exact `abbrKey` from departments_EN.js |
| `{slug}` | `tbs-sct` | Lowercase version of abbrKey with hyphen |
| `{UPPER_KEY}` | `TBS_SCT` | Uppercase version of abbrKey with underscore |

---

## Checklist for Adding a Department as a Partner

- [ ] Look up `abbrKey` in `departments_EN.js` or `departments_FR.js`
- [ ] Create `/src/services/systemPrompt/context-{slug}/{slug}-scenarios.js`
- [ ] Add to `departmentModules` in `systemPrompt.js`
- [ ] Add to `departmentOptions` in `FilterPanel.js`
- [ ] Add to `SUPPORTED_DEPARTMENTS` in `scenario-overrides.js`
- [ ] Add to `SUPPORTED_DEPARTMENTS` in `ScenarioOverridesPage.js`
- [ ] Test scenario loading in chat
- [ ] Test admin filtering by department
- [ ] Test scenario override for department
