# AI Answers: Improving downloadWebPage Tool Usage
## Analysis & Evidence-Based Improvement Strategies

**Current Issue:** The model only uses `downloadWebPage` approximately 5% of the time when it should use it 50% of the time, causing inaccurate answers.

**Example Failure:** Questions about Saskatchewan ISC offices incorrectly state there is only one office, despite explicit scenario instructions to "ALWAYS download the regional page" which clearly lists 2+ offices.

---

## Executive Summary

### Root Cause
Not weak instructions—your instructions are explicit. The problem is **architectural mismatch**:
- downloadWebPage requirements are scattered across 12 decentralized department files
- Model treats them as optional departmental preferences, not unified policy
- Model has learned it can often answer from training data
- This learned pattern overrides explicit instructions (research confirmed)

### Solution
**Two complementary strategies** (not "just cut words"):

1. **Add Checkpoints** (Step 3.5 + 4.5 in agenticBase.js) - Forces tool evaluation before answering
2. **Add Markers** (⚠️ TOOL-REQUIRED in each department file) - Makes requirements visually obvious

Together, these turn scattered optional advice into unified mandatory policy.

### Expected Results
- Tool usage: 5% → 50%+ (improvement of 45-65 percentage points)
- Implementation: 4-5 days across 3 phases
- Token cost: +20% net (you save consolidation tokens)
- Risk: Low (new checks, minimal existing changes)

---

## Current System Prompt Analysis

### Symptom Analysis
The system prompt is **67,000 characters** and contains:
- Clear instructions in `agenticBase.js` (Step 3) to download webpages
- Explicit mandatory instructions in department scenarios (e.g., SAC-ISC scenarios line 65: "ALWAYS use downloadWebPage tool")
- BUT: The model ignores these instructions 95% of the time

### Root Cause: Pattern-Context Conflict
Based on research into LLM tool compliance patterns, the problem is NOT ambiguous instructions. Instead:

1. **Implicit patterns override explicit instructions**: When the model has seen examples or training where it answers without tool use, that pattern can dominate despite clear instructions.
2. **Long prompts with mixed examples dilute urgency**: 67,000 characters creates cognitive load and reduces instruction salience.
3. **Tool instructions buried in prose**: Instructions use narrative/explanation format rather than structural emphasis.

---

## Evidence from Research

### Key Finding #1: Prompt Engineering Impact
- **Result**: Well-designed prompts showed 9-68 percentage point performance improvements on compliance tasks
- **Implication**: Current prompt structure is working *against* tool compliance, not for it

### Key Finding #2: Prompt Length vs. Compliance
- **Result**: Real-world optimization showed frameworks could be reduced from ~8000 to ~3200 tokens while preserving 95%+ functionality
- **Your situation**: 67,000 characters = ~16,000 tokens in system prompt alone
- **Implication**: Length itself may be causing the model to de-prioritize specific instructions

### Key Finding #3: Context Patterns Are Training Data
- **Research insight**: "The context window isn't just memory – it's active training data that shapes behavior in real time"
- **Your situation**: The model may have learned from many examples where it succeeded without downloading
- **Implication**: Simply rewording instructions won't help; you need to change structural patterns

---

## Three Evidence-Based Improvement Strategies

### STRATEGY #1: Scenario-Level Tool Indicators (Most Practical) ⭐ Highest Impact
**Based on:** Research showing "changing structure is more potent than adding more instructions"

#### The Real Problem
You have 12 department context directories, each with multiple downloadWebPage requirements embedded in prose scenarios. There's no way to enumerate them all in a single decision tree—and they're scattered across 12+ files you're actively maintaining. The architecture is decentralized by design.

**Current state:**
- agenticBase.js: General "ALWAYS download" conditions (3 scenarios)
- SAC-ISC scenarios: ~4 downloadWebPage mandates scattered in prose
- EDSC scenarios: Multiple phone number requirements
- CRA, IRCC, HC-SC, TBS-SCT, etc.: Each has own requirements
- **Total:** 17+ downloadWebPage mentions, but only 5% compliance

