# AI Answers Pipeline Architecture

## Overview

AI Answers uses a **LangGraph-based state machine architecture** to orchestrate a multi-step pipeline that processes user questions through validation, translation, context derivation, and answer generation stages. This architecture ensures reliable, traceable, and auditable AI interactions.

**Last Updated:** November 2025

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [LangGraph State Machine](#langgraph-state-machine)
3. [Pipeline Execution Flow](#pipeline-execution-flow)
4. [Key Components](#key-components)
5. [State Management](#state-management)
6. [Error Handling & Resilience](#error-handling--resilience)
7. [Performance Optimizations](#performance-optimizations)
8. [Related Documentation](#related-documentation)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User/Browser                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (React)                              │
│  • Chat Interface                                                │
│  • SSE Status Updates                                            │
│  • Accessibility Features                                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              API Layer: /api/chat/chat-graph-run.js             │
│  • Entry point for graph execution                              │
│  • Streams status updates to client                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│            LangGraph State Machine (Server-Side)                │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Graph Registry: agents/graphs/registry.js                │  │
│  │  • Manages available graph workflows                      │  │
│  │  • DefaultWithVectorGraph (primary)                       │  │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Graph Nodes (Pipeline with Conditional Branching)       │  │
│  │  1. init          → Initialize state                      │  │
│  │  2. validate      → Short query validation                │  │
│  │  3. redact        → PI detection & question blocking      │  │
│  │  4. translate     → Language detection & translation      │  │
│  │  5. shortCircuit  → Similar answer detection              │  │
│  │     ├─ If match found: → verifyNode (skip context/answer) │  │
│  │     └─ If no match: → contextNode (continue flow)         │  │
│  │  6. contextNode   → Search & context derivation           │  │
│  │  7. answerNode    → Answer generation                     │  │
│  │  8. verifyNode    → Citation URL verification             │  │
│  │  9. persistNode   → Save to database                      │  │
│  │  10. END          → Return result                         │  │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                         │
│  • AWS DocumentDB: Persistence (MongoDB-compatible)             │
│  • AI Providers: OpenAI, Azure OpenAI, Anthropic                │
│  • Search: Canada.ca, Google                                    │
│  • Embedding Service: Vector similarity                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## LangGraph State Machine

### What is LangGraph?

LangGraph is a framework for building stateful, multi-actor applications with LLMs. It provides:
- **Nodes**: Individual processing steps
- **Edges**: Transitions between nodes (conditional or direct)
- **State**: Shared data structure passed between nodes
- **Persistence**: Optional state checkpointing

### Graph Definition

**File:** [`agents/graphs/DefaultWithVectorGraph.js`](../../agents/graphs/DefaultWithVectorGraph.js)

The graph is defined using the `StateGraph` class from `@langchain/langgraph`:

```javascript
const workflow = new StateGraph(GraphState)
  .addNode('init', initNode)
  .addNode('validate', validateNode)
  .addNode('redact', redactNode)
  .addNode('translate', translateNode)
  .addNode('shortCircuit', shortCircuitNode)
  .addNode('contextNode', contextNode)
  .addNode('answerNode', answerNode)
  .addNode('verifyNode', verifyNode)
  .addNode('persistNode', persistNode)
  .addEdge(START, 'init')
  .addEdge('init', 'validate')
  .addEdge('validate', 'redact')
  .addEdge('redact', 'translate')
  .addEdge('translate', 'shortCircuit')
  .addConditionalEdges(
    'shortCircuit',
    (state) => state.shortCircuitPayload ? 'skipAnswer' : 'runAnswer',
    {
      skipAnswer: 'verifyNode',
      runAnswer: 'contextNode'
    }
  )
  .addEdge('contextNode', 'answerNode')
  .addEdge('answerNode', 'verifyNode')
  .addEdge('verifyNode', 'persistNode')
  .addEdge('persistNode', END);
```

### State Annotations

The graph maintains state across all nodes with these key fields:

```javascript
{
  chatId: string,                // Unique chat session ID
  userMessage: string,           // Original user input
  userMessageId: string,         // Unique message ID
  conversationHistory: array,    // Previous messages
  cleanedHistory: array,         // Cleaned conversation history
  lang: string,                  // UI language (en/fr)
  department: string,            // Department code (if provided)
  referringUrl: string,          // Page URL where question was asked
  selectedAI: string,            // AI provider (openai, azure, anthropic)
  translationF: boolean,         // Translation function enabled
  searchProvider: string,        // Search provider (canadaCa, google)
  overrideUserId: string,        // Override user ID for special cases
  redactedText: string,          // Text after PI redaction
  translationData: object,       // Translation results
  context: object,               // Derived context (dept, topic, search results)
  usedExistingContext: boolean,  // Whether context was reused
  shortCircuitPayload: object,   // Similar answer data (if found)
  answer: object,                // Generated answer
  finalCitationUrl: string,      // Verified citation URL
  confidenceRating: number,      // Answer confidence (0-10)
  status: string,                // Current pipeline status (camelCase)
  result: object,                // Final result object
  startTime: number              // Pipeline start time (ms)
}
```

---

## Pipeline Execution Flow

### 1. Initialization (`init` node)

**Purpose:** Set up timing and initial status

**Operations:**
- Record `startTime` for performance tracking
- Set initial status to `moderatingQuestion`
- Initialize state fields

**File:** [`agents/graphs/DefaultWithVectorGraph.js:47-51`](../../agents/graphs/DefaultWithVectorGraph.js#L47-L51)

---

### 2. Short Query Validation (`validate` node)

**Type:** Programmatic (no AI)
**Status:** `moderatingQuestion`

**Purpose:** Block queries that are too short to be meaningful

**Logic:**
- Check if current message ≤2 words
- AND no previous long message in conversation history
- If both true: throw `ShortQueryValidation` error

**Error Response:**
- Returns fallback URL to Canada.ca search
- User receives helpful error message

**File:** [`agents/graphs/services/shortQuery.js`](../../agents/graphs/services/shortQuery.js)

---

### 3. Question Blocking (`redact` node)

**Type:** Programmatic + AI
**Status:** `moderatingQuestion`

**Purpose:** Two-stage privacy protection - detect PI and block questions containing it

#### Stage 1: Pattern-Based Blocking (No AI)
- Profanity detection → block question
- Threat detection → block question
- Manipulation patterns → block question
- Basic PI patterns (phone numbers, emails, 9-digit numbers) → block question

**File:** [`agents/graphs/services/redactionService.js`](../../agents/graphs/services/redactionService.js)

#### Stage 2: AI-Powered PI Detection
- AI detects person names, personal IDs, US ZIP codes
- Uses GPT-4 mini with specialized prompt
- Detected PI is marked with `XXX` to show user what was found
- Question is then blocked programmatically (blocked questions are never logged or processed)

**Files:**
- Service: [`services/PIIAgentService.js`](../../services/PIIAgentService.js)
- Prompt: [`agents/prompts/piiAgentPrompt.js`](../../agents/prompts/piiAgentPrompt.js)

---

### 4. Translation (`translate` node)

**Type:** AI-powered (GPT-4 mini)
**Status:** `moderatingQuestion`

**Purpose:** Detect language and translate to English for processing

**Process:**
- Detect original language (ISO 639-3 codes)
- Translate to English if needed
- Use conversation history for context on short queries
- Set `noTranslation: true` if already English

**Output:**
```javascript
{
  originalLanguage: 'fra',
  translatedLanguage: 'eng',
  translatedText: 'How do I apply for EI?',
  noTranslation: false
}
```

**File:** [`agents/graphs/services/translationService.js`](../../agents/graphs/services/translationService.js)

---

### 5. Short-Circuit Check (`shortCircuit` node)

**Type:** AI-powered (vector similarity + reranking)
**Status:** `generatingAnswer`

**Purpose:** Detect if a similar question was already answered (runs BEFORE context derivation)

**Process:**
1. Skip short-circuit if conversation already has prior AI replies
2. Generate embedding for current question
3. Search embeddings database for similar questions
4. Use reranker agent (GPT-4 mini) to score candidates
5. If high similarity match found (threshold met):
   - Set `shortCircuitPayload` with existing answer
   - Skip directly to `verifyNode` (bypass context and answer generation)
6. Otherwise: proceed to `contextNode`

**Benefits:**
- Faster responses (no context derivation or answer generation needed)
- Lower AI costs
- Consistent answers to similar questions

**File:** [`api/chat/chat-similar-answer.js`](../../api/chat/chat-similar-answer.js)

---

### 6. Context Derivation (`contextNode`)

**Type:** AI-powered (multi-step)
**Status:** `buildingContext` → `generatingAnswer`

**Purpose:** Generate search query, execute search, identify department

**Note:** This node is SKIPPED if short-circuit finds a matching answer

#### Sub-steps:

**6a. Query Rewrite**
- Craft optimized search query from translated text
- Consider conversation history
- Model: GPT-4 mini

**6b. Search Execution**
- Execute search using Canada.ca or Google
- Configurable via `searchProvider` parameter
- Tools: `canadaCaContextSearch.js`, `googleContextSearch.js`

**6c. Department Matching**
- Match question to Government of Canada department
- Identify topic and relevant URLs
- Parse department code (e.g., `EDSC-ESDC`, `CRA-ARC`)
- Load department-specific scenarios if available

**6d. Context Reuse (Optimization)**
- Check if previous message has valid context
- Reuse if applicable (saves time and cost)
- Function: `getContextForFlow()`

**Files:**
- [`agents/graphs/services/contextService.js`](../../agents/graphs/services/contextService.js)
- [`services/ContextAgentService.js`](../../services/ContextAgentService.js)
- [`agents/prompts/contextSystemPrompt.js`](../../agents/prompts/contextSystemPrompt.js)

---

### 7. Answer Generation (`answerNode`)

**Type:** AI-powered (configurable model)
**Status:** `generatingAnswer`

**Purpose:** Generate answer using context and conversation history (SKIPPED if short-circuit found match)

**Input:**
- Translated question
- Derived context (department, topic, search results)
- Conversation history
- Department-specific scenarios (if available)
- System prompt with instructions

**Available Tools:**
- `downloadWebPage`: Fetch and parse web page content
- `checkUrlStatus`: Validate URL accessibility
- `contextAgentTool`: Re-derive context if needed

**Output Parsing:**
- `<answer>` block: Main content (1-4 sentences)
- `<citation-url>`: AI's proposed citation
- `<citation-head>`: Citation heading
- `<confidence>`: Confidence rating (0-10)
- Special tags: `<not-gc>`, `<pt-muni>`, `<clarifying-question>`

**Files:**
- Entry: [`api/chat/chat-message.js`](../../api/chat/chat-message.js)
- Agent Factory: [`agents/AgentFactory.js`](../../agents/AgentFactory.js)
- Prompts: [`agents/prompts/`](../../agents/prompts/)

---

### 8. Citation Verification (`verifyNode`)

**Type:** Programmatic URL validation
**Status:** `verifyingCitation`

**Purpose:** Ensure citation URL is accessible and build final result object

**Process:**
1. Send HEAD request to URL (fast, low bandwidth)
2. If fails: try GET request
3. Follow up to 10 redirects
4. Timeout: 10 seconds
5. Check for known 404 pages

**Output:**
```javascript
{
  isValid: boolean,
  url: string,
  status: number,
  confidenceRating: 0 | 1,
  error?: string
}
```

**Fallback:**
- If invalid: use `fallbackUrl` or Canada.ca search

**File:** [`services/UrlValidationService.js`](../../services/UrlValidationService.js)

---

### 9. Persistence (`persistNode`)

**Type:** Database write
**Status:** `complete` or `needClarification`

**Purpose:** Save interaction to database and trigger evaluation (SKIPPED if short-circuit, as already persisted)

**Operations:**
1. Create embeddings via `EmbeddingService`
2. Save to database:
   - Chat
   - Interaction
   - Context
   - Question
   - Answer
   - Citation
   - Tool usage
3. Trigger evaluation (background or foreground based on deployment mode)

**Metadata Tracked:**
- Response time
- Search provider used
- AI model used
- Tool invocations
- Input/output tokens
- Confidence rating

**File:** [`api/db/db-persist-interaction.js`](../../api/db/db-persist-interaction.js)

---

### 10. Return Result (`END`)

**Type:** Response streaming
**Status:** `complete`

**Purpose:** Stream final result to client

**Response Format (SSE):**
```javascript
{
  answer: {
    content: string,
    answerType: string,
    paragraphs: array,
    sentences: array,
    citationUrl: string
  },
  context: {
    topic: string,
    department: string,
    departmentUrl: string,
    searchResults: array
  },
  question: string,
  citationUrl: string,
  confidenceRating: number,
  metadata: {
    responseTime: number,
    model: string,
    toolsUsed: array
  }
}
```

**File:** [`api/chat/chat-graph-run.js`](../../api/chat/chat-graph-run.js)

## State Management

### State Flow

```
User Question
    ↓
[init] → Initialize state with chatId, userMessage, lang
    ↓
[validate] → Validate query length
    ↓
[redact] → Detect PI, block question if found
    ↓
[translate] → Add translationData to state
    ↓
[shortCircuit] → Check for similar answer
    ├─ If match found: Set shortCircuitPayload → Skip to verifyNode
    └─ If no match: Continue to contextNode
    ↓
[contextNode] → Add context (department, topic, searchResults) to state
    ↓
[answerNode] → Add answer to state
    ↓
[verifyNode] → Set finalCitationUrl
    ↓
[persistNode] → Save and return result
    ↓
END
```

### State Mutations

Each node can:
- **Read** any field from state
- **Write** specific fields (defined in node implementation)
- **NOT modify** other nodes' outputs (ensures encapsulation)

### State Persistence

- State is **not persisted** between graph executions (stateless)
- Each user question triggers a new graph execution
- Conversation history passed as input, not stored in graph state

---

## Monitoring & Observability

### Status Events

Emitted via SSE to client:

```javascript
{
  status: 'moderatingQuestion',    // Initial validation
  status: 'buildingContext',       // Context derivation (if not short-circuited)
  status: 'generatingAnswer',      // Answer generation
  status: 'verifyingCitation',     // URL validation
  status: 'complete'               // Done (or 'needClarification' for clarifying questions)
}
```

### Logging

- **Server Logging**: `ServerLoggingService` logs to DocumentDB
- **Client Logging**: Error tracking and analytics
- **Tool Tracking**: `ToolTrackingHandler` logs all tool calls

### Metrics

Tracked per interaction:
- Total response time
- Time per node
- AI model used
- Input/output tokens
- Tool invocations
- Confidence rating
- Short-circuit hit/miss

---

## Related Documentation

### Core Documentation
- **[System Prompts](../agents-prompts/system-prompt-documentation.md)**: Complete AI agent prompts for all steps
- **[SYSTEM_CARD.md](../../SYSTEM_CARD.md)**: System card with safety measures and evaluation framework

### API Documentation
- See `docs/api/` for API endpoint documentation (when available)

### How-To Guides
- See `docs/how-to/` for developer guides (when available)

---

## Troubleshooting

### Common Issues

**1. Graph execution hangs**
- Check for infinite loops in conditional edges
- Verify all nodes return updated state
- Check for missing edge definitions

**2. State not persisting between nodes**
- Ensure node returns complete state object
- Check state annotation definitions
- Verify field names match

**3. AI service timeouts**
- Increase timeout in agent configuration
- Check network connectivity
- Verify API keys are valid

**4. Short-circuit not working**
- Check embedding service is running
- Verify vector database has embeddings
- Check similarity threshold settings

---

## Summary

The LangGraph-based architecture provides:

✅ **Reliability**: Deterministic execution with clear error handling
✅ **Observability**: Complete state tracking and logging
✅ **Performance**: Short-circuit optimization, context reuse, prompt caching
✅ **Maintainability**: Clear node boundaries, easy to extend
✅ **Scalability**: Stateless execution, horizontal scaling ready
✅ **Auditability**: Complete execution history for compliance

For questions or contributions, see the main [README.md](../../README.md).
