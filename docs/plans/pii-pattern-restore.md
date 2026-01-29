# Plan: Restore PII Pattern-Based Blocking in RedactionService

## Problem
When `redactionService.js` was rewritten during the graph migration (commit `eff2a060`), ~15 PII patterns were dropped and replaced with only 3 basic ones (`phone`, `email`, `number`). Additionally, the `blockingTypes` array in `GraphWorkflowHelper.js` only blocks on `profanity`, `threat`, and `manipulation` — meaning even the remaining PII patterns don't trigger a block.

## Changes

### 1. `agents/graphs/services/redactionService.js` — Restore PII patterns

Replace the current minimal `piiPatterns` array (lines 98-103) with the `privatePatterns` from the old file (commit `cab788a4^:src/services/RedactionService.js`), adapted to the current structure:

- All PII patterns use type `'private'` and replacement `'XXX'` (matching old behavior)
- **Remove** the bare `\b\d{9}\b` pattern (was causing false positives on form numbers)
- **Restore** these patterns from the old file:
  - Phone numbers (comprehensive international format)
  - Canadian postal codes (`A1A 1A1` flexible spacing)
  - Email addresses (flexible spacing/punctuation)
  - Passport numbers (`AB123456`)
  - Long number sequences (6+ digits, excluding dollar amounts)
  - Name patterns (`name is...` / `nom est...`)
  - Street addresses
  - Apartment/unit numbers
  - PO Box
  - IP addresses (IPv4 + IPv6)
  - URLs
  - Canadian SIN (`123-456-789`)
  - Names with prefixes (Mr., Dr., etc.)
  - Names in introduction phrases
- **Keep commented-out** patterns that were already commented out in the old file (alphanumeric 6+ chars, US ZIP codes, capitalized names, greeting names, signature names)

### 2. `agents/graphs/workflows/GraphWorkflowHelper.js` — Add `'private'` to blocking types

Line 39, change:
```javascript
const blockingTypes = ['profanity', 'threat', 'manipulation'];
```
to:
```javascript
const blockingTypes = ['profanity', 'threat', 'manipulation', 'private'];
```

This is the minimal change needed. The existing error handling chain is verified to work end-to-end:
- `RedactionError` is thrown -> re-thrown by graph nodes -> caught by `chat-graph-run.js` -> serialized as SSE error -> reconstructed by `GraphClient.js` -> handled by `ChatAppContainer.js`
- The client already checks `error.redactedText.includes('XXX')` to show the correct `privateContent` message, which matches the `'XXX'` replacement for `'private'` type

### 3. `agents/graphs/services/__tests__/redactionService.test.js` — Update tests

- Update existing PII test to use type `'private'` instead of `'phone'`/`'email'`/`'number'`
- Add test cases for restored patterns (postal codes, IP addresses, SIN, etc.)
- Verify the bare `\d{9}` pattern is removed

## Files to modify
1. `agents/graphs/services/redactionService.js`
2. `agents/graphs/workflows/GraphWorkflowHelper.js` (one-line change)
3. `agents/graphs/services/__tests__/redactionService.test.js`

## Verification
1. Run existing tests: `npx vitest run agents/graphs/services/__tests__/redactionService.test.js`
2. Run graph tests: `npx vitest run agents/graphs/__tests__/`
3. Manual verification against the three failing examples:
   - `My email is user@sub.domain.com` → should be blocked (email pattern)
   - `New IPv6 address is 2001:0db8:85a3:0000:0000:8a2e:0370:7334` → should be blocked (IP pattern)
   - `The address has postal code H3Z-2Y7` → should be blocked (postal code pattern)