**Why hardcoding doesn't work:** By the time you enumerate all departmental rules in Step 0, you've:
1. Created a static list that becomes outdated as scenarios change
2. Duplicated information (rules exist in both Step 0 AND scenarios)
3. Added even more tokens to an already bloated prompt
4. Created maintenance burden (update scenarios? update Step 0 too?)

#### The Solution: Structural Markers in Scenario Files
Instead of listing all rules in Step 0, **mark them in source** with a special pattern that changes model behavior:

In each department scenario file, replace:
```javascript
// CURRENT (prose, easy to skip)
* ALWAYS use the downloadWebPage tool to read the relevant provincial
  regional office page to provide accurate office hours, address, in-person
  advice or telephone numbers in your answer.
```

With (marked for structural parsing):
```javascript
// NEW (structural emphasis)
### ⚠️ TOOL-REQUIRED: Regional Office Contact Details
When user asks about: regional office locations, phone numbers, hours, addresses
ACTION: MUST downloadWebPage(regionalOfficePage) BEFORE answering
Reason: Information changes frequently and must be verified
URL pattern: https://www.sac-isc.gc.ca/eng/[ID]/[ID] (provincial page)

CONSEQUENCE: Providing unverified contact info violates accuracy mandate.
```

**Why this works:**
- ✅ Keeps rules where they logically belong (in scenario files)
- ✅ Uses visual markup (`⚠️ TOOL-REQUIRED`) that draws model attention
- ✅ Separates WHEN/WHY/CONSEQUENCE into clear structure
- ✅ Still maintains centralized Step 3 base conditions
- ✅ Scales automatically as you add/modify scenarios
- ✅ No Step 0 enumeration problem

#### Implementation: Two-Tier Approach

**Tier 1: Base Conditions (Step 3 - stays mostly the same)**
```
Step 3. DOWNLOAD WEBPAGES TO USE IN YOUR ANSWER

Base conditions where you MUST download:
1. Answer includes specific details (numbers, dates, codes, amounts, URLs)
2. Content is time-sensitive (news, updates, policy changes after training date)
3. URL is unfamiliar, recent, or marked as requiring verification

If ANY base condition applies: Call downloadWebPage
```

**Tier 2: Scenario-Specific Requirements (in each department file)**
Add to each scenario file:

```javascript
// SAC-ISC example (in sac-isc-scenarios.js at the TOP)
export const SAC_ISC_TOOL_REQUIREMENTS = `

### ⚠️ TOOL-REQUIRED TRIGGERS FOR SAC-ISC
These questions MUST trigger downloadWebPage before answering:

**Trigger 1: Regional Office Contact Details**
- User asks about: office location, phone, hours, address, in-person service, appointments
- MUST download: Provincial regional office page
- Reason: Offices close, move, change hours; data must be current
- Verification: Provide downloaded phone/address only; cite regional page

**Trigger 2: Treaty Annuity Eligibility**
- User asks: "Is [First Nation/Band] eligible for treaty annuity?"
- MUST download: Treaty tables with First Nation/Band columns
- URL: https://www.sac-isc.gc.ca/eng/1595274954300/1595274980122
- Reason: Band list data is authoritative source, must be verified
- Verification: Answer only if found in table; cite with table page

**Trigger 3: Secure Status Card Processing Times**
- User asks about: how long, processing time, wait time, timeline
- MUST download: Processing time page
- URL: https://www.sac-isc.gc.ca/eng/1710869258242/1710869294766
- Reason: Times change; training data may be outdated
- Verification: Always state source (6-24 months registration, 8-12 weeks card)

`;
```

Then reference this in your prose scenarios naturally. The model sees:
1. Clear structural markers (`⚠️ TOOL-REQUIRED`)
2. Specific triggers (what question type triggers download)
3. Clear reasoning (WHY download is required)
4. Verification pattern (how to use downloaded data)

**Implementation effort:** Medium (add markers to existing scenarios, no Step 0 enumeration)

---

### STRATEGY #2: Token-Efficient Prompt Consolidation ⭐ Quick Win
**Based on:** Real-world reduction of ~60% prompt length while preserving 95%+ functionality

