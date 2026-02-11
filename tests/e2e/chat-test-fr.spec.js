import { test, expect } from '@playwright/test';

// Set to 'true' to enable logging of API requests/responses
const DEBUG_API = process.env.DEBUG_API === 'true';
// Set to 'true' to enable forwarding of page console to test output
const DEBUG_PAGE = process.env.DEBUG_PAGE === 'true';

test.describe('AI Answers Webapp Testing (French)', () => {
    test.beforeEach(async ({ page }) => {
        // Block known third-party tracker that navigates away in tests
        try {
            await page.route('**/*demdex.net/*', (route) => route.abort());
        } catch (e) {
            // ignore routing failures
        }

        // Forward browser console to test output for debugging (when enabled)
        if (DEBUG_PAGE) {
            page.on('console', (msg) => console.log('PAGE LOG>', msg.text()));
        }

        // Log API network requests when DEBUG_API is enabled
        page.on('request', (request) => {
            if (DEBUG_API && request.url().includes('/api/')) {
                console.log(`→ ${request.method()} ${request.url()}`);
            }
        });

        // Log API responses (success or failure) when DEBUG_API is enabled
        page.on('response', (response) => {
            const status = response.status();
            const url = response.url();
            const method = response.request().method();
            if (url.includes('/api/') && DEBUG_API) {
                if (response.ok()) {
                    console.log(`✓ ${status} ${method} ${url.split('/api/')[1]}`);
                } else {
                    console.log(`✗ ${status} ${method} ${url.split('/api/')[1]}`);
                }
            }
        });
    });

    test('should ask two questions in French and NOT see error message', async ({ page }) => {
        // Capture JavaScript errors
        const jsErrors = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                jsErrors.push(msg.text());
            }
        });
        page.on('pageerror', (err) => {
            jsErrors.push(err.toString());
            console.log(`JS Error: ${err.toString()}`);
        });

        // 1. Navigate to French page
        await page.goto('http://localhost:3001/fr');

        // Wait for page to fully load
        await page.waitForTimeout(5000);
        console.log('Page loaded');

        // Wait for the textarea
        await page.waitForSelector('textarea#message', { timeout: 30000 });
        const textarea = page.locator('textarea#message');

        // 2. First Question
        console.log('Asking first question...');
        await textarea.focus();
        await page.type('textarea#message', 'De quoi est le carte de indian status?');
        await expect(textarea).toHaveValue('De quoi est le carte de indian status?');

        // Click send
        await page.locator('.btn-primary-send').click();
        console.log('First question sent');

        // Wait for loading to finish
        await page.waitForSelector('.loading-container', { state: 'detached', timeout: 30000 });
        console.log('First response sequence completed');

        // CHECK FOR ERROR
        const errorText = 'Désolé, nous avons un problème de connexion au service en ce moment. Veuillez réessayer dans quelques minutes.';
        const errorLocator = page.locator('p.error-message', { hasText: errorText });

        // Expect error NOT to be visible
        await expect(errorLocator).not.toBeVisible({ timeout: 1000 }); // Fast check

        // Expect an answer message
        const messageLocator = page.locator('.message').last();
        await expect(messageLocator).toBeVisible();

        // 3. Second Question
        console.log('Asking second question...');
        await textarea.focus();
        await page.type('textarea#message', 'Ou est les formulaires pour appliquer?');

        // Click send
        await page.locator('.btn-primary-send').click();
        console.log('Second question sent');

        // Wait for loading to finish
        await page.waitForSelector('.loading-container', { state: 'detached', timeout: 30000 });
        console.log('Second response sequence completed');

        // CHECK FOR ERROR AGAIN
        await expect(errorLocator).not.toBeVisible({ timeout: 1000 });

        // Expect an answer message
        const lastMessage = page.locator('.message').last();
        await expect(lastMessage).toBeVisible();

        // Verify we have at least 4 messages (Q1, A1, Q2, A2)
        const count = await page.locator('.message').count();
        expect(count).toBeGreaterThanOrEqual(4);

        console.log('Test passed: No errors found and answers received.');
    });
});
