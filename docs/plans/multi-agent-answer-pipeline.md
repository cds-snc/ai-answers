# Proposed: Decompose Answer Generation into Multi-Agent Pipeline

## Context

Currently, the `answerNode` in our LangGraph pipeline uses a single monolithic prompt (~187 lines in `agenticBase.js`). Analysis shows this prompt breaks down into:
- **~30%** Input/Output Guardrails
- **~50%** Instructions for Answer Quality
- **~20%** Formatting Instructions

## Proposed Architecture

This proposal adds **1 pre-context agent** and replaces the single `answerNode` with **3 post-context agents**, each with focused responsibilities.

---

## Current Pipeline (Base: DefaultGraph)

1. `init` - Initialize state
2. `validate` - Short query validation
3. `redact` - PI detection & redaction
4. `translate` - Language detection & translation
5. `contextNode` - Search & context derivation
6. **`answerNode`** ← *Currently monolithic, propose to split*
7. `verifyNode` - Citation URL verification
8. `persistNode` - Save to database
9. `END` - Return result

---

## Proposed Pipeline (4 New Agent Nodes)

1. `init` - Initialize state
2. `validate` - Short query validation
3. `redact` - PI detection & redaction
4. `translate` - Language detection & translation
5. **`manipulationGuardrailsAgent`** ← *NEW: Pre-context guardrails*
6. `contextNode` - Search & context derivation
7. **`scopeGuardrailsAgent`** ← *NEW: Post-context scope validation*
8. **`answerAgent`** ← *NEW: Content generation*
9. **`formattingAgent`** ← *NEW: Structure & translation*
10. `verifyNode` - Citation URL verification
11. `persistNode` - Save to database
12. `END` - Return result

---

## New Agent Nodes Detail

### 5. `manipulationGuardrailsAgent` - Pre-Context Guardrails

**Position:** BEFORE contextNode  
**Model:** GPT-4-mini or Claude Haiku (fast/cheap)

**Purpose:** Early exit for invalid questions before expensive context derivation

**Responsibilities:**
- Manipulation detection (role change, style requests, personal conversation)
- Political/partisan content detection
- Translation request detection (out of scope)
- Code injection attempts
- False premise detection (political)

**Input:**
- Translated question text
- Referring URL
- Conversation history

**Output:**
```javascript
{
  manipulationGuardrails: {
    isManipulative: boolean,
    manipulationType: string?, // 'politics', 'role-change', 'translation-request', etc.
    shouldProceed: boolean,
    responseType: 'continue' | 'not-gc'
  }
}
```

**Early Exit:** If `isManipulative` or `responseType === 'not-gc'`:
- Skip contextNode, scopeGuardrailsAgent, answerAgent
- Go directly to formattingAgent with pre-prepared not-gc response

**Benefits:**
- Saves context derivation costs (~20-30% of blocked questions)
- Faster rejection response (~2-3s faster)
- No search API calls for invalid questions

---

### 7. `scopeGuardrailsAgent` - Post-Context Scope Validation

**Position:** AFTER contextNode  
**Model:** GPT-4-mini or Claude Haiku (fast/cheap)

**Purpose:** Validate scope and determine response type using full context

**Responsibilities:**
- Perform preliminary checks (PAGE_LANGUAGE, CONTEXT_REVIEW, POSSIBLE_CITATIONS)
- Refined IS_GC check (with department info from context)
- IS_PT_MUNI determination
- Information sufficiency check (clarifying question needed?)
- Source validation (canada.ca/gc.ca only)
- Determine which URLs need downloadWebPage tool

**Input:**
- Translated question text
- Context (department, topic, search results)
- Referring URL
- Conversation history
- `manipulationGuardrails` output

**Output:**
```javascript
{
  scopeGuardrails: {
    isGC: boolean, // Refined with context
    isPTMuni: boolean,
    needsClarification: boolean,
    clarifyingQuestion: string?,
    pageLanguage: 'en' | 'fr',
    possibleCitations: string[],
    downloadUrls: string[],
    responseType: 'answer' | 'not-gc' | 'pt-muni' | 'clarifying-question'
  }
}
```

**Conditional Flow:** 
- If `responseType !== 'answer'` → Skip answerAgent, go to formattingAgent
- If `responseType === 'answer'` → Continue to answerAgent

---

### 8. `answerAgent` - Answer Content Generation

**Position:** AFTER scopeGuardrailsAgent (conditional)  
**Model:** GPT-4 or Claude Sonnet (premium for accuracy)

**Tools Available:**
- `downloadWebPage`
- `checkUrl`

