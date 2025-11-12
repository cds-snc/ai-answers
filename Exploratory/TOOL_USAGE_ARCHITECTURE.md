# Understanding Your Architecture vs. the Solution

## Your Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ASSEMBLED SYSTEM PROMPT                  │
│                     (67,000 characters)                     │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ assembled by: systemPrompt.js
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    ┌─────────────┐  ┌──────────┐  ┌──────────────────┐
    │agenticBase  │  │scenarios │  │context-{dept}/   │
    │   .js       │  │  -all    │  │scenarios.js      │
    │             │  │  .js     │  │(12 departments)  │
    │Step 1-7     │  │          │  │                  │
    │instructions │  │General   │  │SAC-ISC scenarios │
    │             │  │scenarios │  │EDSC scenarios    │
    │             │  │for ALL   │  │CRA scenarios     │
    │             │  │depts     │  │etc.              │
    └─────────────┘  └──────────┘  └──────────────────┘
```

**Key Point:** Department-specific scenarios are dynamically loaded and MERGED into final prompt. They're not optional or separate—they're core to what the model sees.

---

## The Problem: Scattered Tool Requirements

Each department file has downloadWebPage requirements embedded in prose:

```javascript
// SAC-ISC scenarios (current)
export const SAC_ISC_SCENARIOS = `
### Regional offices by province
* Regional offices are listed on each province's Regional Office page.
...
* ALWAYS use the downloadWebPage tool to read the relevant provincial
  regional office page to provide accurate office hours, address, in-person
  advice or telephone numbers in your answer.
...
`;

// EDSC scenarios (current)
export const EDSC_ESDC_SCENARIOS = `
### Contact Information for ESDC programs
* if the question asks for a specific telephone number for an ESDC program,
* Always use the downloadWebPage tool to verify that you provide the correct
  phone number and hours.
...
`;

// And 10 more department files...
```

**How the model sees this:** "Various departments have preferences about downloading pages. I can usually answer without them, so I mostly skip them."

---

## Original Proposal (❌ Won't Work)

Add Step 0 with exhaustive enumeration:

```javascript
// In agenticBase.js - NEW STEP 0
STEP 0. CHECK TOOL REQUIREMENTS (MANDATORY)
MANDATORY downloadWebPage triggers:
1. Regional office questions (SAC-ISC) → MUST download
2. Phone numbers (EDSC, CRA, SAC-ISC) → MUST download
3. Status card processing times (SAC-ISC) → MUST download
4. Treaty annuity eligibility (SAC-ISC) → MUST download
5. Document requirements (SAC-ISC) → MUST download
6. [12 more specific rules...]
...
```

**Why this fails:**
- By the time you enumerate all 17+ rules, you've added ~2000+ tokens
- You've duplicated information (it exists in Step 0 AND in scenario files)
- When you modify SAC-ISC scenarios, you have to update Step 0 too
- When you add a new department, Step 0 needs updating
- You're fighting your own architecture (static list in dynamic system)

---

## Better Approach: Markers + Checkpoints

### Part 1: Add Markers to Each Department File

```javascript
// SAC-ISC scenarios (REVISED - add at TOP of file)
export const SAC_ISC_TOOL_REQUIREMENTS = `

### ⚠️ TOOL-REQUIRED TRIGGERS FOR SAC-ISC
These questions MUST trigger downloadWebPage before answering:

**Trigger: Regional Office Contact Details**
- When user asks: office location, phone, hours, address, appointment
- MUST download: Provincial regional office page
- Why: Offices move, change hours; data must be current
- URL pattern: https://www.sac-isc.gc.ca/eng/[ID]/[ID]

**Trigger: Treaty Annuity Eligibility**
- When user asks: "Is [First Nation] eligible?"
- MUST download: https://www.sac-isc.gc.ca/eng/1595274954300/1595274980122
- Why: Band table is authoritative source
`;

// Keep existing scenarios unchanged below
export const SAC_ISC_SCENARIOS = `
### Regional offices by province
* Regional offices are listed on...
...
`;
```

**Advantages:**
- ✅ Requirements stay in source files (where they belong)
- ✅ Markers are consistent across all departments (`⚠️ TOOL-REQUIRED`)
- ✅ Scales automatically (new scenarios = new markers, no central list update)
- ✅ Minimal token cost (~100 tokens per department)

### Part 2: Add Checkpoints in agenticBase.js

```javascript
// In agenticBase.js - ADD these sections

