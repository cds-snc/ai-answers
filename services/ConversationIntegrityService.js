import crypto from 'crypto';
import { extractCompletedTurns, buildVerifiedHistory } from '../api/util/conversation-turns.js';

// The client holds the conversation history and sends it back with every
// follow-up question. This service lets the server check that what comes back
// is what the server itself produced.
//
// Rules this design depends on - keep them when changing anything here:
//   1. Sign only what the server wrote. Signing happens in one place, where a
//      completed turn leaves the server (api/chat/chat-graph-run.js). Nothing
//      a client sent is ever signed on its own.
//   2. Sign exactly what is read back. The signature covers the raw question
//      and answer text of every completed turn - no normalization, no
//      "close enough".
//   3. Consume only what was verified. verifyHistory returns a history rebuilt
//      from the signed text alone; the pipeline never sees the client's array.
//   4. Fail closed. No secret, no signature, or a mismatch means no history.

// Bump when the signed payload changes shape, so old signatures stop verifying.
const SIGNATURE_VERSION = 'v2';

// AIA-019: there is no hardcoded fallback secret. A known secret lets anyone
// sign a history they wrote, so a missing one must fail closed.
//
// Read lazily, not at import: server.js loads .env after its imports run.
// "Not development and not test" is how this codebase spots a deployed
// environment (see middleware/express-session.js) - NODE_ENV is not reliably
// 'production' there, so an unset NODE_ENV has to count as deployed.
let cachedSecret = null;
function getSecret() {
    if (cachedSecret) return cachedSecret;
    const configured = process.env.CONVERSATION_INTEGRITY_SECRET;
    if (configured) {
        cachedSecret = configured;
    } else if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        // Local only: a throwaway secret that lasts until the process exits.
        cachedSecret = crypto.randomBytes(32).toString('hex');
        if (process.env.NODE_ENV === 'development') {
            console.warn('[ConversationIntegrityService] CONVERSATION_INTEGRITY_SECRET is not set: using a temporary secret. Chats open in a browser will fail their next turn after a server restart.');
        }
    } else {
        throw new Error('CONVERSATION_INTEGRITY_SECRET is not set. Refusing to sign or verify conversation history without it.');
    }
    return cachedSecret;
}

class ConversationIntegrityService {
    /**
     * Throws when no signing secret is available. server.js calls this at
     * startup so a misconfigured deployment fails to boot instead of failing
     * on the first follow-up question.
     */
    assertConfigured() {
        getSecret();
    }

    /**
     * Signs a chat's completed turns.
     *
     * The payload is JSON, so text can never read as a boundary between turns,
     * and it includes the chatId, so a signature from one chat does not verify
     * in another.
     *
     * @param {string} chatId - The server-validated chat ID.
     * @param {Array<{question: string, answer: string}>} turns - From extractCompletedTurns.
     * @returns {string} - Hex HMAC-SHA256.
     */
    signTurns(chatId, turns) {
        if (typeof chatId !== 'string' || !chatId) {
            throw new Error('ConversationIntegrityService: chatId is required to sign or verify a history');
        }
        const payload = JSON.stringify([
            SIGNATURE_VERSION,
            chatId,
            turns.map(({ question, answer }) => [question, answer]),
        ]);
        return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
    }

    /**
     * Checks a client-held history against its signature and returns the
     * history the pipeline may consume.
     *
     * @param {string} chatId - The server-validated chat ID.
     * @param {*} history - conversationHistory exactly as the client sent it.
     * @param {*} signature - historySignature as the client sent it.
     * @returns {{valid: true, history: Array} | {valid: false, reason: 'missing_signature' | 'invalid_signature'}}
     *   `history` is rebuilt from the signed text only. Callers must consume
     *   it, never the array they passed in.
     */
    verifyHistory(chatId, history, signature) {
        const turns = extractCompletedTurns(history);

        // No completed turn means no history: error messages and questions
        // that never got an answer are not signed and are not consumed.
        if (turns.length === 0) return { valid: true, history: [] };

        if (typeof signature !== 'string' || !signature) {
            return { valid: false, reason: 'missing_signature' };
        }

        // Constant-time compare, so response timing can't reveal the signature.
        const received = Buffer.from(signature);
        const expected = Buffer.from(this.signTurns(chatId, turns));
        if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
            return { valid: false, reason: 'invalid_signature' };
        }

        return { valid: true, history: buildVerifiedHistory(turns) };
    }
}

export default new ConversationIntegrityService();