**Responsibilities:**
- Call downloadWebPage for URLs identified by scopeGuardrailsAgent
- Analyze scenarios/updates vs search results
- Prioritize: scenarios > downloads > training data
- Follow department-specific requirements
- Ensure accuracy (no hallucination/fabrication)
- Be helpful: address specific question, correct misunderstandings
- Maintain neutrality (no opinions/speculation)
- Craft raw answer content (1-4 sentences, unformatted)
- Select citation URL
- Handle questions about the AI itself (respond with scope limitations)

**Input:**
- Translated question text
- Context (department, topic, search results)
- `scopeGuardrails` output
- Conversation history
- Downloaded page content (if applicable)

**Output:**
```javascript
{
  answer: {
    rawSentences: string[], // 1-4 unformatted sentences
    citationUrl: string,
    citationHeading: string,
    confidence: number, // 0-10
    toolsUsed: object[]
  }
}
```

---

### 9. `formattingAgent` - Answer Formatting & Translation

**Position:** AFTER answerAgent (or directly after guardrails for early exits)  
**Model:** GPT-4-mini or Claude Haiku (fast/cheap)

**Responsibilities:**
- Validate sentence count (1-4 max)
- Validate word count per sentence (4-18 words)
- Apply XML tag structure (`<s-1>`, `<s-2>`, `<s-3>`, `<s-4>`)
- Wrap in special tags based on response type:
  - `<not-gc>` for out-of-scope questions
  - `<pt-muni>` for provincial/territorial matters
  - `<clarifying-question>` for clarifications
- Create final `<english-answer>` block
- Translate to target language if needed (create `<answer>` block)
- Preserve exact structure during translation
- Use pre-prepared responses for not-gc/pt-muni

**Input:**
- `scopeGuardrails` or `manipulationGuardrails` output (responseType)
- `answerQuality` output (if available)
- Target language

**Output:**
```javascript
{
  formattedAnswer: {
    englishAnswer: string, // Fully formatted XML
    translatedAnswer: string?, // If translation needed
    finalCitationUrl: string,
    citationHeading: string,
    confidence: number
  }
}
```

---

## Pipeline Flow Diagram

```
User Question
     │
     ▼
┌─────────┐   ┌──────────┐   ┌────────┐   ┌───────────┐
│  init   │──▶│ validate │──▶│ redact │──▶│ translate │
└─────────┘   └──────────┘   └────────┘   └───────────┘
                                                │
                                                ▼
                              ┌─────────────────────────────────────┐
                              │ manipulationGuardrailsAgent         │
                              │ (Pre-Context: manipulation, politics)│
                              └─────────────────────────────────────┘
                                       │
                          ┌────────────┴────────────┐
                          │                         │
                    isManipulative?           shouldProceed?
                          │                         │
                          ▼                         ▼
                   ┌────────────┐            ┌─────────────┐
                   │ formatting │            │ contextNode │
                   │   Agent    │            └─────────────┘
                   │ (not-gc)   │                   │
                   └────────────┘                   ▼
                          │         ┌─────────────────────────────────────┐
                          │         │ scopeGuardrailsAgent                │
                          │         │ (Post-Context: IS_GC, PT_MUNI,      │
                          │         │  clarifying questions)              │
                          │         └─────────────────────────────────────┘
                          │                        │
                          │           ┌────────────┴────────────┐
                          │           │                         │
                          │    responseType               responseType
                          │    !== 'answer'               === 'answer'
                          │           │                         │
                          │           ▼                         ▼
                          │    ┌────────────┐         ┌──────────────────┐
                          │    │ formatting │         │ answerAgent│
                          │    │   Agent    │         └──────────────────┘
                          │    └────────────┘                   │
                          │           │                         ▼
                          │           │                  ┌────────────┐
                          │           │                  │ formatting │
                          │           │                  │   Agent    │
                          │           │                  └────────────┘
                          │           │                         │
                          ▼           ▼                         ▼
                   ┌─────────────────────────────────────────────────┐
                   │                    verifyNode                   │
                   └─────────────────────────────────────────────────┘
                                          │
                                          ▼
                   ┌─────────────────────────────────────────────────┐
                   │                   persistNode                   │
                   └─────────────────────────────────────────────────┘
                                          │
                                          ▼
                                         END
```

---

## Benefits

✅ **Early Exit Optimization** - Block manipulation/politics BEFORE expensive context derivation  
✅ **Separation of Concerns** - Each agent has focused responsibility  
✅ **Easier Testing** - Test each guardrail/quality/formatting stage independently  
✅ **Prompt Optimization** - Tune each agent's prompt separately  
✅ **Selective Model Use** - Use cheaper models for guardrails/formatting, premium for quality  
✅ **Better Monitoring** - Track which stage fails or needs improvement  
✅ **Token Savings** - Each agent sees only relevant context  
✅ **Maintainability** - Easier to understand and update  
✅ **Cost Savings** - Skip context for ~20-30% of blocked questions