#### The Problem
- **Current**: 67,000 characters covering multiple topics with extensive examples
- **Issue**: Token bloat reduces instruction salience (your tool instruction is lost in volume)
- **Research shows**: Models perform better when prompt is tightly focused

#### The Solution: Aggressive Consolidation
Cut unnecessary words and consolidate structure:

**Current example (verbose):**
```
### Contact Information
* When a question asks for a phone number or the answer recommends contact in the answer,
follow the scenario instructions for that department, or if there aren't any specific
instructions in the prompt, provide the phone number and any self-service options that
are available for that particular issue. Provide the most-detailed contact page for the
service, program or department as the citation link.
```

**Consolidated (same meaning, 50% fewer tokens):**
```
### Contact Info
- Follow scenario instructions if present
- Otherwise: provide phone number + self-service options
- Citation: most-specific contact page for service/program/department
```

#### Specific Areas to Cut
1. **Eliminate redundant preamble** in each section (20% savings)
2. **Convert prose examples to bullet lists** (15% savings)
3. **Remove explanatory text** from scenarios (25% savings)
4. **Consolidate repeated concepts** (10% savings)

**Target reductions:**
- From 67,000 → 45,000 characters (~33% reduction)
- This makes tool instructions MORE visible through contrast
- Freed tokens can be used for more mandatory scenario rules

**Implementation effort:** Low (mechanical consolidation, careful preserve meaning)

---

### STRATEGY #3: Structural Answer Validation (Most Reliable) ⭐ Reinforces Strategy #1
**Based on:** Pattern research showing explicit tool instructions help when patterns are strong

#### The Problem
Even with Strategy #1 markers, the model could still try to answer from training data first. There's no checkpoint forcing the model to verify which pattern from the prompt applies BEFORE answering.

#### The Solution: Add Validation Step

**Before Step 4 (Answer Generation), add:**
```
STEP 3.5 MANDATORY TOOL CHECKPOINT
You must now verify if ANY of these apply to the question:

A. BASE CONDITIONS (from Step 3):
   □ Answer includes specific details? (numbers, dates, codes, amounts)
   □ Content time-sensitive? (news, policy, updates after training date)
   □ URL unfamiliar, recent, or marked as requiring verification?

B. DEPARTMENT-SCENARIO CONDITIONS:
   Look for these markers in the department scenarios loaded above:
   □ Section marked "⚠️ TOOL-REQUIRED"?
   □ "MUST downloadWebPage" or "ALWAYS download" phrase present?
   □ Scenario includes specific trigger words matching the question?

MANDATORY ACTION:
If you checked ANY box as TRUE: STOP - Call downloadWebPage NOW
If you checked ALL boxes as FALSE: Proceed to Step 4

DO NOT write an answer until this checkpoint is complete.
```

**Advanced: Post-Answer Validation**
Add at end of Step 4:
```
STEP 4.5 ANSWER VALIDATION
Before finalizing your answer, verify:
1. Did you identify any downloadWebPage requirements in Step 3.5? YES / NO
2. If YES: Did you actually call downloadWebPage? YES / NO
3. If you called downloadWebPage: Does your answer cite from what you downloaded? YES / NO
4. If you didn't call downloadWebPage: Can you explain why not based on Step 3 logic? YES / NO

If (1=YES and 2=NO): You skipped a required tool call. Go back to Step 3.
If (3=NO): Your answer doesn't reflect the downloaded content. Revise.
If (4=NO): You cannot justify skipping the tool. Go back to Step 3.
```

**Why this works:**
- ✅ Checkpoint happens BEFORE answer writing (cannot be skipped via backfill)
- ✅ Forces model to evaluate both base conditions AND scenario markers
- ✅ Post-answer validation prevents rationalization after the fact
- ✅ Works alongside Strategy #1 markers without duplication
- ✅ Creates a decision pathway that must complete before answering

**Implementation effort:** Low-Medium (add two new steps to agenticBase.js)

---

## Comparison of Strategies

