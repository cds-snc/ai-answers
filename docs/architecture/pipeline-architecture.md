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
│              API Layer: /api/chat/chat-graph-run.js              │
│  • Entry point for graph execution                               │
│  • Streams status updates to client                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│            LangGraph State Machine (Server-Side)                 │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Graph Registry: agents/graphs/registry.js                │  │
│  │  • Manages available graph workflows                      │  │
│  │  • DefaultWithVectorGraph (primary)                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Graph Nodes (Sequential Pipeline)                        │  │
│  │  1. init          → Initialize state                      │  │
│  │  2. validate      → Short query validation                │  │
│  │  3. redact        → PI detection & redaction              │  │
│  │  4. translate     → Language detection & translation      │  │
│  │  5. contextNode   → Search & context derivation           │  │
│  │  6. shortCircuit  → Similar answer detection              │  │
│  │  7. answerNode    → Answer generation (if no shortcut)    │  │
│  │  8. verifyNode    → Citation URL verification             │  │
│  │  9. persistNode   → Save to database                      │  │
│  │  10. END          → Return result                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                          │
│  • MongoDB (DocumentDB): Persistence                             │
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
const workflow = new StateGraph({
  channels: graphState  // State annotations
})
  .addNode('init', initNode)
  .addNode('validate', validateNode)
  .addNode('redact', redactNode)
  .addNode('translate', translateNode)
  .addNode('contextNode', contextNode)
  .addNode('shortCircuit', shortCircuitNode)
  .addNode('answerNode', answerNode)
  .addNode('verifyNode', verifyNode)
  .addNode('persistNode', persistNode)
  .addEdge(START, 'init')
  .addEdge('init', 'validate')
  .addEdge('validate', 'redact')
  .addEdge('redact', 'translate')
  .addEdge('translate', 'contextNode')
  .addEdge('contextNode', 'shortCircuit')
  .addConditionalEdges(
    'shortCircuit',
    (state) => state.shortCircuitPayload ? 'persistNode' : 'answerNode'
  )
  .addEdge('answerNode', 'verifyNode')
  .addEdge('verifyNode', 'persistNode')
  .addEdge('persistNode', END);
