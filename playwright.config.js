import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * @see https://playwright.dev/docs/test-configuration
 */

// Load environment variables from .env file
const __dirname_config = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname_config, '.env') });

console.log('E2E Config Environment:', {
    TEST_ENV: process.env.TEST_ENV || 'dev',
    TEST_HEADED: process.env.TEST_HEADED || 'false',
    E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL ? (process.env.E2E_ADMIN_EMAIL.substring(0, 5) + '...') : 'not set'
});

const TEST_ENV = process.env.TEST_ENV || 'dev';

const baseURLs = {
    dev: 'http://localhost:3001',
    sandbox: 'https://ai-answers.cdssandbox.xyz/',
    production: 'https://ai-answers.alpha.canada.ca/',
};

const baseURL = baseURLs[TEST_ENV] || baseURLs.dev;

// Define default test credentials for development
const DEFAULT_ADMIN_EMAIL = 'e2e-admin@example.com';
const DEFAULT_PASSWORD = 'password123';
const DEFAULT_PARTNER_EMAIL = 'e2e-partner@example.com';

process.env.E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
process.env.E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || DEFAULT_PASSWORD;
process.env.E2E_PARTNER_EMAIL = process.env.E2E_PARTNER_EMAIL || DEFAULT_PARTNER_EMAIL;
process.env.E2E_PARTNER_PASSWORD = process.env.E2E_PARTNER_PASSWORD || DEFAULT_PASSWORD;

export default defineConfig({
    testDir: './tests/e2e',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: baseURL,

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
