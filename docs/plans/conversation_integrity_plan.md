# Conversation integrity

## Overview

The chat client holds the conversation history and sends it back with every follow-up
question. The server cannot trust that copy, because whatever it reads from the history
ends up in a prompt. This document describes how the server makes sure the history it
consumes is the history it produced.

It uses an HMAC-SHA256 signature. The design was first built as a signature over a
normalized summary of the history. A security review in November 2026 led to the
current design, which is what this document describes.

## Rules the design depends on

Keep all four when changing anything in this area.

1. **Sign only what the server wrote.** Signing happens in one place, where a completed
   turn leaves the server. Nothing a client sent is ever signed on its own.
2. **Sign exactly what is read back.** The signature covers the raw question and answer
   text of every completed turn. There is no normalization and no partial match.
3. **Consume only what was verified.** After verification the server rebuilds the history
   from the signed text. The pipeline never sees the client's array.
4. **Fail closed.** No secret, no signature, or a mismatch means no history.

## How it works

### What a turn is

`api/util/conversation-turns.js` is the single definition. A completed turn is an AI
message carrying `interaction` that is not flagged as an error. From it the server reads
two strings: `interaction.question` and `interaction.answer.content`. Anything that is
not a string counts as empty text.

These are **not** turns, so they are never signed and never consumed:

- user messages (the question text comes from the signed turn, not from the user bubble)
- error messages
- questions that never got an answer, because the pipeline failed on them

### Signing

`ConversationIntegrityService.signTurns(chatId, turns)` computes:

```
HMAC-SHA256(secret, JSON.stringify(["v2", chatId, [[question, answer], ...]]))
```

- **JSON payload:** text can never read as a boundary between turns.
- **`chatId`:** a signature from one chat does not verify in another.
- **Version tag:** bump it when the payload changes shape, so old signatures stop
  verifying.

The only caller is the `result` event in `api/chat/chat-graph-run.js`. It signs the turns
verified on the way in, plus the new question and answer it is about to send. The client
stores that result object as the turn, so what is signed is exactly what comes back.

A failed turn returns no signature.

### Verifying

`validateConversationIntegrity` in `middleware/chat-session.js` runs before the handler,
for every request wrapped in `withChatSession`. It calls
`ConversationIntegrityService.verifyHistory(chatId, history, signature)`:

| History holds | Signature | Outcome |
|---|---|---|
| No completed turn | Any | Accepted, history becomes `[]` |
| One or more completed turns | Missing | `403 missing_signature` |
| One or more completed turns | Does not match | `403 invalid_signature` |
| One or more completed turns | Matches | Accepted, history is rebuilt |

The rebuilt history holds a user message and an AI message per turn, with only the signed
question and answer text. Context, citations, extra fields and extra messages the client
sent do not survive. `input.conversationHistory` is replaced with it.

The comparison is constant-time. Failures are logged with counts only, never the
signature or the content.

### What the client does

`src/workflows/GraphClient.js` sends the `historySignature` from the last answered turn in
its messages array. It needs no other logic: the server decides what counts.

After an unexpected failure the client keeps the failed question on screen. The user can
keep chatting. That question is not used as context for later questions.

When the server rejects a history (`invalid_signature` or `missing_signature`), the
client shows the same message as a session timeout: reload the page to start a new chat
(`ChatAppContainer.js`). Retrying cannot work, because the history would be sent again
unchanged.

### Context is never reused from history

Context (department, scenarios, search results, similar questions) feeds the system
prompt. Every graph derives it fresh on every turn. `DefaultWithVectorGraph` and
`InstantAndQAGraph` used to reuse the previous turn's context from the client-held
history; that was removed.

Experimental batches (`services/experimental/ExperimentalBatchService.js`) call the
graphs directly with a history the server builds from its own database. That history is
not client-held, so it does not go through signature verification. Its follow-up rows
now also get fresh context on those two workflows, so results can differ from runs made
before this change.

## The secret

- `CONVERSATION_INTEGRITY_SECRET` is required. There is no fallback value.
- The server refuses to start without it (`assertConfigured()` in `server/server.js`),
  unless `NODE_ENV` is `development` or `test`. There, a random per-process secret is
  used, so chats open in a browser fail their next turn after a server restart.
- An unset `NODE_ENV` counts as deployed.
- Infrastructure: stored as a SecureString in Parameter Store (`terragrunt/aws/ssm`),
  injected into the ECS container (`terragrunt/aws/ecs`), supplied from GitHub
  repository secrets by the staging and production Terraform workflows.

## Deploying a change to the signature

Any change to what is signed, or a secret rotation, makes existing signatures stop
verifying. Chats open at that moment fail on their next turn and the user starts a new
one. This is accepted: chats are capped at three turns, and there is no transition
period in which an older format is still accepted.

## Decisions (Lisa Fast, 2026-11-14)

- Drop questions that never got an answer instead of accepting or signing them.
- Sign completed turns only, in one place.
- Remove context reuse instead of signing the context.
- Refuse to start without the secret; random per-process secret in development and test.
- Accept that open chats fail on their next turn when the signature changes.

Considered and not chosen: loading the transcript from the database by `chatId` instead
of trusting client history at all. It removes the need for a signature but adds a
database read per turn and is a much larger change.

## Tests

- `services/__tests__/ConversationIntegrityService.test.js` — signing, verification,
  failed questions, the secret
- `api/util/__tests__/conversation-turns.test.js` — what counts as a turn
- `middleware/__tests__/session-logic.test.js` — the handler only sees rebuilt history
- `api/chat/__tests__/chat-graph-run.test.js` — results are signed, errors are not
- `agents/graphs/__tests__/DefaultWithVectorGraph.test.js` and
  `InstantAndQAGraph.test.js` — context is derived fresh on follow-ups

### Manual

1. Ask a question, then two follow-ups. All three are answered.
2. Block the `chat-graph-run` request in browser dev tools to force a failed question,
   unblock, and confirm the next two questions are answered.
