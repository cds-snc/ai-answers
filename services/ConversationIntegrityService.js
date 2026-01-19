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

        // 1. "Take what you need" for AI responses
        // If we find specific answer tags, use them as the source of truth, ignoring surrounding noise.
        const answerMatch = text.match(/<english-answer>([\s\S]*?)<\/english-answer>/) ||
            text.match(/<answer>([\s\S]*?)<\/answer>/);

        if (answerMatch) {
            content = answerMatch[1];
        } else {
            // 2. "Remove known noise" for User messages (or AI messages without standard tags)
            // e.g. <output-lang>eng</output-lang> sometimes appended to history
            content = content
                .replace(/<output-lang>[\s\S]*?<\/output-lang>/g, '')
                .replace(/<referring-url>[\s\S]*?<\/referring-url>/g, '');
        }

        // 3. Final Polish: strip remaining tags (formatting, s-tags) and normalize whitespace
        return content
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
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
                const q = this.normalizeText(m.interaction.question?.redactedQuestion || m.interaction.question?.text || m.interaction.question);
                const a = this.normalizeText(m.interaction.answer?.content || m.interaction.answer?.text || m.interaction.answer);
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
        return lines.join('|');
    }

    /**
     * Calculates a HMAC-SHA256 signature for the given history.
     * 
     * @param {Array} history - The conversation history.
     * @returns {string} - Hex digest of the signature.
     */
    calculateSignature(history) {
        const data = this.serializeHistory(history);
        return crypto.createHmac('sha256', SECRET).update(data).digest('hex');
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
        return signature === expected;
    }
}

export default new ConversationIntegrityService();
