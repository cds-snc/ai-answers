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

  test.afterEach(async ({ page }) => {
    if (process.env.TEST_HEADED === 'true') {
      console.log('Test finished, waiting 5s for inspection...');
      await page.waitForTimeout(5000);
    }
  });

  test('should block short query then accept follow-up questions', async ({ page }) => {
    // Navigate to English page
    await page.goto('/');

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

    const firstAnswer = page.locator('.ai-message-content').last();
    await expect(firstAnswer).toBeVisible({ timeout: 30000 });

    // VERIFY: The next message should be a real AI answer (error box may remain)

    const firstText = await firstAnswer.textContent();
    console.log('First answer text:', firstText);
    expect(firstText.toLowerCase()).toMatch(/ottawa|leikin|headquarters/);

    // 3) Add a follow-up
    await textarea.scrollIntoViewIfNeeded();
    await textarea.fill('In Manitoba');
    await expect(textarea).toHaveValue('In Manitoba');
    await page.locator('.btn-primary-send').click();

    await page.waitForSelector('.loading-container', { state: 'detached', timeout: 30000 });

    const secondAnswer = page.locator('.ai-message-content').last();
    await expect(secondAnswer).toBeVisible({ timeout: 30000 });

    // VERIFY: The follow-up should also be a real answer
    const secondText = await secondAnswer.textContent();
    console.log('Second answer text:', secondText);
    // It should talk about Manitoba or Winnipeg in the context of RCMP
    expect(secondText.toLowerCase()).toMatch(/manitoba|winnipeg|d division/);
  });
});