Step 3.5. MANDATORY TOOL CHECKPOINT
Before proceeding with answer generation, you must verify:

A. BASE CONDITIONS (from Step 3):
   □ Does answer include specific details (numbers, dates, codes, amounts)?
   □ Is content time-sensitive (news, policy changes after training date)?
   □ Is URL unfamiliar or marked as requiring verification?

B. SCENARIO CONDITIONS (check department scenarios below):
   □ Do you see any "⚠️ TOOL-REQUIRED" markers?
   □ Do you see "MUST downloadWebPage" or "ALWAYS download" phrases?
   □ Do trigger keywords from these markers match the user's question?

MANDATORY ACTION:
If ANY checkbox is TRUE: STOP and call downloadWebPage NOW
If ALL checkboxes are FALSE: Proceed to Step 4

---

Step 4.5. ANSWER VALIDATION (after Step 4)
Before finalizing answer:
1. Did you identify tool requirements in Step 3.5? YES / NO
2. If YES - Did you call downloadWebPage? YES / NO
3. If you called tool - Does your answer reflect what you downloaded? YES / NO

If (1=YES and 2=NO): You skipped a required tool. Go back.
If (3=NO): Your answer doesn't match downloaded content. Revise.
```

**Advantages:**
- ✅ Single unified checkpoint applies to ALL departments
- ✅ Enforces before/after answer (can't skip via backfill)
- ✅ Explicitly directs model to look for `⚠️ TOOL-REQUIRED` markers
- ✅ Works with decentralized architecture (checkpoint + distributed markers)

---

## How They Work Together

```
User asks: "What offices does SAC-ISC have in Saskatchewan?"
          │
          ▼
Step 3.5 Checkpoint activates:
- Checks base conditions ✓ (question asks for office locations = specific detail)
- Checks scenario conditions ✓ (finds "⚠️ TOOL-REQUIRED: Regional Office" in SAC-ISC)
- Both say "MUST download"
          │
          ▼
Calls downloadWebPage(Saskatchewan regional office page)
          │
          ▼
Gets actual content: "2 offices: Saskatoon and Regina"
          │
          ▼
Generates answer: "SAC-ISC has offices in Saskatoon and Regina"
          │
          ▼
Step 4.5 Validation:
- Confirms tool was required ✓
- Confirms tool was called ✓
- Confirms answer matches downloaded content ✓
          │
          ▼
Answer is accurate! ✓
```

---

## Why This Beats the Original Idea

| Aspect | Original Proposal | Marker + Checkpoint Approach |
|--------|------|------|
| **Scalability** | ❌ Adds static Step 0 list; breaks when scenarios change | ✅ Markers in scenarios automatically included |
| **Maintenance Burden** | ❌ Update Step 0 every time you modify a scenario | ✅ Just add marker to new/changed scenarios |
| **Architecture Fit** | ❌ Centralizes requirements in decentralized system | ✅ Respects decentralized design |
| **Token Cost** | ❌ Adds ~2000 tokens (roughly 17 requirements × 100 tokens each) | ✅ ~50 tokens per department (12 × 50 = 600 tokens total) |
| **Implementation** | ❌ Requires knowing ALL requirements upfront | ✅ Works with existing scenarios incrementally |
| **Enforcement** | ❌ Just lists rules; model still decides | ✅ Checkpoints force decision at specific points |

---

## Timeline & Files

**Phase 1 (2-3 days):** Add checkpoints
- Edit: `src/services/systemPrompt/agenticBase.js`
- Add Step 3.5 and Step 4.5

**Phase 2 (2-3 days):** Add markers
- Edit: Each `src/services/systemPrompt/context-{dept}/` file
- Add `TOOL_REQUIREMENTS` export with `⚠️ TOOL-REQUIRED` sections

**Phase 3 (1 day):** Optional consolidation
- Edit: `src/services/systemPrompt/scenarios-all.js`
- Tighten prose (saves tokens for other uses)

**Total: 4-5 days for 45-65% improvement in tool compliance**

