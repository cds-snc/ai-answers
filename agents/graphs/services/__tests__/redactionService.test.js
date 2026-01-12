import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsService } from '../../../../services/SettingsService.js';
import redactionService from '../redactionService.js';
import ServerLoggingService from '../../../../services/ServerLoggingService.js';

vi.mock('../../../../services/ServerLoggingService.js', () => ({
    default: { info: vi.fn(), error: vi.fn() }
}));

vi.mock('../../../../services/SettingsService.js', () => ({
    SettingsService: {
        loadAll: vi.fn(),
        get: vi.fn()
    }
}));

describe('RedactionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset service state
        redactionService.isInitialized = false;
        redactionService.profanityPattern = null;
        redactionService.threatPattern = null;
        redactionService.manipulationPattern = null;
        redactionService.currentLang = null;
    });

    it('initializes correctly loading words from SettingsService', async () => {
        // Mock SettingsService to return specific words
        const mockSettings = {
            'redaction.profanity.en': 'bad,worse',
            'redaction.threat.en': 'kill,hurt',
            'redaction.manipulation.en': 'ignore,bypass'
        };
        SettingsService.get.mockImplementation((key) => mockSettings[key] || '');

        await redactionService.initialize('en');

        expect(SettingsService.loadAll).toHaveBeenCalled();
        expect(SettingsService.get).toHaveBeenCalledWith('redaction.profanity.en');
        expect(SettingsService.get).toHaveBeenCalledWith('redaction.threat.en');
        expect(SettingsService.get).toHaveBeenCalledWith('redaction.manipulation.en');

        expect(redactionService.isInitialized).toBe(true);
        expect(redactionService.profanityPattern).toBeDefined();
    });

    it('redacts profanity, threats, and manipulation words', async () => {
        const mockSettings = {
            'redaction.profanity.en': 'badword',
            'redaction.threat.en': 'kill',
            'redaction.manipulation.en': 'bypass'
        };
        SettingsService.get.mockImplementation((key) => mockSettings[key] || '');

        await redactionService.initialize('en');

        const input = 'This contains a badword and a kill threat and tries to bypass filters.';
        const result = redactionService.redactText(input, 'en');

        expect(result.redactedText).toContain('#######'); // badword (7)
        expect(result.redactedText).toContain('####'); // kill (4)
        expect(result.redactedText).toContain('######'); // bypass (6)

        // Ensure original words are gone
        expect(result.redactedText).not.toContain('badword');
        expect(result.redactedText).not.toContain('kill');

        // Check redactedItems structure
        expect(result.redactedItems).toHaveLength(3);
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            { type: 'profanity', match: 'badword' },
            { type: 'threat', match: 'kill' },
            { type: 'manipulation', match: 'bypass' }
        ]));
    });

    it('redacts PII patterns', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const input = 'Call me at 555-123-4567 or email test@example.com';
        const result = redactionService.redactText(input, 'en');

        expect(result.redactedText).toContain('XXX-XXX-XXXX');
        expect(result.redactedText).toContain('XXX@EMAIL');

        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'phone' }),
            expect.objectContaining({ type: 'email' })
        ]));
    });

    it('handles empty settings gracefully', async () => {
        SettingsService.get.mockReturnValue(null); // No settings found

        await redactionService.initialize('en');

        const input = 'Hello world';
        const result = redactionService.redactText(input, 'en');

        expect(result.redactedText).toBe('Hello world');
        expect(result.redactedItems).toHaveLength(0);
        expect(redactionService.profanityPattern).toBeNull();
    });

    it('throws error if redaction called before initialization', () => {
        expect(() => redactionService.redactText('test', 'en')).toThrow('RedactionService is not initialized');
    });

    it('throws error if called with different language than initialized', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        expect(() => redactionService.redactText('test', 'fr')).toThrow('RedactionService is not initialized for the current language');
    });

    // Verification Test requested by user:
    // "Just to double check all of the words are cached correct? based on settingsservice"
    it('verifies integration: SettingsService values are correctly transformed into regex', async () => {
        const complexList = ' word1, word2 , word3,word4 '; // Test spacing and commas
        SettingsService.get.mockReturnValue(complexList);

        await redactionService.initialize('en');

        // We can inspect the private/internal properties or just test behavior
        const input = 'Testing word1 and word4 redaction.';
        const result = redactionService.redactText(input, 'en');

        expect(result.redactedText).toBe('Testing ##### and ##### redaction.');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            { type: 'profanity', match: 'word1' },
            { type: 'profanity', match: 'word4' }
        ]));
    });
});
