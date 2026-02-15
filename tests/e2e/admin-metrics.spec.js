import { test, expect } from '@playwright/test';
import mongoose from 'mongoose';
import { User } from '../../models/user.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const TEST_ENV = process.env.TEST_ENV || 'dev';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dev-database?authSource=admin';
const TEST_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const TEST_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe('Admin Metrics Dashboard', () => {

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
        console.log('Test user setup complete.');
    });

    test.afterEach(async ({ page }) => {
        if (process.env.TEST_HEADED === 'true') {
            console.log('Test finished, waiting 5s for inspection...');
            await page.waitForTimeout(5000);
        }
    });

    test.afterAll(async () => {
        if (TEST_ENV === 'dev' && mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    });

    test('should load metrics when Apply is clicked', async ({ page }) => {
        const fs = await import('fs');
        const log = (msg) => {
            try { fs.appendFileSync('test-progress.log', msg + '\n'); } catch (e) { }
        };
        // Clear previous log
        try { fs.writeFileSync('test-progress.log', ''); } catch (e) { }

        log('--- Test Started ---');

        page.on('console', msg => log('PAGE LOG: ' + msg.text()));
        page.on('pageerror', err => log('PAGE ERROR: ' + err.message));
        page.on('dialog', async dialog => {
            log(`PAGE DIALOG: ${dialog.type()} "${dialog.message()}"`);
            await dialog.accept();
        });
        page.on('request', request => {
            if (request.url().includes('/api/')) log(`REQUEST: ${request.method()} ${request.url()}`);
        });
        page.on('requestfailed', request => {
            if (request.url().includes('/api/')) log(`REQUEST FAILED: ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
        });

        // 1. Login
        log('Navigating to login...');
        await page.goto('/en/signin');

        const loginResponsePromise = page.waitForResponse(response =>
            response.url().includes('/api/auth/auth-login'),
            { timeout: 15000 }
        );

        await page.fill('#email', TEST_ADMIN_EMAIL);
        await page.fill('#password', TEST_ADMIN_PASSWORD);
        await page.click('button[type="submit"]');

        const loginResponse = await loginResponsePromise;
        const loginData = await loginResponse.json();
        log('Login API Response: ' + JSON.stringify(loginData));

        if (loginResponse.status() !== 200) {
            log('Login failed status: ' + loginResponse.status());
            throw new Error(`Login failed with status ${loginResponse.status()}`);
        }

        // Wait for redirection
        log('Waiting for redirection...');
        await page.waitForURL(url => !url.toString().includes('signin'), { timeout: 15000 });

        // 2. Navigate to Metrics
        log('Navigating to metrics...');
        await page.goto('/en/metrics');
        await page.waitForTimeout(2000);

        // 3. Trigger Metrics
        log('Clicking Apply...');
        const applyBtn = page.locator('#filter-apply-button');
        await applyBtn.waitFor({ state: 'visible', timeout: 5000 });

        // Wait for ANY response from metrics endpoint (not just 200)
        const metricsPromise = page.waitForResponse(response =>
            response.url().includes('/api/metrics/metrics-usage'),
            { timeout: 30000 }
        );

        await applyBtn.click();
        log('Waiting for metrics response...');
        const metricsResponse = await metricsPromise;
        log('Metrics response status: ' + metricsResponse.status());

        if (metricsResponse.status() !== 200) {
            const errorBody = await metricsResponse.json();
            const debugInfo = JSON.stringify(errorBody, null, 2);
            log('Metrics API Error Body: ' + debugInfo);
            fs.writeFileSync('debug-result.json', debugInfo);
            throw new Error(`Metrics API failed with status ${metricsResponse.status()}`);
        }
        const metricsData = await metricsResponse.json();
        log('Metrics Success.');
        expect(metricsData.success).toBe(true);

        await expect(page.locator('h2').filter({ hasText: /Metrics|Mesures/i })).toBeVisible();
    });
});
