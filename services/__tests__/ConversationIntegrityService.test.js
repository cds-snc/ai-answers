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
    });
});