```

### State Annotations

The graph maintains state across all nodes with these key fields:

```javascript
{
  chatId: string,              // Unique chat session ID
  userMessage: string,         // Original user input
  conversationHistory: array,  // Previous messages
  lang: string,                // UI language (en/fr)
  redactedText: string,        // Text after PI redaction
  translationData: object,     // Translation results
  context: object,             // Derived context (dept, topic, search results)
  shortCircuitPayload: object, // Similar answer data (if found)
  answer: object,              // Generated answer
  finalCitationUrl: string,    // Verified citation URL
  confidenceRating: number,    // Answer confidence (0-10)
  status: string,              // Current pipeline status
  result: object,              // Final result object
  startTime: number            // Pipeline start time
}
```

---

## Pipeline Execution Flow

For detailed step-by-step breakdown, see [`docs/pipeline.md`](../pipeline.md).

### 1. Initialization (`init` node)

**Purpose:** Set up timing and initial status

**Operations:**
- Record `startTime` for performance tracking
- Set initial status to `MODERATING_QUESTION`
- Initialize state fields

**File:** [`agents/graphs/DefaultWithVectorGraph.js:47-51`](../../agents/graphs/DefaultWithVectorGraph.js#L47-L51)

---

### 2. Short Query Validation (`validate` node)

**Type:** Programmatic (no AI)
**Status:** `MODERATING_QUESTION`

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

### 3. Pattern-Based Redaction (`redact` node)

**Type:** Programmatic + AI
**Status:** `MODERATING_QUESTION`

**Purpose:** Two-stage privacy protection

#### Stage 1: Pattern-Based Filtering (No AI)
- Profanity detection (badwords_en.txt, badwords_fr.txt)
- Threat detection (threats_en.txt, threats_fr.txt)
- Manipulation patterns (manipulation_en.json, manipulation_fr.json)
- Basic PII patterns: phone numbers, emails, 9-digit numbers

**File:** [`agents/graphs/services/redactionService.js`](../../agents/graphs/services/redactionService.js)

#### Stage 2: AI-Powered PII Detection
- Detects person names, personal IDs, US ZIP codes
- Uses GPT-4 mini with specialized prompt
- Replaces detected PII with `XXX`
- Blocks question if PII found

**Files:**
- Service: [`services/PIIAgentService.js`](../../services/PIIAgentService.js)
- Prompt: [`agents/prompts/piiAgentPrompt.js`](../../agents/prompts/piiAgentPrompt.js)

---

### 4. Translation (`translate` node)

**Type:** AI-powered (GPT-4 mini)
**Status:** `MODERATING_QUESTION`

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

### 5. Context Derivation (`contextNode`)

**Type:** AI-powered (multi-step)
**Status:** `MODERATING_QUESTION` → `GENERATING_ANSWER`

**Purpose:** Generate search query, execute search, identify department

#### Sub-steps:

**5a. Query Rewrite**
- Craft optimized search query from translated text
- Consider conversation history
- Model: GPT-4 mini

**5b. Search Execution**
- Execute search using Canada.ca or Google
- Configurable via `searchProvider` parameter
- Tools: `canadaCaContextSearch.js`, `googleContextSearch.js`

**5c. Department Matching**
- Match question to Government of Canada department
- Identify topic and relevant URLs
- Parse department code (e.g., `EDSC-ESDC`, `CRA-ARC`)
- Load department-specific scenarios if available

**5d. Context Reuse (Optimization)**
- Check if previous message has valid context
- Reuse if applicable (saves time and cost)
- Function: `getContextForFlow()`

**Files:**
- [`agents/graphs/services/contextService.js`](../../agents/graphs/services/contextService.js)
- [`services/ContextAgentService.js`](../../services/ContextAgentService.js)
- [`agents/prompts/contextSystemPrompt.js`](../../agents/prompts/contextSystemPrompt.js)

---

### 6. Short-Circuit Check (`shortCircuit` node)

**Type:** AI-powered (vector similarity + reranking)
**Status:** `GENERATING_ANSWER`

**Purpose:** Detect if a similar question was already answered

**Process:**
1. Generate embedding for current question
2. Search embeddings database for similar questions
3. Use reranker agent (GPT-4 mini) to score candidates
4. If high similarity match found (threshold met):
   - Set `shortCircuitPayload` with existing answer
   - Skip to `persistNode` (bypass answer generation)
5. Otherwise: proceed to `answerNode`

**Benefits:**
- Faster responses (no answer generation needed)
- Lower AI costs
- Consistent answers to similar questions

**File:** [`api/chat/chat-similar-answer.js`](../../api/chat/chat-similar-answer.js)

---

### 7. Answer Generation (`answerNode`)

**Type:** AI-powered (configurable model)
**Status:** `GENERATING_ANSWER`

**Purpose:** Generate answer using context and conversation history

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
**Status:** `VERIFYING_CITATION`

**Purpose:** Ensure citation URL is accessible

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

**File:** [`api/util/util-check-url.js`](../../api/util/util-check-url.js)

---

### 9. Persistence (`persistNode`)

**Type:** Database write
**Status:** `COMPLETE` or `NEED_CLARIFICATION`

**Purpose:** Save interaction to database and trigger evaluation

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
**Status:** `COMPLETE`

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

---

## Key Components

### Graph Registry

**File:** [`agents/graphs/registry.js`](../../agents/graphs/registry.js)

**Purpose:** Central registry for available graph workflows

**Available Graphs:**
- `DefaultWithVectorGraph`: Primary production workflow (includes short-circuit)
- Additional graphs can be registered for A/B testing or specialized use cases

**Usage:**
```javascript
import GraphRegistry from './agents/graphs/registry.js';
const graph = GraphRegistry.getGraph('DefaultWithVectorGraph');
```

---

### Agent Factory

**File:** [`agents/AgentFactory.js`](../../agents/AgentFactory.js)

**Purpose:** Creates configured AI agents with appropriate prompts and tools

**Agent Types:**
- `createPIIAgent()`: PII detection
- `createTranslationAgent()`: Language detection and translation
- `createQueryRewriteAgent()`: Search query optimization
- `createContextAgent()`: Department and context derivation
- `createChatAgent()`: Answer generation with tools

**Configuration:**
- Model selection (OpenAI, Azure, Anthropic)
- Temperature settings
- Token limits
- Tool availability

---

### Service Layer

**Key Services:**

| Service | Purpose | File |
|---------|---------|------|
| **PIIAgentService** | PII detection coordination | [`services/PIIAgentService.js`](../../services/PIIAgentService.js) |
| **ContextAgentService** | Context derivation coordination | [`services/ContextAgentService.js`](../../services/ContextAgentService.js) |
| **ScenarioOverrideService** | Department scenario loading | [`services/ScenarioOverrideService.js`](../../services/ScenarioOverrideService.js) |
| **EmbeddingService** | Vector embeddings for similarity | [`services/EmbeddingService.js`](../../services/EmbeddingService.js) |
| **AgentOrchestratorService** | Agent execution orchestration | [`agents/AgentOrchestratorService.js`](../../agents/AgentOrchestratorService.js) |

---

## State Management

### State Flow

```
User Question
    ↓
