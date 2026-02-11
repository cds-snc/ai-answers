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
