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

    // --- Contact Information (from Privacy approach doc) ---

    it('redacts phone numbers: Please call me at 123-456-7890 to discuss my application.', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('Please call me at 123-456-7890 to discuss my application.', 'en');
        expect(result.redactedText).not.toContain('123-456-7890');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts emails: My email is user@sub.domain.com.', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('My email is user@sub.domain.com.', 'en');
        expect(result.redactedText).not.toContain('user@sub.domain.com');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts IP addresses: Server IP est 192.168.1.1.', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('Server IP est 192.168.1.1.', 'en');
        expect(result.redactedText).not.toContain('192.168.1.1');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts IPv6 addresses', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('New IPv6 address is 2001:0DB8:85A3:0000:0000:8A2E:0370:7334', 'en');
        expect(result.redactedText).not.toContain('2001:0DB8');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts URLs: Check my website at https://vaticanize.ca/', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('Check my website at https://vaticanize.ca/', 'en');
        expect(result.redactedText).not.toContain('https://vaticanize.ca/');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    // --- Location Identifiers (from Privacy approach doc) ---

    it('redacts street addresses: New address: 333 Willow Court, Oshawa, ON', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('New address: 333 Willow Court, Oshawa, ON', 'en');
        expect(result.redactedText).not.toContain('333 Willow Court');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts postal codes with spaces: Living at K 1 A 0 B 1 postal code.', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('Living at K 1 A 0 B 1 postal code.', 'en');
        expect(result.redactedText).not.toContain('K 1 A 0 B 1');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts postal codes without spaces: Code postal est H3Z2Y7.', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('Code postal est H3Z2Y7.', 'en');
        expect(result.redactedText).not.toContain('H3Z2Y7');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts PO Box: Mail to P.O. Box 1234.', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('Mail to P.O. Box 1234.', 'en');
        expect(result.redactedText).not.toContain('P.O. Box 1234');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    // --- Government-issued unique identifiers (from Privacy approach doc) ---

    it('redacts SIN with dashes: SIN 123-456-789 needs verification.', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('SIN 123-456-789 needs verification.', 'en');
        expect(result.redactedText).not.toContain('123-456-789');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts SIN with spaces: Social Insurance Number 123 456 789 provided.', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('Social Insurance Number 123 456 789 provided.', 'en');
        expect(result.redactedText).not.toContain('123 456 789');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts SIN in French: Mon NAS 464 449 387 est expiré?', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('Mon NAS 464 449 387 est expiré?', 'en');
        expect(result.redactedText).not.toContain('464 449 387');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    // --- Names with introduction phrases and prefixes (from Privacy approach doc) ---

    it('redacts names: My name is Robert Brown. Please help me with CRA.', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('My name is Robert Brown. Please help me with CRA.', 'en');
        expect(result.redactedText).not.toContain('Robert Brown');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it("redacts names in French: Je m'appelle Claire Martin.", async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText("Je m'appelle Claire Martin.", 'en');
        expect(result.redactedText).not.toContain('Claire Martin');
        expect(result.redactedItems).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'private' }),
        ]));
    });

    it('redacts names with prefixes: Bonjour, je suis Docteur Amelie Parsonne', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const result = redactionService.redactText('Bonjour, je suis Docteur Amelie Parsonne', 'en');
        expect(result.redactedText).not.toContain('Amelie Parsonne');
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
