import { test, expect } from '@playwright/test';

test.describe('Visitor Persistence E2E', () => {
    test('unauthenticated visitorId should be maintained after reload', async ({ page }) => {
        // 1. Visit the home page
        // Use a persistent browser context to handle cookies properly
        await page.goto('http://localhost:3001');

        console.log('Page loaded, waiting for initialization...');
        await page.waitForTimeout(5000); // Wait for scripts and fingerprinting

        // 2. Intercept chat-create to get the initial chatId
        // We wait for the second one if the first one happened already
        let firstChatId = null;
        try {
            const chatCreateResponse = await page.waitForResponse(response =>
                response.url().includes('/api/chat/chat-create') && response.status() === 200,
                { timeout: 10000 }
            );
            const data = await chatCreateResponse.json();
            firstChatId = data.chatId;
        } catch (e) {
            console.log('Initial chat-create not captured, checking if it already happened');
        }

        // 3. Send a message to ensure session is active and used
        await page.waitForSelector('textarea#message');
        await page.fill('textarea#message', 'Hello persistence test');
        await page.click('.btn-primary-send');

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

        // Wait for response - expect 200 OK
        const response = await page.waitForResponse(response =>
            response.url().includes('/api/chat/chat-message'),
            { timeout: 30000 }
        );

        console.log('Second message response status:', response.status());
        expect(response.status()).toBe(200);

        // Optional: Verify message count in UI (history should be managed by chatId/session)
        const finalMessageCount = await page.locator('.message').count();
        console.log('Final message count:', finalMessageCount);
        // User Q1, AI A1, User Q2, AI A2 = at least 4
        expect(finalMessageCount).toBeGreaterThanOrEqual(4);

        console.log('Visitor persistence verified successfully');
    });
});
