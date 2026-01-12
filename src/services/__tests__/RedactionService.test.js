import { describe, it, expect, vi, beforeEach } from 'vitest';
import redactionService from '../RedactionService.js';
import DataStoreService from '../DataStoreService.js';
import LoggingService from '../ClientLoggingService.js';

vi.mock('../ClientLoggingService.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

vi.mock('../DataStoreService.js', () => ({
    default: {
        getSetting: vi.fn(),
        getPublicSetting: vi.fn()
    }
}));

describe('Client RedactionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset internal state
        redactionService.isInitialized = false;
        redactionService.profanityPattern = null;
        redactionService.threatPattern = null;
        redactionService.manipulationPattern = null;
        redactionService.currentLang = null;
    });

    it('initializes correctly by loading words from DataStoreService', async () => {
        // Mock DataStoreService to return specific words
        const mockSettings = {
            'redaction.profanity.en': 'bad,worse',
            'redaction.threat.en': 'kill,hurt',
            'redaction.manipulation.en': 'ignore,bypass'
        };
        DataStoreService.getPublicSetting.mockImplementation((key) => mockSettings[key] || '');

        await redactionService.initialize('en');

        expect(DataStoreService.getPublicSetting).toHaveBeenCalledWith('redaction.profanity.en');
        expect(DataStoreService.getPublicSetting).toHaveBeenCalledWith('redaction.threat.en');
        expect(DataStoreService.getPublicSetting).toHaveBeenCalledWith('redaction.manipulation.en');

        expect(redactionService.isInitialized).toBe(true);
        expect(redactionService.profanityPattern).toBeDefined();
    });

    it('redacts profanity, threats, and manipulation words', async () => {
        const mockSettings = {
            'redaction.profanity.en': 'badword',
            'redaction.threat.en': 'kill',
            'redaction.manipulation.en': 'bypass'
        };
        DataStoreService.getPublicSetting.mockImplementation((key) => mockSettings[key] || '');

        await redactionService.initialize('en');

        const input = 'This contains a badword and a kill threat and tries to bypass filters.';
        const result = redactionService.redactText(input, 'en');

        expect(result.redactedText).toContain('####');

        // Ensure original words are gone
        expect(result.redactedText).not.toContain('badword');
        expect(result.redactedText).not.toContain('kill');
        expect(result.redactedText).not.toContain('bypass');

        // Check redactedItems structure
        const types = result.redactedItems.map(i => i.type);
        expect(types).toContain('profanity');
        expect(types).toContain('threat');
        expect(types).toContain('manipulation');
    });

    it('redacts PII using built-in private patterns', async () => {
        // Even with no settings, PII redaction should work
        DataStoreService.getPublicSetting.mockReturnValue('');
        await redactionService.initialize('en');

        const input = 'My email is test@example.com and phone is 555-123-4567';
        const result = redactionService.redactText(input, 'en');

        // Client side replaces PII with XXX
        expect(result.redactedText).toContain('XXX');
        expect(result.redactedText).not.toContain('test@example.com');
        expect(result.redactedText).not.toContain('555-123-4567');

        const types = result.redactedItems.map(i => i.type);
        expect(types).toContain('private');
    });

    it('handles empty settings gracefully', async () => {
        DataStoreService.getPublicSetting.mockReturnValue(null);

        await redactionService.initialize('en');

        // Profanity patterns should be null, but private patterns always exist
        expect(redactionService.profanityPattern).toBeNull();

        const input = 'Hello world';
        const result = redactionService.redactText(input, 'en');

        expect(result.redactedText).toBe('Hello world');
    });

    it('throws error if redaction called before initialization', () => {
        expect(() => redactionService.redactText('test', 'en')).toThrow('RedactionService is not initialized');
    });

    it('throws error if called with different language than initialized', async () => {
        DataStoreService.getPublicSetting.mockReturnValue('');
        await redactionService.initialize('en');

        expect(() => redactionService.redactText('test', 'fr')).toThrow('RedactionService is not initialized for the current language');
    });

    it('handles ensureInitialized correctly', async () => {
        DataStoreService.getPublicSetting.mockReturnValue('');

        await redactionService.ensureInitialized('fr');
        expect(redactionService.currentLang).toBe('fr');
        expect(redactionService.isInitialized).toBe(true);

        // Re-initializing same lang should be no-op (mock calls shouldn't increase if we tracked state, but ensureInitialized calls initialize if logic allows)
        // Actually implementation of ensureInitialized:
        // if (!this.isInitialized || this.currentLang !== lang) { ... }

        vi.clearAllMocks();
        await redactionService.ensureInitialized('fr');
        expect(DataStoreService.getPublicSetting).not.toHaveBeenCalled();

        await redactionService.ensureInitialized('en');
        expect(DataStoreService.getPublicSetting).toHaveBeenCalled();
        expect(redactionService.currentLang).toBe('en');
    });
});
