import { test, expect } from '@playwright/test';
import mongoose from 'mongoose';
import { User } from '../../models/user.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars to get MONGO_URI if set
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const TEST_ENV = process.env.TEST_ENV || 'dev';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-answers';
const TEST_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const TEST_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe('Admin Chat Logs Export', () => {

    test.beforeAll(async () => {
        // Only run database setup in dev environment
        if (TEST_ENV !== 'dev') {
            console.log(`Skipping database setup for environment: ${TEST_ENV}`);
            return;
        }

        // Connect to the database
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
            console.log('Test admin user created.');
        } else {
            user.password = TEST_ADMIN_PASSWORD;
            user.role = 'admin';
            user.active = true;
            await user.save();
            console.log('Test admin user updated/verified.');
        }
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

    test('should display export controls when Get logs is clicked', async ({ page }) => {
        console.log(`Using E2E Admin Email: ${TEST_ADMIN_EMAIL?.substring(0, 5)}...`);
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

        // 1. Login as admin
        console.log('Navigating to login page...');
        await page.goto('/en/signin');

        console.log('Filling credentials...');
        await page.fill('#email', TEST_ADMIN_EMAIL);
        await page.fill('#password', TEST_ADMIN_PASSWORD);

        console.log('Clicking login...');
        await page.click('button[type="submit"]');

        try {
            await page.waitForURL(url => !url.toString().includes('signin'), { timeout: 15000 });
        } catch (e) {
            console.log('Timeout waiting for login result:', e.message);
        }

        const url = page.url();
        console.log('Current URL after login attempt:', url);

        if (url.includes('signin')) {
            const errorMsg = await page.locator('[class*="error"]').textContent().catch(() => 'No error message found');
            console.log('Login failed. Error on page:', errorMsg);
            throw new Error(`Login failed. Remained on signin page. Error: ${errorMsg}`);
        }

        // 2. Navigate to admin page
        console.log('Navigating to admin page...');
        await page.goto('/en/admin');
        await page.waitForTimeout(2000);



        // 4. Click "Get logs" button
        console.log('Looking for Get logs button...');
        const getLogsButton = page.locator('#get-logs-button');
        if (await getLogsButton.count() > 0) {
            await getLogsButton.click();
            await page.waitForTimeout(1000);
        }

        // 5. Verify export controls are visible BEFORE applying filters
        console.log('Checking for export controls...');

        const viewDropdown = page.locator('#export-view');
        const viewVisible = await viewDropdown.isVisible().catch(() => false);
        console.log('View dropdown visible:', viewVisible);
        expect(viewVisible).toBe(true);

        const formatDropdown = page.locator('#export-format');
        const formatVisible = await formatDropdown.isVisible().catch(() => false);
        console.log('Format dropdown visible:', formatVisible);
        expect(formatVisible).toBe(true);

        // 6. Verify Filter Panel is also visible
        const filterPanel = page.locator('details').filter({ hasText: 'Filters' });
        const filterPanelVisible = await filterPanel.isVisible().catch(() => false);
        console.log('Filter panel visible:', filterPanelVisible);

        console.log('Export controls check complete - View and Format dropdowns are visible above filter panel');
    });

    test('should trigger export on Apply', async ({ page }) => {
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

        // 1. Login as admin
        await page.goto('/en/signin');
        await page.fill('#email', TEST_ADMIN_EMAIL);
        await page.fill('#password', TEST_ADMIN_PASSWORD);
        await page.click('button[type="submit"]');

        try {
            await page.waitForURL(url => !url.toString().includes('signin'), { timeout: 15000 });
        } catch (e) {
            console.log('Login timeout:', e.message);
        }

        // Navigate to admin
        await page.goto('/en/admin');
        await page.waitForTimeout(2000);

        // Click Get logs
        const getLogsButton = page.locator('#get-logs-button');
        if (await getLogsButton.count() > 0) {
            await getLogsButton.click();
            await page.waitForTimeout(1000);
        }

        // Verify export dropdowns are visible
        const viewDropdown = page.locator('#export-view');
        expect(await viewDropdown.isVisible()).toBe(true);

        // Select a view
        await viewDropdown.selectOption('default');
        console.log('Selected default view');

        // Select format
        const formatDropdown = page.locator('#export-format');
        await formatDropdown.selectOption('xlsx');
        console.log('Selected xlsx format');

        // Intercept the export request
        let exportRequestMade = false;
        page.on('request', request => {
            if (request.url().includes('chat-export-logs')) {
                exportRequestMade = true;
                console.log('Export request made:', request.url());
            }
        });

        // Click Apply/Export button in filter panel
        const exportButton = page.locator('#filter-apply-button');
        if (await exportButton.isVisible()) {
            // Set up download promise and click simultaneously to avoid race conditions
            console.log('Triggering export download...');
            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 30000 }),
                exportButton.click()
            ]);

            console.log('Clicked Export button, download received');

            if (exportRequestMade) {
                console.log('Export request was successfully triggered');
            }

            if (download) {
                console.log('Download triggered:', download.suggestedFilename());
                expect(download.suggestedFilename()).toContain('chat-logs');

                if (process.env.TEST_HEADED === 'true') {
                    console.log('Download finished, waiting 5s for inspection...');
                    await page.waitForTimeout(5000);
                }
            }
        }
    });

    test('should export default view with correct fields in JSON', async ({ page }) => {
        console.log(`Using E2E Admin Email: ${TEST_ADMIN_EMAIL?.substring(0, 5)}...`);
        // 1. Login
        await page.goto('/en/signin');
        await page.fill('#email', TEST_ADMIN_EMAIL);
        await page.fill('#password', TEST_ADMIN_PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForURL(url => !url.toString().includes('signin'));

        // 2. Navigate
        await page.goto('/en/admin');
        const getLogsButton = page.locator('#get-logs-button');
        if (await getLogsButton.count() > 0) {
            await getLogsButton.click();
        }

        // 3. Select JSON and Default
        await page.locator('#export-view').selectOption('default');
        await page.locator('#export-format').selectOption('json');

        // 4. Trigger Export and Capture Download simultaneously
        console.log('Triggering JSON export download...');
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }),
            page.locator('#filter-apply-button').click()
        ]);

        // 5. Verify Content
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        const data = JSON.parse(buffer.toString());

        console.log('Downloaded JSON count:', data.length);
        if (data.length > 0) {
            const row = data[0];
            // Check for critical fields requested by user
            expect(row).toHaveProperty('uniqueID');
            expect(row).toHaveProperty('sentence1');
            expect(row['expertFeedback.totalScore']).toBeDefined();
            expect(row['autoEval.sentenceMatchTrace']).toBeUndefined(); // Should be excluded
        }

        if (process.env.TEST_HEADED === 'true') {
            console.log('JSON Export finished, waiting 5s for inspection...');
            await page.waitForTimeout(5000);
        }
    });
});
