import { test, expect } from '@playwright/test';

// Set to 'true' to enable logging of API requests/responses
const DEBUG_API = process.env.DEBUG_API === 'true';
// Set to 'true' to enable forwarding of page console to test output
const DEBUG_PAGE = process.env.DEBUG_PAGE === 'true';

test.describe('AI Answers Webapp Testing (French RCMP)', () => {
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

  test('should answer RCMP headquarters question in French with no errors', async ({ page }) => {
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

    // Navigate to French page
    await page.goto('/fr');
    await page.waitForTimeout(5000);

    // Confirm French chat UI
    const textarea = page.locator('textarea#message');
    await textarea.scrollIntoViewIfNeeded();
    await expect(textarea).toBeVisible({ timeout: 30000 });
    await expect(textarea).toHaveAttribute('aria-label', /Posez une question/i);
    await expect(page.locator('.btn-primary-send')).toContainText('Envoyer');

    // Ask the question in English on the French page
    const question = 'Where is the headquarters of the RCMP?';
    await textarea.focus();
    await page.keyboard.type(question);
    await expect(textarea).toHaveValue(question);

    await page.locator('.btn-primary-send').click();

    // Wait for response
    await page.waitForSelector('.loading-container', { state: 'detached', timeout: 30000 });

    // Ensure no service error message is shown
    const errorText = 'Désolé, nous avons un problème de connexion au service en ce moment. Veuillez réessayer dans quelques minutes.';
    const errorLocator = page.locator('p.error-message', { hasText: errorText });
    await expect(errorLocator).not.toBeVisible({ timeout: 1000 });

    // Validate we received a response
    const lastMessage = page.locator('.ai-message-content').last();
    await expect(lastMessage).toBeVisible();

    const responseText = (await lastMessage.textContent())?.trim() || '';
    expect(responseText.length).toBeGreaterThan(0);

    // Heuristic checks to ensure the response is in French
    const hasFrenchDiacritics = /[àâäçéèêëîïôöùûüÿœæ]/i.test(responseText);
    const hasFrenchCommonWords = /\b(la|le|les|des|du|de|est|sont|se|au|aux|pour|dans|sur|siege|gendarmerie|royale|canada)\b/i.test(responseText);

    expect(responseText).toMatch(/\b(GRC|Gendarmerie royale du Canada)\b/i);
    expect(hasFrenchDiacritics || hasFrenchCommonWords).toBe(true);
    expect(responseText).not.toMatch(/\bheadquarters\b/i);

    console.log('Test passed: French response received with no errors.');
    console.log('JS Errors captured:', jsErrors);
  });
});
