import { test, expect } from '@playwright/test';

test.describe('Chat Session Availability Direct URL Test', () => {
    test.afterEach(async ({ page }) => {
        if (process.env.TEST_HEADED === 'true') {
            console.log('Test finished, waiting 5s for inspection...');
            await page.waitForTimeout(5000);
        }
    });

    test('should be accessible from a completely fresh browser state without middleware interference', async ({ browser }) => {
        // Create a fresh context (no cookies, no session)
        const context = await browser.newContext();
        const page = await context.newPage();

        // Navigate directly to the API endpoint defined in server.js
        // http://localhost:3001/api/chat/chat-session-availability
        const response = await page.goto('/api/chat/chat-session-availability');

        // 1. Verify response status is 200 (not 403, 401, or 500)
        expect(response.status()).toBe(200);

        // 2. Verify it returns JSON
        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('application/json');

        const body = await response.json();
        console.log('Direct API Response Body:', body);

        // 3. Verify the expected properties exist
        expect(body).toHaveProperty('siteStatus');
        expect(body).toHaveProperty('sessionAvailable');

        // 4. Verify they are the correct type
        expect(typeof body.siteStatus).toBe('boolean');
        expect(typeof body.sessionAvailable).toBe('boolean');

        await context.close();
    });

    test('should be accessible even for bots (bypass bot detector middleware)', async ({ browser }) => {
        // Some middlewares in server.js block bots, but this endpoint should be before them
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        });
        const page = await context.newPage();

        const response = await page.goto('/api/chat/chat-session-availability');

        // Should still be 200 because it's registered above the bot detection middleware in server.js
        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.siteStatus).toBeDefined();

        await context.close();
    });
});
