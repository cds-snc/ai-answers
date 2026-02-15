import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

test.describe('Redaction Regex E2E Testing', () => {

    test.afterEach(async ({ page }) => {
        if (process.env.TEST_HEADED === 'true') {
            console.log('Test finished, waiting 5s for inspection...');
            await page.waitForTimeout(5000);
        }
    });

    const testCases = [
        { name: 'Street Address', text: 'I live at 123 Maple Street', pii: '123 Maple Street' },
        { name: 'SIN', text: 'My SIN is 123-456-789', pii: '123-456-789' },
        { name: 'Phone Number', text: 'Call me at 555-123-4567', pii: '555-123-4567' },
        { name: 'Canadian Postal Code', text: 'My postal code is K1A 0B1', pii: 'K1A 0B1' },
        { name: 'Email Address', text: 'Email me at test.user@example.com', pii: 'test.user@example.com' },
        { name: 'Name with prefix', text: 'I am Mr. Robert Brown', pii: 'Robert Brown' },
        { name: 'Name with intro', text: 'My name is Alice Smith', pii: 'Alice Smith' },
        { name: 'IP Address', text: 'My IP is 192.168.1.1', pii: '192.168.1.1' },
        { name: 'URL', text: 'This is a URL please visit https://example.com/sensitive', pii: 'https://example.com/sensitive' }
    ];

    for (const tc of testCases) {
        test(`should redact ${tc.name}`, async ({ page }) => {
            await page.goto('/');

            // Wait for initialization
            await page.waitForSelector('textarea#message', { timeout: 30000 });
            const textarea = page.locator('textarea#message');
            console.log(`UI Textarea:`, textarea);
            await textarea.focus();
            await page.keyboard.type(tc.text);
            await expect(textarea).toHaveValue(tc.text, { timeout: 5000 });
            console.log(`UI Textarea Value:`, await textarea.inputValue());
            await expect(page.locator('.btn-primary-send')).toBeVisible();
            await page.locator('.btn-primary-send').click();

            // Wait for the redacted user message to appear in the UI
            // In ChatInterface, it's .message.user .user-message-box p (first p is the text, second is warning)
            // In ChatInterface, specific class for privacy message
            const userMessage = page.locator('.message.user').last().locator('.privacy-message').first();
            await expect(userMessage).toBeVisible({ timeout: 5000 });

            const userText = await userMessage.textContent();
            console.log(`UI User Message for ${tc.name}:`, userText);

            // Verify the UI shows the redacted version
            expect(userText).not.toContain(tc.pii);
            expect(userText).toContain('XXX');

            // Verify that a system "blocked" message appeared (error-message-box)
            const systemMessage = page.locator('.message.system .error-message-box p').last();
            await expect(systemMessage).toBeVisible({ timeout: 5000 });
            const systemText = await systemMessage.textContent();
            console.log(`UI System Message for ${tc.name}:`, systemText);

            // The message should indicate private content was removed
            expect(systemText.toLowerCase()).toMatch(/privac|content|removed|blocked|sent to the ai service/);
        });
    }
});
