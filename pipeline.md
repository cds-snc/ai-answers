# AI Answers Pipeline Flow

This document outlines the main processing pipeline in `ChatPipelineService.js` that handles user questions from start to finish.

## Pipeline Stages

### 1. **Moderating Question** (`MODERATING_QUESTION`)
- Validates query length (blocks queries ≤2 words if no previous long queries exist)
- Performs content redaction to block profanity, threats, manipulation, and personal information
- Throws `RedactionError` if blocked content detected
- Throws `ShortQueryValidation` if query too short

### 2. **Context Derivation** (`GETTING_CONTEXT` - not displayed)
- Checks conversation history to determine if context can be reused
- If last response wasn't a question: reuses context from last AI message
- If initial question or last response was a question: calls `ContextService.deriveContext()`
- Context includes department detection and relevant background information

### 3. **Searching** (`SEARCHING` - handled in ContextService)
- Searches for relevant government content using selected search provider
- Retrieves current information from Canada.ca and federal government sites

### 4. **Generating Answer** (`GENERATING_ANSWER`)
- Calls `AnswerService.sendMessage()` to generate AI response
- Uses selected AI service (Azure OpenAI GPT models in production)
- Incorporates context, conversation history, and user question
- Returns structured answer with citation URL and answer type

### 5. **Verifying Citation** (`VERIFYING_CITATION`)
- Only runs for normal answer types (not questions)
- Validates citation URL accessibility and relevance
- Uses `urlToSearch.validateAndCheckUrl()` to verify links
- Provides fallback search URL if citation invalid
- Records confidence rating for citation quality

### 6. **Moderating Answer** (`MODERATING_ANSWER` - status defined but not used)
- Placeholder for potential answer content filtering

### 7. **Updating Datastore** (`UPDATING_DATASTORE` - not displayed)
- Persists complete interaction to database via `DataStoreService.persistInteraction()`
- Includes question, answer, context, citation, timing, and metadata
- Records response time and search provider used

## Status Updates Sent to UI

The pipeline only sends specific status updates to the frontend:
- `MODERATING_QUESTION` → "Assessing question"
- `SEARCHING` → Search progress  
- `GENERATING_ANSWER` → "Thinking..."
- `VERIFYING_CITATION` → "Testing citation link"
- `ERROR` → Error state
- `NEED_CLARIFICATION` → When AI asks follow-up questions

## Error Handling

- **RedactionError**: Blocked content detected (profanity, PI, etc.)
- **ShortQueryValidation**: Query too short without conversation context
- Pipeline logs all steps and errors for monitoring and debugging

## Response Structure

Final response includes:
- `answer`: AI-generated response with citation
- `context`: Derived context used for generation  
- `question`: Original user question
- `citationUrl`: Validated citation URL or fallback
- `confidenceRating`: Citation quality score