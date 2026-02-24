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
});
