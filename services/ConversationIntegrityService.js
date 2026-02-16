import crypto from 'crypto';

const SECRET = process.env.CONVERSATION_INTEGRITY_SECRET || 'dev-secret-key';

class ConversationIntegrityService {
    /**
     * Normalizes text by stripping internal XML tags and metadata
     * to ensure signatures match between raw LLM output and cleaned UI state.
     */
    normalizeText(text) {
        if (!text || typeof text !== 'string') return '';
        let content = text;
        if (process.env.DEBUG_CONV_INTEGRITY) {
            // eslint-disable-next-line no-console
            console.log('[ConversationIntegrityService] normalizeText input:', text);
        }

        // 1. "Take what you need" for AI responses
        // Check <answer> first: parseResponse.js uses <answer> as source of truth when both tags exist.
        const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/) ||
            text.match(/<english-answer>([\s\S]*?)<\/english-answer>/);

        if (answerMatch) {
            content = answerMatch[1];
        } else {
            // 2. Try to extract clarifying question content
            // Clarifying questions use <clarifying-question> tags
            const clarifyingMatch = text.match(/<clarifying-question>([\s\S]*?)<\/clarifying-question>/);
            if (clarifyingMatch) {
                content = clarifyingMatch[1];
            } else {
                // 3. Fallback: Try to extract sentence-tagged content (<s-1>, <s-2>, etc.)
                // This handles cases where the answer is wrapped in sentence tags
                const sentenceMatches = text.match(/<s-\d+>([\s\S]*?)<\/s-\d+>/g);
                if (sentenceMatches && sentenceMatches.length > 0) {
                    // Extract content from all sentence tags and join them
                    content = sentenceMatches
                        .map(match => match.replace(/<\/?s-\d+>/g, ''))
                        .join(' ');
                } else {
                    // 4. "Remove known noise" for User messages (or AI messages without standard tags)
                    // e.g. <output-lang>eng</output-lang> sometimes appended to history
                    content = content
                        .replace(/<output-lang>[\s\S]*?<\/output-lang>/g, '')
                        .replace(/<referring-url>[\s\S]*?<\/referring-url>/g, '')
                        .replace(/<preliminary-checks>[\s\S]*?<\/preliminary-checks>/g, '');
                }
            }
        }

