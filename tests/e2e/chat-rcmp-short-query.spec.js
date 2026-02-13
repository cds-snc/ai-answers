import { test, expect } from '@playwright/test';

// Set to 'true' to enable logging of API requests/responses
const DEBUG_API = process.env.DEBUG_API === 'true';
// Set to 'true' to enable forwarding of page console to test output
const DEBUG_PAGE = process.env.DEBUG_PAGE === 'true';

test.describe('AI Answers Webapp Testing (Short Query Follow-ups)', () => {
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

  test('should block short query then accept follow-up questions', async ({ page }) => {
    // Navigate to English page
    await page.goto('http://localhost:3001');

    // Wait for the textarea
    const textarea = page.locator('textarea#message');
    await textarea.scrollIntoViewIfNeeded();
    await expect(textarea).toBeVisible({ timeout: 30000 });

    // 1) Short query should be blocked
    await textarea.fill('rcmp');
    await expect(textarea).toHaveValue('rcmp');
    await page.locator('.btn-primary-send').click();

    const shortQueryMessage = 'Your question was too short.';
    const shortQueryError = page.locator('.error-message-box .error-message', {
      hasText: shortQueryMessage
    });
    await expect(shortQueryError).toBeVisible({ timeout: 30000 });

    // 2) Ask the RCMP headquarters question
    await textarea.scrollIntoViewIfNeeded();
    await textarea.fill('Where is the RCMP headquarters?');
    await expect(textarea).toHaveValue('Where is the RCMP headquarters?');
    await page.locator('.btn-primary-send').click();

    await page.waitForSelector('.loading-container', { state: 'detached', timeout: 30000 });

    const firstAnswer = page.locator('.message').last();
    await expect(firstAnswer).toBeVisible();

    // 3) Add a follow-up
    await textarea.scrollIntoViewIfNeeded();
    await textarea.fill('In Manitoba');
    await expect(textarea).toHaveValue('In Manitoba');
    await page.locator('.btn-primary-send').click();

    await page.waitForSelector('.loading-container', { state: 'detached', timeout: 30000 });

    const secondAnswer = page.locator('.message').last();
    await expect(secondAnswer).toBeVisible();

    // Allow time for manual inspection in headed mode
    await page.waitForTimeout(5000);
  });
});