[init] → Initialize state with chatId, userMessage, lang
    ↓
[validate] → Validate query length
    ↓
[redact] → Add redactedText to state
    ↓
[translate] → Add translationData to state
    ↓
[contextNode] → Add context (department, topic, searchResults) to state
    ↓
[shortCircuit] → Set shortCircuitPayload if match found
    ↓
[answerNode OR skip] → Add answer to state
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

## Error Handling & Resilience

### Error Types

1. **Validation Errors** (recoverable)
   - Short query: Return fallback search URL
   - PII detected: Block with helpful message

2. **AI Service Errors** (retriable)
   - Exponential backoff (3 retries)
   - Fallback to alternative model if configured

3. **Search Errors** (degradable)
   - Try alternative search provider
   - Continue with limited context if search fails

4. **Citation Errors** (fallback)
   - Use search result URL
   - Use department URL
   - Use Canada.ca homepage

### Error Handling Strategy

```javascript
try {
  // Node execution
  const result = await nodeFunction(state);
  return result;
} catch (error) {
  if (error instanceof ValidationError) {
    // Return error state with fallback
    return { status: 'ERROR', result: fallback };
  }

  if (error instanceof AIServiceError && retryCount < 3) {
    // Retry with exponential backoff
    await sleep(2 ** retryCount * 1000);
    return retry(nodeFunction, state, retryCount + 1);
  }

  // Log and fail gracefully
  logger.error('Node execution failed', { error, state });
  throw error;
}
```

### Graceful Degradation

- **Search fails**: Use cached context or proceed with limited info
- **Translation fails**: Assume English and continue
- **Citation check fails**: Accept URL without validation
- **Answer generation fails**: Return error message with search link

---

## Performance Optimizations

### 1. Short-Circuit Optimization

- **Impact**: 40-60% of queries match similar questions
- **Savings**: ~3-5 seconds response time, ~$0.01 per query
- **Implementation**: Vector similarity search + AI reranking

### 2. Context Reuse

- **When**: Follow-up questions in same conversation
- **Logic**: Check if previous message has valid context
- **Savings**: ~2-3 seconds, ~$0.005 per query

### 3. Prompt Caching

- **OpenAI**: Automatic prompt caching for repeated prefixes
- **Anthropic**: Explicit cache control headers
- **Savings**: ~50% reduction in input token costs

### 4. Parallel Tool Execution

- Answer agent can call multiple tools concurrently
- Example: Download multiple web pages simultaneously
- Tracked by `ToolTrackingHandler`

### 5. Streaming Responses

- Server-Sent Events (SSE) for status updates
- User sees progress: "Searching...", "Generating answer..."
- Perceived performance improvement

### 6. Database Indexing

- Embeddings: Vector index for similarity search
- ChatId: Index for conversation lookup
- Timestamps: Index for analytics queries