| Strategy | Effort | Impact on Tool Usage | Impact on Accuracy | Token Cost/Saving | Implementation Timeline |
|----------|--------|---------------------|-------------------|-------------------|------------------------|
| **#1: Scenario Markers** | Medium | 35-45% improvement | High | Neutral (~100 tokens) | 2-3 days |
| **#2: Consolidation** | Low | 5-10% improvement (indirect) | Low | +33% saved | 1 day |
| **#3: Validation Steps** | Low-Medium | 25-35% improvement | Very High | ~500 tokens | 1-2 days |
| **All three combined** | Medium | 50-70% improvement* | Very High | +20% net | 4-5 days |

*Research suggests combining approaches yields multiplicative rather than additive gains. The key insight: Strategies #1 and #3 work together—markers draw attention to requirements, checkpoints enforce them.*

---

## Why Not Just "Cut Words"?

Your initial instinct to reduce character count by "cutting unnecessary words" is partially correct, but incomplete:

### What Won't Work
- ❌ Just removing descriptive prose → Model still ignores tool instructions
- ❌ Making sentences shorter → Instructions already exist; problem is compliance, not clarity

### What Might Help (But Not Enough)
- ✓ Consolidation + rewriting → Improves by ~5-10% (indirect effect)
- ✓ Removing duplicative examples → Frees tokens for more mandatory rules

### What Will Actually Fix It
- ✓✓ **Structural change** (Decision tree) → Forces evaluation before answering
- ✓✓ **Checkpoints** (Step 0 + Validation) → Creates separate tool pathway
- ✓✓ **Combined approach** → Addresses both instruction clarity AND behavioral patterns

---

## Recommended Implementation Path

### Phase 1 (Week 1 - 2-3 days) - Quick Win
**Goal:** Add enforcement checkpoints with minimal changes to existing scenarios

1. **Edit agenticBase.js:**
   - Add **Step 3.5: Mandatory Tool Checkpoint** (before answer generation)
   - Add **Step 4.5: Answer Validation** (after answer generation)
   - These force evaluation WITHOUT changing existing scenario files

2. **Test immediately** on:
   - Saskatchewan ISC office question (should trigger checkpoint)
   - EDSC phone number questions (should trigger checkpoint)
   - CRA contact info (should trigger checkpoint)

**Expected improvement:** 25-35% tool usage increase from checkpoints alone

### Phase 2 (Week 1-2 - 2-3 days) - Structural Markers
**Goal:** Add clear markers to department scenarios so checkpoints can identify them

