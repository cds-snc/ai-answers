import { test, expect } from '@playwright/test';
import mongoose from 'mongoose';
import { User } from '../../models/user.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Helper: poll the public settings endpoint until the expected value is observed
async function waitForSetting(page, key, expectedValue, timeoutMs = 10000, intervalMs = 500) {
    const url = `/api/setting/setting-public-handler?key=${encodeURIComponent(key)}`;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const resp = await page.request.get(url);
            if (resp && resp.ok()) {
                const data = await resp.json();
                if (String(data.value) === String(expectedValue)) return true;
            }
        } catch (e) {
            // ignore network errors and retry
        }
        await page.waitForTimeout(intervalMs);
    }
    throw new Error(`Timed out waiting for setting ${key}=${expectedValue}`);
}

const TEST_ENV = process.env.TEST_ENV || 'dev';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dev-database?authSource=admin';
const TEST_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const TEST_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

// Pause after the second test for local inspection (ms). Can be overridden with E2E_PAUSE_MS env var.
// Only pause when running in headed mode. The test runner sets TEST_HEADED when running headed.
// Default to 5s for headed inspection to reduce wait time
const E2E_PAUSE_MS = Number(process.env.E2E_PAUSE_MS || '5000');
const TEST_HEADED = String(process.env.TEST_HEADED || '').toLowerCase() === 'true' || String(process.env.TEST_HEADED || '') === '1';

// Increase test timeout because this spec intentionally waits 121s + optional pause
// Set to 5 minutes to allow TTL wait + inspection pause without failing the test
test.setTimeout(300000);

