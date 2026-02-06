import { describe, it, expect, beforeAll } from 'vitest';
import { redactionService } from '../agents/graphs/services/redactionService.js';
import { SettingsService } from '../services/SettingsService.js';

describe('RedactionService Regex Logic', () => {
    beforeAll(async () => {
        // Mock SettingsService to prevent DB calls and ensure patterns are initialized
        SettingsService.get = (key) => {
            // Ensure key is treated as a string to avoid type confusion (e.g., arrays from req.query)
            if (typeof key !== 'string') {
                return null;
            }
            if (key.includes('profanity')) return 'badword1,badword2';
            if (key.includes('threat')) return 'kill,bomb';
            if (key.includes('manipulation')) return 'ignore previous';
            return null;
        };
        await redactionService.initialize('en');
    });

    const testCases = [
        { name: 'Phone Number', text: 'My number is 613-555-0123.', pii: '613-555-0123' },
        { name: 'Canadian Postal Code', text: 'My postal code is K1A 0A6.', pii: 'K1A 0A6' },
        { name: 'Email Address', text: 'Contact me at test.user@example.com for more info.', pii: 'test.user@example.com' },
        { name: 'Street Address', text: 'I live at 123 Maple Street', pii: '123 Maple Street' },
        { name: 'SIN', text: 'My SIN is 123-456-789', pii: '123-456-789' },
        { name: 'Name with prefix', text: 'I am Dr. Jane Smith', pii: 'Jane Smith' },
        { name: 'Name with intro', text: 'my name is John Doe', pii: 'John Doe' },
        { name: 'IP Address', text: 'My IP is 192.168.1.1', pii: '192.168.1.1' },
        { name: 'URL', text: 'Visit https://example.com/sensitive', pii: 'https://example.com/sensitive' },
    ];

    testCases.forEach(tc => {
        it(`should redact ${tc.name}`, () => {
            const { redactedText, redactedItems } = redactionService.redactText(tc.text, 'en');
            console.log(`${tc.name}: "${tc.text}" -> "${redactedText}"`);
            expect(redactedText).not.toContain(tc.pii);
            expect(redactedText).toContain('XXX');
            expect(redactedItems.some(item => item.type === 'private')).toBe(true);
        });
    });
});