        // 5. Final Polish: strip remaining tags (formatting, s-tags) and normalize whitespace
        const result = content
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (process.env.DEBUG_CONV_INTEGRITY) {
            // eslint-disable-next-line no-console
            console.log('[ConversationIntegrityService] normalizeText output:', result);
        }
        return result;
    }


    /**
     * Deterministically serializes conversation history for signing/verification.
     */
    serializeHistory(history) {
        if (!Array.isArray(history)) return '';

        // Filter out error messages - they don't affect conversation integrity
        // and their presence/absence shouldn't change the signature
        const filteredHistory = history.filter(m => !m.error);

        const lines = [];
        for (let i = 0; i < filteredHistory.length; i++) {
            const m = filteredHistory[i];

            if (m.interaction) {
                const qRaw = m.interaction.question?.redactedQuestion || m.interaction.question?.text || m.interaction.question;
                const aRaw = m.interaction.answer?.content || m.interaction.answer?.text || m.interaction.answer;
                const q = this.normalizeText(qRaw);
                const a = this.normalizeText(aRaw);
                lines.push(`user:${q}`);
                lines.push(`ai:${a}`);
            } else {
                // Check redundancy: If this is a user message and the NEXT message has an interaction,
                // assume the interaction covers this turn (User Q + AI A) and skip this standalone user message.
                // This handles the [User, AI(with interaction)] pattern common in client state.
                const isUser = (m.sender === 'user' || m.role === 'user');
                if (isUser && i + 1 < filteredHistory.length) {
                    const next = filteredHistory[i + 1];
                    if (next.interaction) {
                        continue;
                    }
                }

                const role = m.sender || m.role || '';
                const text = this.normalizeText(m.text || m.content || '');
                lines.push(`${role}:${text}`);
            }
        }
        const result = lines.join('|');
        if (process.env.DEBUG_CONV_INTEGRITY) {
            // eslint-disable-next-line no-console
            console.log('[ConversationIntegrityService] serializeHistory:', result);
        }
        return result;
    }

    /**
     * Calculates a HMAC-SHA256 signature for the given history.
     * 
     * @param {Array} history - The conversation history.
     * @returns {string} - Hex digest of the signature.
     */
    calculateSignature(history) {
        const data = this.serializeHistory(history);
        const signature = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
        if (process.env.DEBUG_CONV_INTEGRITY) {
            // eslint-disable-next-line no-console
            console.log('[ConversationIntegrityService] calculateSignature:', { data, signature });
        }
        return signature;
    }

    /**
     * Verifies if the provided signature matches the history.
     * 
     * @param {Array} history - The conversation history.
     * @param {string} signature - The signature to verify.
     * @returns {boolean} - True if valid, false otherwise.
     */
    verifyHistory(history, signature) {
        if (!signature) return false;
        const expected = this.calculateSignature(history);
        if (process.env.DEBUG_CONV_INTEGRITY) {
            // eslint-disable-next-line no-console
            console.log('[ConversationIntegrityService] verifyHistory:', { signature, expected, match: signature === expected });
        }
        return signature === expected;
    }

    /**
     * Verify only the signed prefix of a history when a signature may refer
     * to an earlier AI turn. Returns an object describing the result so
     * callers can decide how to proceed.
     *
     * @param {Array} historyArray - Full conversation history (may include error turns)
     * @param {string|null} inputSignature - Optional signature provided by client
     * @returns {Object} - { valid: boolean, reason?: string, signature?: string, signatureSourceIndex?: number }
     */
    verifySignedPrefix(historyArray, inputSignature) {
        const history = Array.isArray(historyArray) ? historyArray : [];

        // Filter out error messages - they don't participate in integrity checking
        const filteredHistory = history.filter(m => !m.error);

        if (process.env.DEBUG_CONV_INTEGRITY) {
            // eslint-disable-next-line no-console
            console.log('[ConversationIntegrityService] verifySignedPrefix input:', { historyArray, inputSignature, filteredHistory });
        }

        if (filteredHistory.length === 0) return { valid: true };

        // Extract signature from possible locations
        const lastAi = [...filteredHistory].reverse().find(m => m.sender === 'ai' || m.interaction?.answer);
        let signature = inputSignature || null;
        let signatureSource = null;

        if (!signature && lastAi?.historySignature) {
            signature = lastAi.historySignature;
            signatureSource = lastAi;
        }
        if (!signature && lastAi?.interaction?.historySignature) {
            signature = lastAi.interaction.historySignature;
            signatureSource = lastAi;
        }
        if (!signature && lastAi?.interaction?.answer?.historySignature) {
            signature = lastAi.interaction.answer.historySignature;
            signatureSource = lastAi;
        }
        if (!signature && filteredHistory[0]?.interaction?.answer?.historySignature) {
            signature = filteredHistory[0].interaction.answer.historySignature;
            signatureSource = filteredHistory[0];
        }

        // If signature provided explicitly, try to locate message that carried it
        if (!signatureSource && signature) {
            signatureSource = [...filteredHistory].reverse().find(m =>
                m?.historySignature === signature ||
                m?.interaction?.historySignature === signature ||
                m?.interaction?.answer?.historySignature === signature
            ) || null;
        }

        if (!signature) {
            if (process.env.DEBUG_CONV_INTEGRITY) {
                // eslint-disable-next-line no-console
                console.log('[ConversationIntegrityService] verifySignedPrefix: missing signature');
            }
            return { valid: false, reason: 'missing_signature' };
        }

        // Default to verifying full historyArray; if we located the signature source
        // verify only the prefix up to and including that message to allow client-only
        // trailing error/system turns.
        let historyToVerify = history;
        if (signatureSource) {
            const sourceIndex = history.findIndex((m) => m === signatureSource);
            if (sourceIndex >= 0) {
                historyToVerify = history.slice(0, sourceIndex + 1);
            }
        }

        if (process.env.DEBUG_CONV_INTEGRITY) {
            // eslint-disable-next-line no-console
            console.log('[ConversationIntegrityService] verifySignedPrefix verifying:', { signature, signatureSource, historyToVerify });
        }

        const valid = this.verifyHistory(historyToVerify, signature);
        if (!valid) {
            if (process.env.DEBUG_CONV_INTEGRITY) {
                // eslint-disable-next-line no-console
                console.log('[ConversationIntegrityService] verifySignedPrefix: invalid signature', { signature, historyToVerify });
            }
            return { valid: false, reason: 'invalid_signature', signature };
        }
        return { valid: true, signature, signatureSourceIndex: signatureSource ? history.findIndex(m => m === signatureSource) : null };
    }
}

export default new ConversationIntegrityService();
