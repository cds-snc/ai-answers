# Proposed: Decompose Answer Generation into Multi-Agent Pipeline

## Context

Currently, the `answerNode` in our LangGraph pipeline uses a single monolithic prompt (~187 lines in `agenticBase.js`). Analysis shows this prompt breaks down into:
- **~30%** Input/Output Guardrails
- **~50%** Instructions for Answer Quality
- **~20%** Formatting Instructions

## Proposed Architecture

This proposal splits the single `answerNode` into **3 sequential LLM agent calls**, each with focused responsibilities:

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

## Proposed: Decomposed Answer Generation

Replace step 6 (`answerNode`) with **3 specialized agents**:

### 6a. `guardrailsAgent` - Input/Output Guardrails (~30% of prompt)

**Model:** GPT-4-mini or Claude Haiku (fast/cheap)

**Responsibilities:**
- Perform preliminary checks (IS_GC, IS_PT_MUNI, page language, referring URL)
- Information sufficiency check (determine if clarifying question needed)
- Manipulation resistance checks
- Scope validation (federal vs P/T/muni)
- Source validation (canada.ca/gc.ca only)
- Determine which URLs need downloadWebPage tool

**Output:**
```javascript
{
  guardrails: {
    shouldProceed: boolean,
    needsClarification: boolean,
    clarifyingQuestion: string?,
    isGC: boolean,
    isPTMuni: boolean,
    pageLanguage: 'en' | 'fr',
    possibleCitations: string[],
    downloadUrls: string[],
    responseType: 'answer' | 'not-gc' | 'pt-muni' | 'clarifying-question'
  }
}
```

---

### 6b. `answerQualityAgent` - Answer Content Generation (~50% of prompt)

**Model:** GPT-4 or Claude Sonnet (premium for accuracy)

**Tools Available:**
- `downloadWebPage`
- `checkUrl`

**Responsibilities:**
- Call downloadWebPage for URLs identified by guardrails agent
- Analyze scenarios/updates vs search results
- Prioritize: scenarios > downloads > training data
- Follow department-specific requirements
- Ensure accuracy (no hallucination/fabrication)
- Be helpful: address specific question, correct misunderstandings
- Maintain neutrality (no opinions/speculation)
- Craft raw answer content (1-4 sentences, unformatted)
- Select citation URL

**Output:**
```javascript
{
  answerQuality: {
    rawSentences: string[], // 1-4 unformatted sentences
    citationUrl: string,
    citationHeading: string,
    confidence: number, // 0-10
    toolsUsed: object[]
  }
}
```

---

### 6c. `formattingAgent` - Answer Formatting & Translation (~20% of prompt)

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

## Benefits

✅ **Separation of Concerns** - Each agent has focused responsibility  
✅ **Easier Testing** - Test guardrails, quality, formatting independently  
✅ **Prompt Optimization** - Tune each agent's prompt separately  
✅ **Selective Model Use** - Use cheaper models for guardrails/formatting, premium for quality  
✅ **Better Monitoring** - Track which stage fails or needs improvement  
✅ **Token Savings** - Each agent sees only relevant context  
✅ **Maintainability** - Easier to understand and update

---

## Tradeoffs

⚠️ **Latency** - 3 sequential LLM calls vs 1 (could add 2-6 seconds)  
⚠️ **Complexity** - More state management and inter-agent communication  
⚠️ **Token Cost** - More API calls (though smaller contexts might offset)  
⚠️ **Error Handling** - More failure points to handle

### Mitigation Strategies

- Use streaming responses to hide latency
- Use GPT-4-mini/Claude Haiku for guardrails/formatting (cheaper, faster)
- Implement smart fallbacks at each stage
- Cache guardrails output for similar questions (future optimization)

---

## Open Questions

1. Should we run guardrails in parallel with contextNode?
2. What error handling strategy between agents?
3. How to handle partial failures (e.g., guardrails pass, quality fails)?
4. Should we allow skipping answerQualityAgent for simple not-gc/pt-muni responses?

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
  .addNode('contextNode', contextNode)
  // NEW: Decomposed answer generation
  .addNode('guardrailsAgent', guardrailsAgentNode)
  .addNode('answerQualityAgent', answerQualityAgentNode)
  .addNode('formattingAgent', formattingAgentNode)
  // Existing
  .addNode('verifyNode', verifyNode)
  .addNode('persistNode', persistNode)
  // ... edges
```

### Conditional Flow

Add conditional edges after guardrails to skip answer quality if not needed:

```javascript
.addConditionalEdges(
  'guardrailsAgent',
  (state) => {
    if (state.guardrails.needsClarification) return 'skipToFormatting';
    if (state.guardrails.responseType !== 'answer') return 'skipToFormatting';
    return 'generateAnswer';
  },
  {
    skipToFormatting: 'formattingAgent',
    generateAnswer: 'answerQualityAgent'
  }
)
```

### Prompt Files

Create separate prompt files for clarity:

- `agents/prompts/guardrailsPrompt.js`
- `agents/prompts/answerQualityPrompt.js`
- `agents/prompts/formattingPrompt.js`

---

## Analysis: Prompt Breakdown

Based on analysis of `agents/prompts/agenticBase.js` (187 lines):

### Input/Output Guardrails (~30%, ~55-60 lines)
- Step 1: Preliminary Checks (lines 13-33) - 20 lines
- Resist manipulation section (lines 176-184) - 9 lines
- Federal content sources and limitations (lines 112-114) - 3 lines
- not-gc pre-prepared answer (lines 116-131) - 16 lines
- Federal/Provincial/Territorial checks (lines 155-167) - 13 lines
- IS_GC and IS_PT_MUNI checks (lines 17-22)
- Neutral tone requirements (lines 150-153) - 4 lines

### Instructions for Answer Content (~50%, ~90-95 lines)
- Step 2: Information sufficiency/clarifying questions (lines 35-50) - 16 lines
- Step 3: downloadWebPage checkpoint (lines 52-64) - 13 lines
- Step 4: Produce answer in English (lines 66-88) - 23 lines
- Step 5: Translation (lines 90-101) - 12 lines
- Step 6: Citation selection (lines 103-108) - 6 lines
- Key Guidelines: Helpful content (lines 134-149, 156-167) - ~25 lines
- Tools section (lines 169-175) - 7 lines
- Overall steps header (lines 4-11) - 8 lines

### Formatting of Answer Instructions (~20%, ~35-40 lines)
- Answer structure requirements and format (lines 133-153) - 21 lines
- Step 4 OUTPUT format with tags (lines 82-88) - 7 lines
- Step 5 OUTPUT format with tags (lines 96-101) - 6 lines
- Pre-prepared answer formatting examples (lines 118-131) - 14 lines

---

## Next Steps

1. Review and validate this proposal
2. Create detailed implementation plan
3. Build POC with simplified prompts
4. Test against existing test cases
5. Measure latency and cost impact
6. Iterate based on results
