import { test, expect } from '@playwright/test';

// Set to 'true' to enable logging of API requests/responses
const DEBUG_API = process.env.DEBUG_API === 'true';
// Set to 'true' to enable forwarding of page console to test output
const DEBUG_PAGE = process.env.DEBUG_PAGE === 'true';

test.describe('AI Answers Webapp Testing', () => {
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


  test('should ask two questions in the same session and get responses', async ({ page }) => {
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

    await page.goto('/');

    // Wait for page to fully load
    await page.waitForTimeout(5000);
    console.log('Page loaded, waiting 5 seconds for full initialization');

    // Wait for the textarea
    await page.waitForSelector('textarea#message', { timeout: 30000 });
    console.log('Textarea is present');

    const textarea = page.locator('textarea#message');
    await textarea.focus();
    await page.keyboard.type('What is SCIS?');
    await expect(textarea).toHaveValue('What is SCIS?');
    console.log('Filled and verified the question');

    // Wait a moment for React state to update
    await page.waitForTimeout(500);

    // Debug: Check if button exists without visible class
    const sendButtonBase = await page.locator('.btn-primary-send').count();
    console.log('Send button exists (.btn-primary-send):', sendButtonBase > 0);

    // Debug: Check button classes
    const buttonClasses = await page.locator('.btn-primary-send').getAttribute('class');
    console.log('Send button classes:', buttonClasses);

    // Debug: Check if button is disabled
    const isDisabled = await page.locator('.btn-primary-send').isDisabled();
    console.log('Send button disabled:', isDisabled);

    // Try clicking it - don't wait for visible class since it's not being added
    console.log('Attempting to click send button...');
    try {
      await page.locator('.btn-primary-send').click();
      console.log('Send button clicked');
    } catch (err) {
      console.log('Button click failed:', err.message);
      throw err;
    }

    // Wait a bit and check page state
    await page.waitForTimeout(2000);

    // Check if any messages exist
    const messageCount = await page.locator('.message').count();
    console.log('Message count after click:', messageCount);

    // Check for errors in console
    const errors = await page.evaluate(() => {
      return window.__errors || [];
    });
    console.log('Window errors:', errors);
    console.log('JS Errors captured:', jsErrors);

    // Try to find loading or error indicators
    const hasLoading = await page.locator('.loading-container').isVisible({ timeout: 1000 }).catch(() => false);
    const hasError = await page.locator('[class*="error"]').count().then(c => c > 0);
    console.log('Has loading container:', hasLoading);
    console.log('Has error element:', hasError);

    // Wait for response
    await page.waitForSelector('.loading-container', { state: 'detached', timeout: 30010 });
    console.log('First response complete');

    // --- SECOND QUESTION ---
    console.log('Starting second question...');

    // Switched to focus() and keyboard.type() per user request
    await textarea.focus();
    await page.keyboard.type('Where are the forms?');
    await expect(textarea).toHaveValue('Where are the forms?');
    console.log('Filled and verified the second question');

    // Click send again
    await page.locator('.btn-primary-send').click();
    console.log('Second click sent');

    // Wait for second response
    // First wait for loading to appear (it might be fast, so we handle it)
    await page.waitForSelector('.loading-container', { timeout: 2000 }).catch(() => { });
    await page.waitForSelector('.loading-container', { state: 'detached', timeout: 30010 });
    console.log('Second response complete');

    // Final check for message count (should be at least 4: User Q1, Bot A1, User Q2, Bot A2)
    const finalMessageCount = await page.locator('.message').count();
    console.log('Final message count:', finalMessageCount);
    expect(finalMessageCount).toBeGreaterThanOrEqual(4);

    // Explicitly check for AI content and ensure no error box
    await expect(page.locator('.ai-message-content').last()).toBeVisible();
    await expect(page.locator('.error-message-box')).not.toBeVisible();

    console.log('Test completed successfully (multi-turn verified)');
  });


});