test.describe.serial('Session timeout behaviour', () => {
    test.beforeAll(async () => {
        // Only run database setup in dev environment
        if (TEST_ENV !== 'dev') {
            console.log(`Skipping database setup for environment: ${TEST_ENV}`);
            return;
        }

        console.log('Connecting to DB at:', MONGODB_URI);
        await mongoose.connect(MONGODB_URI);

        // Ensure test admin user exists
        let user = await User.findOne({ email: TEST_ADMIN_EMAIL });
        if (!user) {
            console.log('Creating test admin user...');
            user = new User({
                email: TEST_ADMIN_EMAIL,
                password: TEST_ADMIN_PASSWORD,
                role: 'admin',
                active: true
            });
            await user.save();
        } else {
            user.password = TEST_ADMIN_PASSWORD;
            user.role = 'admin';
            user.active = true;
            await user.save();
        }
        console.log('Test admin user ready.');
    });

    test.afterAll(async () => {
        if (TEST_ENV === 'dev' && mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    });

    test.afterEach(async ({ page }) => {
        if (process.env.TEST_HEADED === 'true') {
            console.log('Test finished, waiting 5s for inspection...');
            await page.waitForTimeout(5000);
        }
    });

    // Skip tests that require mutating state in remote environments
    test.beforeEach(async ({ }, testInfo) => {
        if (TEST_ENV !== 'dev') {
            console.log(`Skipping test ${testInfo.title} in environment: ${TEST_ENV} (requires configuration mutation)`);
            test.skip();
        }
    });

    test('unauthenticated single question does NOT trigger timeout', async ({ page }) => {
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

        // 1) Login and set non-authenticated session TTL to 1 minute
        console.log('Navigating to login...');
        await page.goto('/en/signin');

        const loginResponsePromise = page.waitForResponse(response =>
            response.url().includes('/api/auth/auth-login'), { timeout: 15000 }
        );

        await page.fill('#email', TEST_ADMIN_EMAIL);
        await page.fill('#password', TEST_ADMIN_PASSWORD);
        await page.click('button[type="submit"]');

        const loginResponse = await loginResponsePromise;
        const loginData = await loginResponse.json();
        console.log('Login API Response:', JSON.stringify(loginData));
        expect(loginResponse.status()).toBe(200);

        // Wait for redirect away from signin
        await page.waitForURL(url => !url.toString().includes('signin'), { timeout: 15000 });

        // Go to settings page and set non-authenticated session TTL to 1 minute
        console.log('Navigating to settings page...');
        await page.goto('/en/settings');
        try { await page.click('text=Session settings'); } catch (e) { }
        await page.waitForSelector('#session-ttl', { timeout: 10000 });
        await page.fill('#session-ttl', '1');
        await page.locator('body').click();
        await page.waitForTimeout(500);
        // Verify the TTL setting persisted via the public settings endpoint
        await waitForSetting(page, 'session.defaultTTLMinutes', '1', 10000);

        // Return to admin and logout so subsequent chat is unauthenticated
        console.log('Returning to admin page...');
        await page.goto('/en/admin');
        await page.waitForSelector('text=AI Answers');
        console.log('Logging out...');
        await page.click('text=Sign out');
        await page.waitForURL(url => url.pathname.includes('/signin') || url.pathname.endsWith('/signin'), { timeout: 10000 });

        // 2) Navigate to chat and send a single question as unauthenticated user
        console.log('Navigating to chat...');
        await page.goto('/en/');
        await page.waitForSelector('textarea#message', { timeout: 5000 });
        const textarea = page.locator('textarea#message');
        await textarea.focus();
        await page.keyboard.type('What is SCIS?');
        await expect(textarea).toHaveValue('What is SCIS?');
        await page.locator('.btn-primary-send').click();

        // Wait briefly for a response (or system message)
        await page.waitForTimeout(3000);

        // Ensure timeout message is NOT present shortly after a single question
        const timeoutMessage = 'Your session has timed out. Please reload the page to start a new chat.';
        const foundTimeout = await page.locator(`text=${timeoutMessage}`).count();
        expect(foundTimeout).toBe(0);
    });

    test('unauthenticated session expires after configured TTL', async ({ page }) => {
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

        // 1) Login
        console.log('Navigating to login...');
        await page.goto('/en/signin');

        const loginResponsePromise = page.waitForResponse(response =>
            response.url().includes('/api/auth/auth-login'), { timeout: 15000 }
        );

        await page.fill('#email', TEST_ADMIN_EMAIL);
        await page.fill('#password', TEST_ADMIN_PASSWORD);
        await page.click('button[type="submit"]');

        const loginResponse = await loginResponsePromise;
        const loginData = await loginResponse.json();
        console.log('Login API Response:', JSON.stringify(loginData));
        expect(loginResponse.status()).toBe(200);

        // Wait for redirect away from signin
        await page.waitForURL(url => !url.toString().includes('signin'), { timeout: 15000 });

        // 2) Go to settings page and set non-authenticated session TTL to 1 minute
        console.log('Navigating to settings page...');
        await page.goto('/en/settings');
        // Expand the Session settings details panel if collapsed
        try {
            await page.click('text=Session settings');
        } catch (e) {
            // ignore if not present/already expanded
        }
        await page.waitForSelector('#session-ttl', { timeout: 10000 });

        // Set to 1 minute
        await page.fill('#session-ttl', '1');
        // Trigger change handling by blurring
        await page.locator('body').click();
        // Small delay to allow save to persist
        await page.waitForTimeout(500);
        // Verify the TTL setting persisted via the public settings endpoint
        await waitForSetting(page, 'session.defaultTTLMinutes', '1', 10000);

        // 3) Go back to admin
        console.log('Returning to admin page...');
        await page.goto('/en/admin');
        await page.waitForSelector('text=AI Answers');

        // 4) Logout
        console.log('Logging out...');
        await page.click('text=Sign out');
        // Wait for signin page
        await page.waitForURL(url => url.pathname.includes('/signin') || url.pathname.endsWith('/signin'), { timeout: 10000 });

        // 5) Ask question(s) on chat as unauthenticated user — send two to ensure session starts
        console.log('Navigating to chat...');
        await page.goto('/en/');
        await page.waitForSelector('textarea#message', { timeout: 5000 });
        const textarea = page.locator('textarea#message');
        await textarea.focus();
        await page.keyboard.type('What is SCIS?');
        await expect(textarea).toHaveValue('What is SCIS?');
        await page.locator('.btn-primary-send').click();

        // Wait briefly for first response (or system message)
        await page.waitForTimeout(3000);

        // Wait 1 minute after the first answer for the session to expire,
        // then send the follow-up which should trigger the timeout message.
        console.log('Waiting 121 seconds for session TTL to expire after first answer...');
        await page.waitForTimeout(121000);

        // Now ask the follow-up question which should trigger session timeout handling
        await textarea.focus();
        await page.keyboard.type('Where are the forms');
        // Capture the graph-run POST response so we can inspect server payloads
        const graphResponsePromise = page.waitForResponse(response =>
            response.url().includes('/api/chat/chat-graph-run') && response.request().method() === 'POST', { timeout: 30000 }
        );
        await page.locator('.btn-primary-send').click();
        try {
            const graphResp = await graphResponsePromise;
            let graphBody = null;
            try {
                graphBody = await graphResp.text();
            } catch (e) {
                graphBody = `<unreadable: ${e.message}>`;
            }
            console.log('GRAPH-RUN RESPONSE STATUS:', graphResp.status(), 'BODY:', graphBody);
        } catch (e) {
            console.log('GRAPH-RUN response wait failed:', e.message);
        }

        // The UI should append a message indicating session timed out
        const timeoutMessage = 'Your session has timed out. Please reload the page to start a new chat.';
        await page.waitForSelector(`text=${timeoutMessage}`, { timeout: 30000 });
        const foundText = await page.locator(`text=${timeoutMessage}`).count();
        expect(foundText).toBeGreaterThan(0);
    });
});
