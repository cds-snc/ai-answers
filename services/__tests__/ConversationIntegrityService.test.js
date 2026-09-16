import ConversationIntegrityService from '../ConversationIntegrityService.js';
import { describe, it, expect, vi } from 'vitest';

describe('ConversationIntegrityService', () => {
    const mockHistory = [
        { sender: 'user', text: 'Hello' },
        { sender: 'ai', text: 'Hi there!' }
    ];

    describe('serializeHistory', () => {
        it('should deterministically serialize history', () => {
            const serialized = ConversationIntegrityService.serializeHistory(mockHistory);
            expect(serialized).toBe('user:Hello|ai:Hi there!');
        });

        it('should handle interaction object shape and expand it', () => {
            const historyWithInteractions = [
                {
                    interaction: {
                        question: 'What is it?',
                        answer: { content: 'Interaction Answer' }
                    }
                }
            ];
            const serialized = ConversationIntegrityService.serializeHistory(historyWithInteractions);
            expect(serialized).toBe('user:What is it?|ai:Interaction Answer');
        });

        it('should return empty string for non-array input', () => {
            expect(ConversationIntegrityService.serializeHistory(null)).toBe('');
            expect(ConversationIntegrityService.serializeHistory({})).toBe('');
        });

        it('should strip referring-url and output-lang tags from content', () => {
            const historyWithTags = [
                { sender: 'user', text: 'Where is this?\n<referring-url>http://foo.com</referring-url>' },
                { sender: 'ai', text: 'Here.\n<output-lang>en</output-lang>' }
            ];
            const serialized = ConversationIntegrityService.serializeHistory(historyWithTags);
            expect(serialized).toBe('user:Where is this?|ai:Here.');
        });

        // Regression: ChatAppContainer.js retroactively attaches the same
        // `interaction` object onto the *user* bubble too, not just the AI
        // bubble (so the question bubble can read its own detected language).
        // Before the sender check, a user message carrying `interaction` hit
        // the same expand-to-Q+A branch as the AI message, doubling the
        // user:/ai: lines and producing a different signature than the plain
        // [user, ai] pair AnswerGenerationService originally signed.
        it('should not double-count a user message that also carries interaction', () => {
            const interaction = {
                question: 'What is it?',
                answer: { content: 'Interaction Answer' },
            };
            const historyBothBubblesTagged = [
                { sender: 'user', text: 'What is it?', interaction },
                { sender: 'ai', interaction },
            ];
            const serialized = ConversationIntegrityService.serializeHistory(historyBothBubblesTagged);
            expect(serialized).toBe('user:What is it?|ai:Interaction Answer');
        });
    });

    describe('calculateSignature', () => {
        it('should generate a consistent signature', () => {
            const sig1 = ConversationIntegrityService.calculateSignature(mockHistory);
            const sig2 = ConversationIntegrityService.calculateSignature(mockHistory);
            expect(sig1).toBe(sig2);
            expect(typeof sig1).toBe('string');
            expect(sig1.length).toBe(64); // SHA256 hex length
        });
    });

    describe('verifyHistory', () => {
        it('should return true for valid signature', () => {
            const signature = ConversationIntegrityService.calculateSignature(mockHistory);
            const isValid = ConversationIntegrityService.verifyHistory(mockHistory, signature);
            expect(isValid).toBe(true);
        });

        it('should return false for invalid signature', () => {
            const isValid = ConversationIntegrityService.verifyHistory(mockHistory, 'wrong-signature');
            expect(isValid).toBe(false);
        });

        it('should return false if signature is missing', () => {
            const isValid = ConversationIntegrityService.verifyHistory(mockHistory, null);
            expect(isValid).toBe(false);
        });

        it('should return false if history is tampered', () => {
            const signature = ConversationIntegrityService.calculateSignature(mockHistory);
            const tamperedHistory = [
                { sender: 'user', text: 'Tampered' },
                ...mockHistory.slice(1)
            ];
            const isValid = ConversationIntegrityService.verifyHistory(tamperedHistory, signature);
            expect(isValid).toBe(false);
        });

        // End-to-end regression for the same bug as above, at the signature
        // level: a signature computed the way AnswerGenerationService.js does
        // it after a turn completes - a plain [{sender, text}] pair, no
        // `interaction` involved - must still verify against the client's
        // resubmitted history on the *next* turn, which by then carries the
        // same `interaction` object on both the user and ai bubble.
        it('should verify a signature computed over a plain pair against the client\'s both-bubbles-tagged resubmission', () => {
            const plainTurn = [
                { sender: 'user', text: 'What is it?' },
                { sender: 'ai', text: 'Interaction Answer' },
            ];
            const signature = ConversationIntegrityService.calculateSignature(plainTurn);

            const interaction = {
                question: 'What is it?',
                answer: { content: 'Interaction Answer' },
                historySignature: signature,
            };
            const resubmittedHistory = [
                { sender: 'user', text: 'What is it?', interaction },
                { sender: 'ai', interaction },
            ];

            expect(ConversationIntegrityService.verifyHistory(resubmittedHistory, signature)).toBe(true);
        });
    });
});
