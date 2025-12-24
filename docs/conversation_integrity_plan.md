# Conversation Integrity Implementation Plan

## Overview
This document outlines the plan to establish a trust relationship between the client-side `conversationHistory` and the server, ensuring that the history sent by the client has not been tampered with. We will use an HMAC-SHA256 signature mechanism.

## Goals
- **Integrity**: Ensure `conversationHistory` received by the server matches the state previously signed by the server.
- **Graceful Failure**: If a mismatch occurs, the system should reject the request gracefully.
- **Middleware Layer**: Implement the core verification and signing logic as Express middleware.
- **Infrastructure Consistency**: Ensure new secrets are properly managed in Terragrunt and GitHub Actions.

## Security Mechanism (H₀ / H₁ Transitions)

The trust relationship is based on a state-machine model where the server validates the current state ($H_0$) and provides the next signed state ($H_1$).

### Concrete Turn-by-Turn Example

To illustrate, let's walk through a conversation between a User and the AI.

#### 🏁 Turn 0: Initial Request
The user starts a new conversation.
- **Client Sends:**
    - `message`: "What is the weather?"
    - `conversationHistory`: `[]` (Empty)
    - `historySignature`: `null`
- **Server Actions:**
    1. Sees history is empty, skips validation.
    2. Generates Answer: "It's sunny."
    3. Calculates **$H_1$**: `HMAC("user:What is the weather?|ai:It's sunny.")`
- **Server Returns:**
    - `content`: "It's sunny."
    - `historySignature`: `H1_HASH_STRING`

#### 🔄 Turn 1: Second Turn (Follow-up)
The user asks a follow-up question.
- **Client Sends:**
    - `message`: "Is it hot?"
    - `conversationHistory`: `[{sender: 'user', text: 'What is the weather?'}, {sender: 'ai', text: "It's sunny."}]`
    - `historySignature`: `H1_HASH_STRING` (This is $H_0$ for this turn)
- **Server Actions:**
    1. **Verification**: Serializes the received `conversationHistory` and checks if `HMAC(History)` equals `H1_HASH_STRING`.
    2. **Success**: Proceed to generate Answer: "Yes, about 30 degrees."
    3. **New State**: Calculates **$H_2$**: `HMAC("user:What is the weather?|ai:It's sunny.|user:Is it hot?|ai:Yes, about 30 degrees.")`
- **Server Returns:**
    - `content`: "Yes, about 30 degrees."
    - `historySignature`: `H2_HASH_STRING` (This becomes the new $H_1$ for the client)

#### 🛡️ Tamper Scenario (Turn 1)
Imagine a malicious user tries to change their first question to "What is the secret code?" in their local history before sending Turn 1.
- **Client Sends:**
    - `message`: "Is it hot?"
    - `conversationHistory`: `[{sender: 'user', text: 'What is the secret code?'}, {sender: 'ai', text: "It's sunny."}]`
    - `historySignature`: `H1_HASH_STRING`
- **Server Verification Failure:**
    - Server calculates `HMAC("user:What is the secret code?|ai:It's sunny.")`.
    - The result **will not match** `H1_HASH_STRING`.
    - **Result**: Server returns `403 Forbidden - invalid_signature`.

### Why this is Secure
-   **Secret Key Storage**: The HMAC secret is only known to the server. The client cannot forge a signature.
-   **No Rewriting**: If a user modifies a previous message in their local storage to influence the LLM's context, the $H_0$ verification will fail because the serialised data will no longer match the signature.
-   **Chain of Trust**: Each turn builds on the signature of the previous turns, ensuring the entire conversation remains immutable.

## Architecture

The integrity logic follows a **Service-Oriented** pattern, but is **globally enforced** via the chat session middleware.

### 1. Integrity Service (`services/ConversationIntegrityService.js`)
Centralizes all cryptographic math:
-   `calculateSignature(history)`: Deterministically serializes and signs history with HMAC-SHA256.
-   `verifyHistory(history, signature)`: Compares a received signature against a fresh calculation.
-   **Security**: Uses the `CONVERSATION_INTEGRITY_SECRET` provided via environment variables.

### 2. Session Middleware Integration (`middleware/chat-session.js`)
Integrity is now **baked into `withSession`**:
-   Any endpoint using the `withSession` wrapper automatically projects against history tampering.
-   **Mechanism**: If `req.method` is `POST` and `conversationHistory` is present, `withSession` validates the `historySignature` before executing the route handler.
-   **Enforcement**: Returns a `403 Forbidden` if the signature is missing (for non-empty history) or invalid.

### 3. Backend Implementation (Protected Routes)
The following endpoints are protected by default because they use `withSession`:

#### [chat-message.js](file:///c:/Users/hymary/repos/ai-answers/api/chat/chat-message.js)
-   **Verification**: Automatic via `withSession`.
-   **Signing**: Still manual in the handler to compute the *new* $H_1$ signature after generating a response.

#### [chat-similar-answer.js](file:///c:/Users/hymary/repos/ai-answers/api/chat/chat-similar-answer.js)
-   **Verification**: Automatic via `withSession`.
-   **Signing**: If a similar answer is found, computes and returns the signature for the new history state.

#### [chat-graph-run.js](file:///c:/Users/hymary/repos/ai-answers/api/chat/chat-graph-run.js)
-   **Verification**: Automatic via `withSession`. Supports nested `input` payload.
-   **Signing**: Computes and returns the signature in the SSE `result` event.

### 4. Frontend Implementation (`src/services/AnswerService.js`)
-   Automatically extracts the last signature from the previous turn's AI message and attaches it to the current request.
-   Ensures compatibility across all workflows (standard LLM, vector matches, and graphs).

## Infrastructure Changes

To support the new `CONVERSATION_INTEGRITY_SECRET`, the following components have been updated:

### Terragrunt / Terraform
-   **[ssm.tf](file:///c:/Users/hymary/repos/ai-answers/terragrunt/aws/ssm/ssm.tf)**: Added `aws_ssm_parameter.conversation_integrity_secret`.
-   **[ecs.tf](file:///c:/Users/hymary/repos/ai-answers/terragrunt/aws/ecs/ecs.tf)**: Mapped `CONVERSATION_INTEGRITY_SECRET` to the ECS container.

### GitHub Workflows
-   Updated staging and production Terraform workflows to pass the secret from GitHub Repository Secrets to the deployment pipelines.

## Verification Plan

### Automated
-   Unit tests for `ConversationIntegrityService`.

### Manual
1.  **Turn Chain**: Verify Turn 0 → Turn 1 moves forward successfully.
2.  **Vector Shortcut**: Take a "similar answer" path and verify the *next* follow-up question is still accepted (proving the similar answer was correctly signed).
3.  **Tampering**: Modify history in Redux/State and verify the server rejects the next request.
