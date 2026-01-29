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

    it('redacts PII patterns with type private', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const input = 'Call me at 555-123-4567 or email test@example.com';
        const result = redactionService.redactText(input, 'en');

        expect(result.redactedText).toContain('XXX');
        expect(result.redactedText).not.toContain('555-123-4567');
        expect(result.redactedText).not.toContain('test@example.com');

        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
        // All PII items should be type 'private'
        const piiItems = result.redactedItems.filter(i => i.type === 'private');
        expect(piiItems.length).toBeGreaterThanOrEqual(2);
    });

    it('redacts North American phone number formats', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const phoneFormats = [
            '555-123-4567',
            '(555) 123-4567',
            '555.123.4567',
            '5551234567',
            '1-555-123-4567',
            '+1 555 123 4567',
            '+1 (555) 123-4567',
            '555-123-4567 ext. 890',
            '555-123-4567 x890',
        ];

        for (const phone of phoneFormats) {
            const result = redactionService.redactText(`Call me at ${phone} please`, 'en');
            expect(result.redactedItems.length, `Expected "${phone}" to be redacted`).toBeGreaterThanOrEqual(1);
            expect(result.redactedItems[0].type).toBe('private');
        }
    });

    it('redacts Canadian postal codes', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('The address has postal code H3Z 2Y7', 'en');
        expect(result.redactedText).not.toContain('H3Z');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts IP addresses (IPv4 and IPv6)', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const ipv4 = redactionService.redactText('Server at 192.168.1.1 is down', 'en');
        expect(ipv4.redactedText).not.toContain('192.168.1.1');
        expect(ipv4.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));

        const ipv6 = redactionService.redactText('New IPv6 address is 2001:0DB8:85A3:0000:0000:8A2E:0370:7334', 'en');
        expect(ipv6.redactedText).not.toContain('2001:0DB8');
        expect(ipv6.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts Canadian SIN numbers', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('My SIN is 123-456-789', 'en');
        expect(result.redactedText).not.toContain('123-456-789');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts street addresses', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('I live at 123 Main Street', 'en');
        expect(result.redactedText).not.toContain('123 Main Street');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('does not block plain number sequences (no generic digit-length pattern)', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        // 8-digit reference number should pass (not matching any specific PII pattern)
        const result = redactionService.redactText('Reference 12345678 for your file', 'en');
        expect(result.redactedItems).toHaveLength(0);

        // 6-digit form number should pass (no generic 6+ digit catch-all)
        const result2 = redactionService.redactText('See form 654321 for details', 'en');
        expect(result2.redactedItems).toHaveLength(0);
    });

    it('does not false-positive on product serial numbers', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        // Phone pattern should not match digit substrings inside longer numbers
        const result = redactionService.redactText('Product serial 987654321003 recalled?', 'en');
        expect(result.redactedItems).toHaveLength(0);
        expect(result.redactedText).toBe('Product serial 987654321003 recalled?');
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