---

## Deployment Modes

### CDS Mode (Default)
- Evaluation runs **asynchronously** after response sent
- Faster user response times
- Background worker processes evaluations

### Vercel Mode
- Evaluation runs **synchronously** before response
- Ensures evaluation completes
- Slightly slower response times

**Configuration:** `DEPLOYMENT_MODE` environment variable

---

## Monitoring & Observability

### Status Events

Emitted via SSE to client:

```javascript
{
  status: 'MODERATING_QUESTION',    // Initial validation
  status: 'GENERATING_ANSWER',      // Context and answer gen
  status: 'VERIFYING_CITATION',     // URL validation
  status: 'COMPLETE'                // Done
}
```

### Logging

- **Server Logging**: `ServerLoggingService` logs to MongoDB
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
- **[Pipeline Overview](../pipeline.md)**: Step-by-step pipeline breakdown with implementation links
- **[System Prompts](../agents-prompts/system-prompt-documentation.md)**: Complete AI agent prompts for all steps
- **[SYSTEM_CARD.md](../../SYSTEM_CARD.md)**: System card with safety measures and evaluation framework

### API Documentation
- See `docs/api/` for API endpoint documentation (when available)

### How-To Guides
- See `docs/how-to/` for developer guides (when available)

---

## Future Enhancements

### Planned Improvements

1. **Enhanced Short-Circuit**
   - Use short-circuit embeddings for answer generation
   - Hybrid retrieval: vector + keyword search

2. **Multi-Turn Context**
   - Persistent context across conversation
   - Context compression for long conversations

3. **Advanced Routing**
   - Route to specialized graphs based on question type
   - Department-specific graph variants

4. **Evaluation Integration**
   - Inline evaluation during answer generation
   - Real-time quality scoring
   - Automatic retry on low confidence

5. **Cache Optimization**
   - Shared cache across users for common questions
   - Redis cache layer for frequent queries

---

## Migration Notes

### From Microservices Architecture

The previous architecture used separate API endpoints chained together:

```
Old: /translate → /search-context → /chat-message
New: /chat-graph-run (single entry point, internal graph orchestration)
```

**Benefits of LangGraph:**
- **Single entry point**: Simpler client integration
- **Atomic execution**: All-or-nothing processing
- **Better error handling**: Centralized error recovery
- **Observability**: Complete state tracking
- **Testing**: Easier to test individual nodes

**Breaking Changes:**
- Legacy API endpoints still available for backward compatibility
- New clients should use `/api/chat/chat-graph-run.js`

---

## Development Guide

### Adding a New Node

1. **Define node function** in graph file or service:
```javascript
async function myNewNode(state) {
  // Process state
  const result = await processData(state);

  // Return updated state
  return {
    ...state,
    myNewField: result,
    status: 'PROCESSING'
  };
}
```

2. **Register node** in graph:
```javascript
workflow
  .addNode('myNewNode', myNewNode)
  .addEdge('previousNode', 'myNewNode')
  .addEdge('myNewNode', 'nextNode');
```

3. **Update state annotations**:
```javascript
const graphState = {
  // ... existing fields
  myNewField: Annotation.Root({
    default: () => null
  })
};
```

4. **Add tests**:
```javascript
describe('myNewNode', () => {
  it('should process state correctly', async () => {
    const state = { /* test state */ };
    const result = await myNewNode(state);
    expect(result.myNewField).toBeDefined();
  });
});
```

### Testing the Graph

**Unit tests**: Test individual nodes
```bash
npm test agents/graphs/__tests__/
```

**Integration tests**: Test full graph execution
```bash
npm test agents/graphs/DefaultWithVectorGraph.test.js
```

**Local execution**:
```bash
# Set environment variables
export MONGODB_URI="..."
export OPENAI_API_KEY="..."

# Run development server
npm run dev

# Test via API
curl -X POST http://localhost:3000/api/chat/chat-graph-run \
  -H "Content-Type: application/json" \
  -d '{"message": "How do I apply for EI?", "lang": "en"}'
```

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
