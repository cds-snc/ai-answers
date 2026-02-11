import { test, expect } from '@playwright/test';

test.describe('Visitor Persistence E2E', () => {
    test('unauthenticated visitorId should be maintained after reload', async ({ page }) => {
        // 1. Visit the home page
        // Use a persistent browser context to handle cookies properly
        await page.goto('http://localhost:3001');

        console.log('Page loaded, waiting for initialization...');
        await page.waitForTimeout(5000); // Wait for scripts and fingerprinting

        // 2. Send a message to ensure session is active and used
        await page.waitForSelector('textarea#message');
        await page.fill('textarea#message', 'Hello persistence test');
        await page.click('.btn-primary-send');

        // Wait for the chat graph SSE request to start
        const firstGraphResponse = await page.waitForResponse(response =>
            response.url().includes('/api/chat/chat-graph-run'),
            { timeout: 30000 }
        );
        expect(firstGraphResponse.status()).toBe(200);

        // Wait for response to Detach (meaning it finished)
        await page.waitForSelector('.loading-container', { state: 'detached', timeout: 30000 });
        console.log('First message sent and response received');

        // 4. Reload page
        console.log('Reloading page...');
        await page.reload();
        await page.waitForTimeout(5000);

        // 5. Verify we can still send messages
        // If the session was lost, botDetector might block us if it doesn't see a valid visitorId/session
        await page.waitForSelector('textarea#message');
        await page.fill('textarea#message', 'Follow up question');
        await page.click('.btn-primary-send');

        // Wait for the chat graph SSE request to start - expect 200 OK
        const secondGraphResponse = await page.waitForResponse(response =>
            response.url().includes('/api/chat/chat-graph-run'),
            { timeout: 30000 }
        );

        console.log('Second message response status:', secondGraphResponse.status());
        expect(secondGraphResponse.status()).toBe(200);

        // Optional: Verify message count in UI (history should be managed by chatId/session)
        const finalMessageCount = await page.locator('.message').count();
        console.log('Final message count:', finalMessageCount);
        // User Q1, AI A1, User Q2, AI A2 = at least 4
        expect(finalMessageCount).toBeGreaterThanOrEqual(4);

        console.log('Visitor persistence verified successfully');
    });
});
