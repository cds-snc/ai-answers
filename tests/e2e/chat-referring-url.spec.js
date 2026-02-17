import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const TEST_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-admin@example.com';
const TEST_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'password123';

async function sendQuestionAndGetChatId(page, question) {
    const textarea = page.locator('textarea#message');
    await textarea.focus();
    await page.keyboard.type(question);
    await page.waitForTimeout(500);
    await page.locator('.btn-primary-send').click();
    await page.waitForSelector('.message.ai .ai-message-content', { state: 'visible', timeout: 30000 });

    const chatIdText = (await page.locator('.chat-id').last().textContent()) || '';
    const match = chatIdText.match(/Chat ID:\s*([a-z0-9-]+)/i);
    if (!match) {
        throw new Error(`Could not find Chat ID in UI. Text was: "${chatIdText}"`);
    }
    return match[1];
}

async function loginAsAdmin(page) {
    await page.goto('/en/signin');
    await page.fill('#email', TEST_ADMIN_EMAIL);
    await page.fill('#password', TEST_ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.toString().includes('signin'), { timeout: 15000 });
}

async function verifyReferringUrlInReviewMode(page, chatId, expectedUrl) {
    await page.goto(`/en?chat=${encodeURIComponent(chatId)}&review=1`);
    await page.waitForSelector('.referring-url-chat', { timeout: 15000 });
    const topBanner = page.locator('.referring-url-chat').first();
    await expect(topBanner).toContainText(expectedUrl);
}

test.describe('Referring URL Lifecycle', () => {
    test.afterEach(async ({ page }) => {
        if (process.env.TEST_HEADED === 'true') {
            console.log('Test finished, waiting 5s for inspection...');
            await page.waitForTimeout(5000);
        }
    });

    test('should capture referring URL from URL parameter and show it in review mode', async ({ page }) => {
        const testReferrer = 'https://www.canada.ca/en/services/jobs/opportunities.html';
        const encodedReferrer = encodeURIComponent(testReferrer);

        await page.goto(`/en?ref=${encodedReferrer}`);

        await page.waitForSelector('#displayReferringURL', { state: 'visible', timeout: 15000 });
        const hint = page.locator('#displayReferringURL');
        await expect(hint).toContainText('Page you were on:');
        await expect(hint).toContainText('canada.ca/.../opportunities.html');

        const chatId = await sendQuestionAndGetChatId(page, 'Hello, catching ref from URL!');
        await loginAsAdmin(page);
        await verifyReferringUrlInReviewMode(page, chatId, testReferrer);
    });

    test('should capture referring URL from document.referrer simulation and show it in review mode', async ({ page }) => {
        const referrerSite = 'https://external-search.ca/search?q=benefits';
        await page.goto('/en', { referer: referrerSite });

        await page.waitForSelector('#displayReferringURL', { state: 'visible', timeout: 15000 });
        const hint = page.locator('#displayReferringURL');
        await expect(hint).toContainText('Page you were on:');
        await expect(hint).toContainText('external-search.ca/.../');

        const chatId = await sendQuestionAndGetChatId(page, 'Hello, catching ref from document.referrer!');
        await loginAsAdmin(page);
        await verifyReferringUrlInReviewMode(page, chatId, referrerSite);
    });

    test('should allow manual override of referring URL and show it in review mode', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/en');

        const optionsDetails = page.locator('gcds-details[details-title="Options"]');
        await optionsDetails.waitFor({ state: 'visible', timeout: 15000 });
        await optionsDetails.evaluate((el) => {
            el.setAttribute('open', '');
        });
        await page.waitForSelector('#referring-url', { state: 'visible', timeout: 15000 });

        const manualUrl = 'https://manual-override.ca/page';
        await page.fill('#referring-url', manualUrl);
        const chatId = await sendQuestionAndGetChatId(page, 'Hello with manual override!');
        await verifyReferringUrlInReviewMode(page, chatId, manualUrl);
    });

    test('should display referring URL in Review Mode (using API interception)', async ({ page }) => {
        const chatId = 'mock-chat-' + Date.now();
        const testUrl = 'https://canada.ca/referring-viewer-test';

        // Correct pattern based on getApiUrl: /api/db/db-chat
        await page.route('**/api/db/db-chat**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    chat: {
                        chatId,
                        pageLanguage: 'en',
                        referringUrl: testUrl,
                        interactions: [
                            {
                                interactionId: 'inter-1',
                                question: { redactedQuestion: 'test question' },
                                answer: { paragraphs: ['test answer'], answerType: 'normal' },
                                referringUrl: testUrl,
                                createdAt: new Date()
                            }
                        ],
                        createdAt: new Date()
                    }
                })
            });
        });

        await page.goto(`/en?chat=${chatId}&review=1`);

        // Wait for the component to render
        await page.waitForSelector('.referring-url-chat', { timeout: 15000 });

        const topBanner = page.locator('.referring-url-chat').first();
        await expect(topBanner).toContainText(testUrl);

        const infoBox = page.locator('a', { hasText: testUrl }).first();
        await expect(infoBox).toBeVisible();
    });
});
