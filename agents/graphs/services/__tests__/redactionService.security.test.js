import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsService } from '../../../../services/SettingsService.js';
import redactionService from '../redactionService.js';

vi.mock('../../../../services/SettingsService.js', () => ({
    SettingsService: {
        loadAll: vi.fn(),
        get: vi.fn()
    }
}));

describe('RedactionService Security Regression', () => {
    let consoleSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        redactionService.isInitialized = false;
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    it('should never log the raw input text to console during redaction', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');

        const sensitiveText = 'PRIVATE_TOKEN_12345';
        redactionService.redactText(sensitiveText, 'en');

        // Check all console.log calls
        consoleSpy.mock.calls.forEach(call => {
            const loggedString = JSON.stringify(call);
            expect(loggedString).not.toContain(sensitiveText);
        });
    });

    // AIA-014: the existing test above uses text nothing matches, so it never
    // exercised the "items detected" log. Matched PII must not reach any
    // console method — stdout is shipped to the ops log store.
    it('never logs matched PII values, only types and counts', async () => {
        SettingsService.get.mockReturnValue('');
        await redactionService.initialize('en');
        const spies = ['log', 'info', 'warn', 'error', 'debug']
            .map(m => vi.spyOn(console, m).mockImplementation(() => { }));

        try {
            const pii = ['123 456 789', 'jane.doe@example.com', '613-555-0123'];
            const { redactedItems } = redactionService.redactText(
                `My SIN is ${pii[0]}, email ${pii[1]}, phone ${pii[2]}`,
                'en'
            );
            expect(redactedItems.length).toBeGreaterThanOrEqual(3);

            const logged = JSON.stringify(spies.flatMap(s => s.mock.calls));
            for (const value of pii) expect(logged).not.toContain(value);
            expect(logged).toContain('private');
        } finally {
            spies.forEach(s => s.mockRestore());
        }
    });
});
