# Conversation Integrity Implementation Plan

## Remediation status (November 2026)

A vulnerability report found four ways to defeat the design below. They share one
root cause: the server signed a normalized summary of the history but consumed the
raw client objects. The fix ships as two PRs. **Where this section and the original
plan below disagree, this section is current.**

| Finding | Problem | Fixed in |
|---|---|---|
| AIA-002 | Only the prefix up to the signed turn was verified, but the whole history was consumed, so a client could append forged turns | PR 1 |
| AIA-005 | The graph error path signed `[...client history, user message]` and returned it, so anyone could get a history signed | PR 1 |
| AIA-019 (integrity part) | Missing secret fell back to a hardcoded value | PR 1 |
| AIA-011 | Normalization signs only the text inside `<answer>` and drops whole tag blocks, so the rest of a signed turn can be changed | PR 2 |
| AIA-024 | `interaction.context` is unsigned but reused by `DefaultWithVectorGraph` and `InstantAndQAGraph` | PR 2 |

### PR 1 — what changed (no signature format change)

- **The server consumes only verified history.** `verifySignedPrefix` returns the
  verified part as `history`, and `validateConversationIntegrity` replaces
  `input.conversationHistory` with it. Dropped: anything after the signed turn, error
  messages, and unanswered questions. A history that is not an array, or holds only
  error messages, becomes `[]`.
- **Unanswered questions are left out of the signature as well as the history**
  (`signedMessages`). Otherwise a failed question followed by a successful one would
  make every later turn fail verification, because the server signs without the
  failed question but the client keeps sending it.
- **Dropped AI turns are logged** (counts only) as `[Integrity] Dropped unverified AI turns`.
- **A question that never got an answer is dropped, not signed.** After an unexpected
  failure the client keeps the question bubble in history. It no longer feeds
  translation context, similar-answer matching or the short-query check on the next
  turn. The user still sees it on screen and can keep chatting.
- **History with no AI turn and no signature is treated as empty**, so a new message
  after a first-turn failure goes through. Unsigned history that contains an AI turn
  is still rejected with `403 missing_signature`.
- **The error path never signs.** `chat-graph-run.js` returns no `historySignature`
  on an error event.
- **No fallback secret.** Without `CONVERSATION_INTEGRITY_SECRET` the server refuses
  to start (`assertConfigured()` in `server/server.js`), unless `NODE_ENV` is
  `development` or `test`, where a random per-process secret is used. An unset
  `NODE_ENV` counts as deployed.
- **Constant-time comparison**, and a non-string signature is rejected.
- **Rotate the secret when PR 1 deploys.** Signatures issued by the old error path
  stay valid until the secret changes.

Left in place for PR 2 to remove: the `error.historySignature` spreads and debug logs
in `ChatAppContainer.js`, the `historySignature` passthrough in
`buildGraphErrorPayload`, and the block in `verifySignedPrefix` that looks for a
signature on error messages.

Still open after PR 1, for PR 2:

- **User message text beside a signed answer is not signed.** The signature covers
  `interaction.question`; the `text` of the user message before it is skipped, yet
  translation context, similar-answer matching and the short-query check read it.
- **`DEBUG_CONV_INTEGRITY` logs the expected signature and the serialized history.**
  If it were ever set in a deployed environment, anyone with log access could read
  valid signatures. Remove those values from the logs or limit the flag to
  development and test.

### PR 2 — planned (signature v2)

Server and client share this contract, so it ships as one PR.

- **Sign in one place**, where the result leaves the server in `chat-graph-run.js`,
  replacing the calls in `AnswerGenerationService` and `SimilarAnswerService`.
  Client-supplied content is never signed.
- **Sign the exact fields the server reads back**: raw `question`, `answer.content`
  and `answer.answerType`. Canonical JSON instead of `|`-joined text, and no
  normalization.
- **Chain and bind**: each signature covers the previous one and the `chatId`, so
  turns cannot be spliced across chats.
- **Consume only what was verified**: after verification the server rebuilds the
  history from the signed fields alone. One shared turn extractor replaces the three
  hand-synced "is this an AI turn" copies (`ai-turn-check-sync`).
- **Remove context reuse** from `DefaultWithVectorGraph` and `InstantAndQAGraph`, so
  no graph reads the client's `interaction.context`. Add a test that client-supplied
  context never reaches the answer prompt in any graph. This must land before
  `InstantAndQAGraph` becomes the default workflow.
- **Cutover**: chats in flight at deploy fail on their next turn with the generic
  error. Accepted, because the old format is the vulnerable one and chats are capped
  at three turns. No dual-format verification window.
- **Tests and docs**: one regression test per finding; update
  `docs/architecture/pipeline-architecture.md` (including "5d. Context reuse") and
  rewrite the original plan below.

### Decisions (Lisa Fast, 2026-11-14)

- Drop trailing unanswered questions instead of accepting or signing them.
- Remove error-path signing.
- Remove context reuse instead of signing the context.
- Refuse to start without the secret; random per-process secret in development and test.
- Accept the brief cutover breakage in PR 2.

Considered and not chosen: loading the transcript from the database by `chatId`
instead of trusting client history. It removes the whole class of problem but adds a
DocumentDB read per turn and is a much larger change.

---

*The original plan follows. It describes the design as first built; the file links
and endpoints it names (`chat-message.js`, `chat-similar-answer.js`,
`src/services/AnswerService.js`) no longer exist, and only `chat-graph-run.js` uses
the session wrapper today.*

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
