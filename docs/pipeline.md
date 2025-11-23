# AI Answers Pipeline

## Overview

The AI Answers pipeline is implemented as a **LangGraph state machine** that orchestrates a sequence of validation, processing, and answer generation steps. The pipeline combines both programmatic rule-based checks and AI-powered agents to provide accurate, verified responses to user queries.

**Main Graph Implementation:** [`agents/graphs/DefaultWithVectorGraph.js`](../agents/graphs/DefaultWithVectorGraph.js)

**Entry Points:**
- Traditional Chat API: [`api/chat/chat-message.js`](../api/chat/chat-message.js)
- Graph Execution API (recommended): [`api/chat/chat-graph-run.js`](../api/chat/chat-graph-run.js)

---

## Pipeline Steps

### 1. Short Query Validation
**Type:** Programmatic (no AI)
**Graph Status:** `MODERATING_QUESTION`

**Purpose:** Validates that queries contain sufficient context for meaningful search.

**Implementation:**
- **File:** [`agents/graphs/services/shortQuery.js`](../agents/graphs/services/shortQuery.js)
- **Function:** `validateShortQueryOrThrow()`
- **Logic:** Checks if current message has ≤2 words AND no previous long message in conversation history
- **Error Handling:** Throws `ShortQueryValidation` error with fallback to Canada.ca search
- **Graph Node:** `validate` node ([DefaultWithVectorGraph.js:53-63](../agents/graphs/DefaultWithVectorGraph.js#L53-L63))

---

### 2. Pattern-Based Redaction (Stage 1)
**Type:** Programmatic (no AI)
**Graph Status:** `MODERATING_QUESTION`

**Purpose:** Rule-based filtering for profanity, threats, manipulation patterns, and common PII patterns.

**Implementation:**
- **File:** [`agents/graphs/services/redactionService.js`](../agents/graphs/services/redactionService.js)
- **Class:** `RedactionService`
- **Patterns Detected:**
  - Profanity words (`badwords_en.txt`, `badwords_fr.txt`)
  - Threat words (`threats_en.txt`, `threats_fr.txt`)
  - Manipulation patterns (`manipulation_en.json`, `manipulation_fr.json`)
  - Basic PII: phone numbers, emails, 9-digit numbers
- **Method:** `redactText()` - replaces matched text with `#` symbols
- **Language Support:** English and French
- **Graph Node:** `redact` node ([DefaultWithVectorGraph.js:65-75](../agents/graphs/DefaultWithVectorGraph.js#L65-L75))

---

### 3. AI PII Agent (Stage 2)
**Type:** AI-powered (GPT-4 mini)
**Graph Status:** `MODERATING_QUESTION`

**Purpose:** AI-powered detection of personal information that slipped through Stage 1.

**Implementation:**
- **Service:** [`services/PIIAgentService.js`](../services/PIIAgentService.js)
- **Function:** `invokePIIAgent(agentType, request)`
- **Agent Factory:** [`agents/AgentFactory.js`](../agents/AgentFactory.js) → `createPIIAgent()`
- **Strategy:** [`agents/strategies/piiStrategy.js`](../agents/strategies/piiStrategy.js)
- **Prompt:** [`agents/prompts/piiAgentPrompt.js`](../agents/prompts/piiAgentPrompt.js)
- **API Endpoint:** [`api/chat/chat-pii-check.js`](../api/chat/chat-pii-check.js)
- **Model:** GPT-4 mini (configured in [`config/ai-models.js`](../config/ai-models.js))

**Detects:**
- Person names (real individuals)
- Personal IDs (SIN, visa IDs, account numbers)
- US ZIP codes

**Does NOT redact:**
- Building names with person names
- First Nation/Indigenous nation names
- Form references (T2202, GST524, etc.)
- Dollar amounts

**Returns:** `{ pii: string | null, blocked: boolean, model, inputTokens, outputTokens }`

**Graph Integration:** Called in `redact` node via `checkPII()` from [`agents/graphs/services/piiService.js`](../agents/graphs/services/piiService.js)

---

### 4. Translation AI Agent
**Type:** AI-powered (GPT-4 mini)
**Graph Status:** `MODERATING_QUESTION`

**Purpose:** Detects language and translates non-English queries to English for processing.

**Implementation:**
- **Service:** [`agents/graphs/services/translationService.js`](../agents/graphs/services/translationService.js)
- **Function:** `translateQuestion()`
- **Agent Factory:** `createTranslationAgent()` in [`agents/AgentFactory.js`](../agents/AgentFactory.js)
- **Strategy:** [`agents/strategies/translationStrategy.js`](../agents/strategies/translationStrategy.js)
- **Prompt:** [`agents/prompts/translationPrompt.js`](../agents/prompts/translationPrompt.js)
- **API Endpoint:** [`api/chat/chat-translate.js`](../api/chat/chat-translate.js)
- **Model:** GPT-4 mini

**Input:** Redacted text, desired language, translation context (previous user messages)

**Output:** `{ originalLanguage, translatedLanguage, translatedText, noTranslation: boolean }`

**Language Codes:** ISO 639-3 format (eng, fra, spa, etc.)

**Fallback:** If no translation needed, returns `noTranslation: true`

**Graph Node:** `translate` node ([DefaultWithVectorGraph.js:77-81](../agents/graphs/DefaultWithVectorGraph.js#L77-L81))

---

### 5. Search Query Generation AI Agent
**Type:** AI-powered (GPT-4 mini)
**Graph Status:** `MODERATING_QUESTION` → `GENERATING_ANSWER`

**Purpose:** Rewrites user query to improve search relevance and retrieval.

**Implementation:**
- **Service:** [`agents/graphs/services/contextService.js`](../agents/graphs/services/contextService.js)
- **Function:** `deriveContext()` uses `queryRewriteStrategy`
- **Agent Factory:** `createQueryRewriteAgent()` in [`agents/AgentFactory.js`](../agents/AgentFactory.js)
- **Strategy:** [`agents/strategies/queryRewriteStrategy.js`](../agents/strategies/queryRewriteStrategy.js)
- **Prompt:** [`agents/prompts/queryRewriteAgentPrompt.js`](../agents/prompts/queryRewriteAgentPrompt.js)
- **API Endpoint:** [`api/search/search-context.js`](../api/search/search-context.js)
- **Model:** GPT-4 mini

**Input:** Translated text, page language, referring URL, translation context history

**Output:** `{ query: string, systemPrompt?: string, model, inputTokens, outputTokens }`

**Features:** Performs exponential backoff for resilience

**Graph Node:** Part of `contextNode` ([DefaultWithVectorGraph.js:83-117](../agents/graphs/DefaultWithVectorGraph.js#L83-L117))

---

### 6. Context Derivation AI Agent
**Type:** AI-powered (multi-step)
**Graph Status:** `MODERATING_QUESTION` → `GENERATING_ANSWER`

**Purpose:** Identifies topic and department, executes search, and derives context for answer generation.

**Implementation:**

**Step 6a: Query Rewrite** (see Step 5 above)

**Step 6b: Search Execution**
- **Tools:**
  - Canada.ca Search: [`agents/tools/canadaCaContextSearch.js`](../agents/tools/canadaCaContextSearch.js)
  - Google Search: [`agents/tools/googleContextSearch.js`](../agents/tools/googleContextSearch.js)
- Configurable via `searchProvider` parameter

**Step 6c: Context Agent (Department/Topic Matching)**
- **Service:** [`services/ContextAgentService.js`](../services/ContextAgentService.js)
- **Function:** `invokeContextAgent(agentType, request)`
- **Agent Factory:** `createContextAgent()` in [`agents/AgentFactory.js`](../agents/AgentFactory.js)
- **Input:** Search results, message, system prompt, conversation history
- **Output:** Parsed XML tags:
  - `<topic>` - identified topic
  - `<topicUrl>` - relevant URL for topic
  - `<department>` - matched department
  - `<departmentUrl>` - department URL
- **Model:** Configurable (OpenAI, Azure, Anthropic, Cohere)

**Context Reuse Logic:**
- **Function:** `getContextForFlow()` ([defaultWithVectorHelpers.js:278](../agents/graphs/services/defaultWithVectorHelpers.js#L278))
- Checks if previous AI response in history has usable context
- If found and valid, reuses it with scenario override applied
- If not found, initiates full context derivation

**Graph Node:** `contextNode` ([DefaultWithVectorGraph.js:83-117](../agents/graphs/DefaultWithVectorGraph.js#L83-L117))

---

### 6.5. Department-Specific Scenarios (Optional)
**Type:** Configuration/Scenario Loading (no AI)
**Graph Status:** Applied during context derivation

**Purpose:** Loads department-specific system prompts and scenarios to enhance answer relevance.

**Implementation:**
- **Service:** [`services/ScenarioOverrideService.js`](../services/ScenarioOverrideService.js)
- **API Endpoint:** [`api/scenario/scenario-overrides.js`](../api/scenario/scenario-overrides.js)
- **Default Scenarios Directory:** [`agents/prompts/scenarios/`](../agents/prompts/scenarios/)

**Supported Departments:**
- CDS-SNC, CRA-ARC, ECCC, EDSC-ESDC, FIN, HC-SC, IRCC, ISED-ISDE, NRCan-RNCan, PSPC-SPAC, SAC-ISC, TBS-SCT

**Scenario Files:** `context-{dept}/dept-scenarios.js` (e.g., [`context-cra-arc/cra-arc-scenarios.js`](../agents/prompts/scenarios/context-cra-arc/cra-arc-scenarios.js))

**Features:**
- User-specific overrides cached in memory
- Override can replace system prompt for specific department
- Requires user authentication and proper role
- **Method:** `getActiveOverride(userId, departmentKey)`

**Graph Integration:** `applyScenarioOverride()` ([defaultWithVectorHelpers.js:192-212](../agents/graphs/services/defaultWithVectorHelpers.js#L192-L212))

---

### 7. Answer Generation AI Agent
**Type:** AI-powered (configurable model)
**Graph Status:** `GENERATING_ANSWER`

**Purpose:** Generates answer using context, conversation history, and department-specific scenarios.

**Implementation:**

**7a: Short-Circuit Check (Similar Answer Detection)**
- **Node:** `shortCircuit` ([DefaultWithVectorGraph.js:119-162](../agents/graphs/DefaultWithVectorGraph.js#L119-L162))
- **Function:** `checkSimilarAnswer()`
- **API Endpoint:** [`api/chat/chat-similar-answer.js`](../api/chat/chat-similar-answer.js)
- **Purpose:** Find similar previously-answered questions using vector matching
- **Process:**
  - Searches embeddings database for similar questions
  - Ranks candidates using reranker agent (GPT-4 mini)
  - If high-similarity match found, returns existing answer (short-circuits full generation)

**7b: Full Answer Generation (if no short-circuit)**
- **Node:** `answerNode` ([DefaultWithVectorGraph.js:164-174](../agents/graphs/DefaultWithVectorGraph.js#L164-L174))
- **Function:** `sendAnswerRequest()`
- **API Endpoint:** [`api/chat/chat-message.js`](../api/chat/chat-message.js)
- **Agent Factory:** `createChatAgent()` in [`agents/AgentFactory.js`](../agents/AgentFactory.js)
- **Model:** Configurable provider (OpenAI, Azure, Anthropic, Cohere)

**Input:**
- Conversation history
- Context (topic, department, search results)
- Language
- System prompt from scenario/context agent

**Output Parsing:** (in `parseAnswerResponse()`)
- `<answer>` block - main content
- `<citation-url>` - AI's citation URL
- `<citation-head>` - citation heading
- `<confidence>` - confidence rating (0-10)
- `<english-answer>` - English version if translated

**Special Answer Types:**
- `<not-gc>` - not government of Canada content
- `<pt-muni>` - provincial/municipal matter
- `<clarifying-question>` - needs clarification

**Available Tools:**
- Download Web Page: [`agents/tools/downloadWebPage.js`](../agents/tools/downloadWebPage.js)
- Check URL Status: [`agents/tools/checkUrlStatus.js`](../agents/tools/checkUrlStatus.js)
- Context Agent Tool: [`agents/tools/contextAgentTool.js`](../agents/tools/contextAgentTool.js)

**Tool Tracking:**
- **Handler:** [`agents/ToolTrackingHandler.js`](../agents/ToolTrackingHandler.js)
- Tracks all tool invocations and execution time
- Records in response metadata

---

### 8. Citation Verification
**Type:** Programmatic URL Validation
**Graph Status:** `VERIFYING_CITATION`

**Purpose:** Validates that citation URLs are accessible and return valid responses.

**Implementation:**
- **API Endpoint:** [`api/util/util-check-url.js`](../api/util/util-check-url.js)
- **Function:** `checkUrlWithMethod()`

**Methods:**
- Primary: HEAD request (faster, less bandwidth)
- Fallback: GET request (if HEAD fails)

**Checks:**
- Status code (200 = valid)
- Not known 404 (404.html detection)
- Follows up to 10 redirects
- Timeout: 10 seconds

**Output:** `{ isValid: boolean, url: string, status: number, confidenceRating: 0 | 1, error?: string }`

**Fallback:** If citation invalid, uses `fallbackUrl` from verification result or Canada.ca search result

**Graph Node:** `verifyNode` ([DefaultWithVectorGraph.js:176-194](../agents/graphs/DefaultWithVectorGraph.js#L176-L194))

---

### 9. Display to User (Final Response)
**Type:** Data aggregation and persistence
**Graph Status:** `COMPLETE` or `NEED_CLARIFICATION`

**Purpose:** Persists interaction to database and returns final response to user.

**Implementation:**
- **Graph Node:** `persistNode` ([DefaultWithVectorGraph.js:196-237](../agents/graphs/DefaultWithVectorGraph.js#L196-L237))
- **Function:** `persistInteraction()`
- **API Endpoint:** [`api/db/db-persist-interaction.js`](../api/db/db-persist-interaction.js)

**Database Persistence:**
- **Models:** Chat, Interaction, Context, Question, Citation, Answer, Tool
- **Embeddings Service:** [`services/EmbeddingService.js`](../services/EmbeddingService.js)
- Creates embeddings for future similarity matching
- Triggers background/foreground evaluation based on deployment mode

**Response Structure:**
```javascript
{
  answer: {
    content,
    answerType,
    paragraphs,
    sentences,
    citationUrl
  },
  context: {
    topic,
    department,
    searchResults,
    // ...
  },
  question: userMessage,
  citationUrl: finalCitationUrl,
  confidenceRating: number
}
```

**Metadata Tracked:**
- Response time
- Search provider used
- AI model used
- Tool usage
- Input/output tokens

**Streaming Response:**
- **File:** [`api/chat/chat-graph-run.js`](../api/chat/chat-graph-run.js)
- **Format:** Server-Sent Events (SSE)
- **Events:**
  - `status` - workflow step updates
  - `result` - final answer
  - `error` - any errors

---

## Graph Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        START                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                      ┌─────────────┐
                      │    init     │ (Initialize timing)
                      └──────┬──────┘
                             │
                             ▼
                      ┌─────────────┐
                      │  validate   │ Programmatic - Short Query Check
                      └──────┬──────┘
                             │
                             ▼
                      ┌─────────────┐
                      │   redact    │ Programmatic - Pattern Redaction
                      │             │ + AI - PII Detection (Stage 2)
                      └──────┬──────┘
                             │
                             ▼
                      ┌─────────────┐
                      │  translate  │ AI - Language Detection & Translation
                      └──────┬──────┘
                             │
                             ▼
                      ┌─────────────┐
                      │ contextNode │ AI - Query Rewrite
                      │             │ AI - Search & Context Derivation
                      │             │ Programmatic - Scenario Loading
                      └──────┬──────┘
                             │
                             ▼
                      ┌─────────────┐
                      │shortCircuit │ AI - Similar Answer Check
                      └──────┬──────┘
                             │
                    ┌────────┴────────┐
                    │                 │
        ┌───────────▼──────┐   ┌─────▼────────┐
        │  Similar Found?  │   │ No Similar?  │
        │  -> persistNode  │   │ -> answerNode│
        └──────────────────┘   └─────┬────────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │ answerNode  │ AI - Answer Generation
                              └──────┬──────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │ verifyNode  │ Programmatic - Citation Check
                              └──────┬──────┘
                                     │
                    ┌────────────────┴──────────────────┐
                    │                                   │
                    ▼                                   ▼
             ┌─────────────┐                     ┌─────────────┐
             │ persistNode │ Save to Database    │ persistNode │
             └──────┬──────┘                     └──────┬──────┘
                    │                                   │
                    └────────────────┬──────────────────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │     END     │ Return Response
                              └─────────────┘
```

---

## Key Services & Files

| Component | Type | File(s) |
|-----------|------|---------|
| **Graph Registry** | Registry | [`agents/graphs/registry.js`](../agents/graphs/registry.js) |
| **Default Graph** | LangGraph | [`agents/graphs/DefaultWithVectorGraph.js`](../agents/graphs/DefaultWithVectorGraph.js) |
| **Short Query Validation** | Service | [`agents/graphs/services/shortQuery.js`](../agents/graphs/services/shortQuery.js) |
| **Redaction** | Service | [`agents/graphs/services/redactionService.js`](../agents/graphs/services/redactionService.js) |
| **PII Detection** | Service | [`services/PIIAgentService.js`](../services/PIIAgentService.js) |
| **Translation** | Service | [`agents/graphs/services/translationService.js`](../agents/graphs/services/translationService.js) |
| **Context Derivation** | Service | [`agents/graphs/services/contextService.js`](../agents/graphs/services/contextService.js) |
| **Context Agent** | Service | [`services/ContextAgentService.js`](../services/ContextAgentService.js) |
| **Scenario Management** | Service | [`services/ScenarioOverrideService.js`](../services/ScenarioOverrideService.js) |
| **Similar Answer Check** | API | [`api/chat/chat-similar-answer.js`](../api/chat/chat-similar-answer.js) |
| **Citation Verification** | API | [`api/util/util-check-url.js`](../api/util/util-check-url.js) |
| **Persistence** | API | [`api/db/db-persist-interaction.js`](../api/db/db-persist-interaction.js) |
| **Agent Factory** | Factory | [`agents/AgentFactory.js`](../agents/AgentFactory.js) |
| **Agent Orchestrator** | Orchestrator | [`agents/AgentOrchestratorService.js`](../agents/AgentOrchestratorService.js) |

---

## AI Models Configuration

**File:** [`config/ai-models.js`](../config/ai-models.js)

**Configurable Models:**
- **OpenAI:** GPT-4 Turbo (full), GPT-4 mini (lighter tasks)
- **Azure OpenAI:** Azure deployments
- **Anthropic:** Claude 3.5 Haiku/Sonnet
- **Cohere:** Command XL Nightly

Temperature and token limits configured per model type.

---

## Deployment Modes

**Deployment Configuration:**
- **CDS** (default): Evaluation runs asynchronously after response
- **Vercel**: Evaluation runs synchronously before response

**Key Environment Variables:**
- `INTERNAL_API_URL` - Internal API base URL
- `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY`, `ANTHROPIC_API_KEY` - Provider keys
- `DEPLOYMENT_MODE` - CDS or Vercel

---

## State Management

**Graph State Annotations:**
```javascript
{
  chatId,              // Unique chat session ID
  userMessage,         // Original user input
  userMessageId,       // Message ID
  conversationHistory, // Previous messages
  lang,                // UI language (en/fr)
  department,          // Detected department
  referringUrl,        // Page URL user came from
  selectedAI,          // AI model to use
  translationF,        // Translation function
  searchProvider,      // Search provider (canada-ca/google)
  overrideUserId,      // Optional user override ID
  startTime,           // Pipeline start time
  redactedText,        // Text after redaction
  translationData,     // Translation results
  cleanedHistory,      // Sanitized conversation history
  context,             // Derived context (topic, dept, etc.)
  usedExistingContext, // Whether context was reused
  shortCircuitPayload, // Similar answer data
  answer,              // Generated answer
  finalCitationUrl,    // Verified citation URL
  confidenceRating,    // Answer confidence (0-10)
  status,              // Current pipeline status
  result              // Final result object
}
```

---

## Error Handling

Each step in the pipeline includes error handling:

1. **Validation Errors:** Thrown as custom error classes (e.g., `ShortQueryValidation`)
2. **AI Agent Errors:** Wrapped with exponential backoff retry logic
3. **Citation Errors:** Fallback to search result URL
4. **Database Errors:** Logged but don't block user response

**Error Logging:** [`lib/logger.js`](../lib/logger.js) provides structured logging throughout the pipeline.

---

## Testing

**Unit Tests:** Each service has corresponding test files in `__tests__` directories.

**Integration Tests:** Graph execution tests in [`agents/graphs/__tests__/`](../agents/graphs/__tests__/)

**Example Test Files:**
- [`agents/graphs/services/__tests__/shortQuery.test.js`](../agents/graphs/services/__tests__/shortQuery.test.js)
- [`agents/graphs/services/__tests__/redactionService.test.js`](../agents/graphs/services/__tests__/redactionService.test.js)

---

## Monitoring & Observability

**Token Tracking:** [`agents/ToolTrackingHandler.js`](../agents/ToolTrackingHandler.js)
- Tracks input/output tokens for all AI calls
- Records tool invocations and execution time

**Status Updates:** Graph emits status events at each step via SSE for real-time monitoring.

**Performance Metrics:** Start/end times tracked in graph state for response time analysis.