---

## Tradeoffs

⚠️ **Latency** - 4 LLM calls vs 1 (mitigated by early exits and cheaper models)  
⚠️ **Complexity** - More state management and inter-agent communication  
⚠️ **Token Cost** - More API calls (offset by smaller contexts and early exits)  
⚠️ **Error Handling** - More failure points to handle

### Mitigation Strategies

- Use streaming responses to hide latency
- Use GPT-4-mini/Claude Haiku for guardrails/formatting (cheaper, faster)
- Implement smart fallbacks at each stage
- Early exits save more than added agent cost for blocked questions

---

## Open Questions

1. What percentage of questions are blocked by manipulation guardrails? (measure potential savings)
2. Should we cache manipulation checks for repeated similar questions?
3. What error handling strategy between agents?
4. How to handle partial failures (e.g., scopeGuardrails pass, answerQuality fails)?
5. Should pre-context guardrails run in parallel with redact/translate?

---

## Implementation Considerations

### State Management

Each agent would add its output to the graph state:

```javascript
const workflow = new StateGraph(GraphState)
  .addNode('init', initNode)
  .addNode('validate', validateNode)
  .addNode('redact', redactNode)
  .addNode('translate', translateNode)
  // NEW: Pre-context guardrails
  .addNode('manipulationGuardrails', manipulationGuardrailsAgentNode)
  .addConditionalEdges(
    'manipulationGuardrails',
    (state) => state.manipulationGuardrails.shouldProceed ? 'continue' : 'earlyExit',
    {
      continue: 'contextNode',
      earlyExit: 'formattingAgent'
    }
  )
  // Existing context derivation
  .addNode('contextNode', contextNode)
  // NEW: Post-context decomposed answer generation
  .addNode('scopeGuardrails', scopeGuardrailsAgentNode)
  .addConditionalEdges(
    'scopeGuardrails',
    (state) => state.scopeGuardrails.responseType === 'answer' ? 'generateAnswer' : 'skipToFormatting',
    {
      generateAnswer: 'answerAgent',
      skipToFormatting: 'formattingAgent'
    }
  )
  .addNode('answerAgent', answerAgentNode)
  .addNode('formattingAgent', formattingAgentNode)
  // Existing post-processing
  .addNode('verifyNode', verifyNode)
  .addNode('persistNode', persistNode)
  // ... edges
```

### Prompt Files

Create separate prompt files for clarity:

- `agents/prompts/manipulationGuardrailsPrompt.js`
- `agents/prompts/scopeGuardrailsPrompt.js`
- `agents/prompts/answerQualityPrompt.js`
- `agents/prompts/formattingPrompt.js`

---

## Analysis: Prompt Breakdown

Based on analysis of `agents/prompts/agenticBase.js` (187 lines):

### Pre-Context Guardrails (~15%)
- Resist manipulation section (lines 176-184) - 9 lines
- Politics/partisan detection
- Translation request detection
- Role change/style request detection
- Code injection detection

### Post-Context Scope Guardrails (~15%)
- Step 1: Preliminary Checks (lines 13-33) - 20 lines
- IS_GC and IS_PT_MUNI refined checks (lines 17-22)
- Information sufficiency (lines 35-50) - clarifying questions
- Federal/Provincial/Territorial checks (lines 155-167) - 13 lines

### Answer Quality Instructions (~50%, ~90-95 lines)
- Step 3: downloadWebPage checkpoint (lines 52-64) - 13 lines
- Step 4: Produce answer in English (lines 66-88) - 23 lines
- Step 6: Citation selection (lines 103-108) - 6 lines
- Key Guidelines: Helpful content (lines 134-149) - ~15 lines
- Neutral tone requirements (lines 150-153) - 4 lines
- Federal content sources and limitations (lines 112-114) - 3 lines
- Tools section (lines 169-175) - 7 lines

### Formatting Instructions (~20%, ~35-40 lines)
- Answer structure requirements and format (lines 133-144) - 12 lines
- Step 4 OUTPUT format with tags (lines 82-88) - 7 lines
- Step 5: Translation (lines 90-101) - 12 lines
- Step 5 OUTPUT format with tags (lines 96-101) - 6 lines
- not-gc pre-prepared answer (lines 116-131) - 16 lines
- pt-muni tag wrapping instructions

---

## Next Steps

1. Review and validate this proposal
2. Measure current manipulation/blocked question rate
3. Create detailed implementation plan
4. Build POC with simplified prompts for each agent
5. Test against existing test cases
6. Measure latency and cost impact
7. Iterate based on results