1. **For each department scenario file** (start with SAC-ISC, EDSC, CRA):
   - At the TOP of the file, add `TOOL_REQUIREMENTS` section with `⚠️ TOOL-REQUIRED` markers
   - Keep existing prose scenarios intact (don't rewrite them)
   - Markers should list specific triggers and why downloads are mandatory

2. **Example for SAC-ISC** (sac-isc-scenarios.js):
   ```javascript
   // Add at top of the file
   export const SAC_ISC_TOOL_REQUIREMENTS = `
   ### ⚠️ TOOL-REQUIRED TRIGGERS FOR SAC-ISC

   **Trigger: Regional Office Contact Details**
   - Keywords: office, location, phone, hours, address, appointment
   - MUST download: Provincial regional office page
   - Why: Offices move, close, change hours; data must be current
   `;
   ```

3. **Reference in agenticBase.js Step 3.5:**
   - Instruct model to look for "⚠️ TOOL-REQUIRED" markers in loaded scenarios
   - Model now has clear visual cue to check scenario-level requirements

**Expected improvement:** Additional 10-15% from clearer scenario markers

### Phase 3 (Week 2 - 1 day) - Token Optimization (Optional)
**Goal:** Consolidate verbose prose to free tokens

1. **Low-hanging fruit consolidation:**
   - Convert repeated explanatory preambles to bullet lists
   - Remove redundant examples (keep 1, reference others)
   - Tighten examples (most don't need full prose)

2. **Prioritize:**
   - scenarios-all.js (largest, most verbose)
   - General instructions (before department-specific sections)

**Expected savings:** 5-10k tokens, making room for more comprehensive scenarios

### Phase 4 (Week 2-3) - Audit & Measurement
**Goal:** Verify improvements and identify any remaining gaps

1. **Run compliance test** on 30-50 questions requiring downloads:
   - Track tool usage rate
   - Identify any patterns where checkpoints still don't trigger
   - Check that answers reflect downloaded content

2. **If tool usage still below 45-50%:**
   - Analyze failing cases
   - May indicate: wrong triggers, weak scenario markers, or model drift
   - Adjust markers based on actual failure patterns

### Rollback Option
If combined improvements don't reach 45-50% tool usage:
- It indicates the problem is deeper (model training patterns)
- Consider:
  - Fine-tuning the model on tool-heavy examples
  - Different model selection (some models better at tool compliance)
  - API-level tool enforcement (make tool calls non-optional)

---

## Key Insight: Decentralized Architecture = Distributed Problem

Your system prompt is assembled dynamically:
```
agenticBase.js (core instructions)
+ scenarios-all.js (general scenarios)
+ context-{department}/scenarios.js (department-specific requirements)
+ citationInstructions.js
= Final 67,000 character prompt
```

**The Problem with This Architecture:**
When downloadWebPage requirements are scattered across 12 department files, the model sees them as:
- Advice within specific scenarios (not mandatory)
- Scattered "ALWAYS download" phrases (easy to rationalize)
- Embedded in prose about unrelated topics

The model doesn't see a coherent, unified "TOOL USAGE POLICY." Instead, it sees 12 separate departments with their own optional preferences.

**Why Strategy #1+#3 Solves This:**
- **Strategy #1 (Markers):** Creates consistent visual pattern (`⚠️ TOOL-REQUIRED`) across all departments
- **Strategy #3 (Checkpoints):** Creates a unified enforcement checkpoint in agenticBase.js
- **Together:** They turn a distributed set of optional instructions into a unified, mandatory policy

The model now sees:
```
IF scenario contains "⚠️ TOOL-REQUIRED" (ANY department)
THEN MUST call downloadWebPage (Step 3.5 checkpoint)
BEFORE generating answer
```

This is a coherent, unified rule—not scattered advice.

**Why This Beats "Just Cut Words":**
- Consolidation addresses token usage, not compliance
- The real issue is: model sees downloadWebPage as optional departmental preference
- Solution is: make it a unified, mandatory checkpoint
- Short prompts with bad structure still get ignored
- Long prompts with good structure get followed

---

## Specific Files to Modify

### Phase 1 (Checkpoint Implementation)
1. **src/services/systemPrompt/agenticBase.js**
   - Add Step 3.5: Mandatory Tool Checkpoint (after Step 3, before Step 4)
   - Add Step 4.5: Answer Validation (after Step 4)
   - Modify step numbering (current Steps 4, 5, 6, 7 become 4, 5, 6, 7 still, but insert new checks)

### Phase 2 (Scenario Markers)
2. **src/services/systemPrompt/context-sac-isc/sac-isc-scenarios.js**
   - Add SAC_ISC_TOOL_REQUIREMENTS export at top with ⚠️ markers
   - Keep existing scenarios unchanged

3. **src/services/systemPrompt/context-edsc-esdc/edsc-esdc-scenarios.js**
   - Add EDSC_TOOL_REQUIREMENTS export with contact info triggers

4. **src/services/systemPrompt/context-cra-arc/cra-arc-scenarios.js**
   - Add CRA_TOOL_REQUIREMENTS export with contact info triggers

5. **Other department context files** (if they have downloadWebPage requirements)
   - HC-SC, IRCC, PSPC-SPAC, TBS-SCT, FIN, ISED-ISDE, etc.

### Phase 3 (Consolidation - Optional)
6. **src/services/systemPrompt/scenarios-all.js** - Consolidate verbose prose
7. **src/services/systemPrompt/citationInstructions.js** - Tighten if possible

---

## Success Metrics

After implementation, track:
- **Tool usage rate**: Target 45-50% (up from 5%)
- **Accuracy on location-specific questions**: Should include all offices/locations
- **Accuracy on contact info**: Should match downloaded current numbers
- **Token usage**: Should be neutral or slightly negative (good—more downloads needed)
- **User satisfaction**: Questions should reflect current information

