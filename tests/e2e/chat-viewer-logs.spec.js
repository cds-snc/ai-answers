import { test, expect } from '@playwright/test';
import mongoose from 'mongoose';
import { User } from '../../models/user.js';
import { Logs } from '../../models/logs.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Load env vars to get MONGO_URI if set
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const TEST_ENV = process.env.TEST_ENV || 'dev';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-answers';
const TEST_USER_EMAIL = process.env.E2E_ADMIN_EMAIL;
const TEST_USER_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const TEST_CHAT_ID = 'e2e-test-chat-' + Date.now();
const STORAGE_PATH = path.join(__dirname, '../../storage/chat-logs');

test.describe('ChatViewer - Log Loading', () => {
    test.beforeAll(async () => {
        // Only run database setup in dev environment
        if (TEST_ENV !== 'dev') {
            console.log(`Skipping database setup for environment: ${TEST_ENV}`);
            return;
        }

        // Connect to the database
        console.log('Connecting to DB at:', MONGODB_URI);
        await mongoose.connect(MONGODB_URI);

        // Ensure test user exists with admin role (needed to access ChatViewer)
        let user = await User.findOne({ email: TEST_USER_EMAIL });
        if (!user) {
            console.log('Creating test user...');
            user = new User({
                email: TEST_USER_EMAIL,
                password: TEST_USER_PASSWORD,
                role: 'admin',
                active: true
            });
            await user.save();
            console.log('Test user created.');
        } else {
            user.password = TEST_USER_PASSWORD;
            user.role = 'admin';
            user.active = true;
            await user.save();
            console.log('Test user updated/verified.');
        }

        // Create legacy MongoDB log for testing
        console.log('Creating legacy MongoDB log...');
        await Logs.create({
            chatId: TEST_CHAT_ID,
            logLevel: 'info',
            message: 'Legacy MongoDB log entry for E2E test',
            metadata: { source: 'mongodb', testType: 'legacy' }
        });
        console.log('Legacy log created.');

        // Create storage log (filesystem) for testing
        console.log('Creating filesystem storage log...');
        const chatStoragePath = path.join(STORAGE_PATH, TEST_CHAT_ID, 'e2e-test');
        fs.mkdirSync(chatStoragePath, { recursive: true });

        const storageLogEntry = {
            chatId: TEST_CHAT_ID,
            logLevel: 'debug',
            message: 'New storage log entry for E2E test',
            metadata: { source: 'storage', testType: 'new' },
            createdAt: new Date().toISOString()
        };

        const logFilePath = path.join(chatStoragePath, `${Date.now()}.json`);
        fs.writeFileSync(logFilePath, JSON.stringify(storageLogEntry, null, 2));
        console.log('Storage log created at:', logFilePath);
    });

    test.afterEach(async ({ page }) => {
        if (process.env.TEST_HEADED === 'true') {
            console.log('Test finished, waiting 5s for inspection...');
            await page.waitForTimeout(5000);
        }
    });

    test.afterAll(async () => {
        if (TEST_ENV !== 'dev') return;

        // Cleanup test data
        console.log('Cleaning up test data...');
        await Logs.deleteMany({ chatId: TEST_CHAT_ID });

        // Remove test storage directory
        const chatStoragePath = path.join(STORAGE_PATH, TEST_CHAT_ID);
        if (fs.existsSync(chatStoragePath)) {
            fs.rmSync(chatStoragePath, { recursive: true, force: true });
        }

        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        console.log('Cleanup complete.');
    });

    test('should load and display both legacy MongoDB logs and new storage logs', async ({ page }) => {
        // Handle console logs
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

        // 1. Login
        console.log('Navigating to login page...');
        await page.goto('/en/signin');

        console.log('Filling credentials...');
        await page.fill('#email', TEST_USER_EMAIL);
        await page.fill('#password', TEST_USER_PASSWORD);

        console.log('Clicking login...');
        await page.click('button[type="submit"]');

        // Wait for redirect
        await page.waitForURL(url => !url.toString().includes('signin'), { timeout: 15000 });
        console.log('Login successful');

        // 2. Navigate to ChatViewer
        console.log('Navigating to ChatViewer...');
        await page.goto('/en/chat-viewer');
        await page.waitForSelector('#chatIdInput');

        // 3. Enter chatId and fetch logs
        console.log('Entering chat ID:', TEST_CHAT_ID);
        await page.click('#chatIdInput');
        await page.type('#chatIdInput', TEST_CHAT_ID, { delay: 100 });
        await page.waitForTimeout(500);

        console.log('Clicking refresh button...');
        await page.click('#refresh-logs-button');

        // Wait for table to load
        await page.waitForTimeout(1000); // Allow time for logs to load

        // 4. Verify logs are displayed
        console.log('Verifying logs are displayed...');

        // Check that the table has rows
        const tableRows = page.locator('table.display tbody tr');
        const rowCount = await tableRows.count();
        console.log('Found rows:', rowCount);

        // Should have at least 2 logs (1 legacy MongoDB + 1 storage)
        expect(rowCount).toBeGreaterThanOrEqual(2);

        // Verify legacy MongoDB log is present
        const legacyLogText = await page.locator('td:has-text("Legacy MongoDB log entry")').count();
        expect(legacyLogText).toBeGreaterThan(0);
        console.log('Legacy MongoDB log found');

        // Verify storage log is present
        const storageLogText = await page.locator('td:has-text("New storage log entry")').count();
        expect(storageLogText).toBeGreaterThan(0);
        console.log('Storage log found');

        // 5. Verify log levels are displayed correctly
        const infoLevelBadge = await page.locator('td:has-text("info")').count();
        const debugLevelBadge = await page.locator('td:has-text("debug")').count();
        expect(infoLevelBadge).toBeGreaterThan(0);
        expect(debugLevelBadge).toBeGreaterThan(0);
        console.log('Log levels verified');

        // 6. Test metadata expansion
        console.log('Testing metadata expansion...');
        const expandButton = page.locator('button.expand-button').first();
        if (await expandButton.isVisible()) {
            await expandButton.click();

            // Wait for modal to appear
            await page.waitForSelector('.metadata-modal', { timeout: 5000 });

            // Check modal contains metadata
            const modalContent = await page.locator('.metadata-modal code').textContent();
            expect(modalContent).toContain('source');
            console.log('Metadata modal verified');

            // Close modal
            await page.click('gcds-button:has-text("Close")');
        }

        console.log('ChatViewer E2E test completed successfully');
    });

    test('should filter logs by level', async ({ page }) => {
        // Login
        await page.goto('/en/signin');
        await page.fill('#email', TEST_USER_EMAIL);
        await page.fill('#password', TEST_USER_PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForURL(url => !url.toString().includes('signin'), { timeout: 15000 });

        // Navigate to ChatViewer
        await page.goto('/en/chat-viewer');
        await page.waitForSelector('#chatIdInput');

        // Enter chatId and fetch logs
        await page.click('#chatIdInput');
        await page.type('#chatIdInput', TEST_CHAT_ID, { delay: 100 });
        await page.click('#refresh-logs-button');
        await page.waitForTimeout(1000);

        // Filter by info level
        console.log('Filtering by info level...');
        await page.selectOption('#logLevelFilter', 'info');
        await page.waitForTimeout(500);

        // After filter, only info logs should be visible
        const visibleRows = page.locator('table.display tbody tr:visible');
        const rowCount = await visibleRows.count();

        // All visible rows should have 'info' level
        for (let i = 0; i < rowCount; i++) {
            const levelCell = visibleRows.nth(i).locator('td').nth(1);
            const levelText = await levelCell.textContent();
            if (levelText && levelText.trim()) {
                expect(levelText.trim()).toBe('info');
            }
        }

        console.log('Log level filtering verified');
    });

    test('should handle missing chatId gracefully', async ({ page }) => {
        // Login
        await page.goto('/en/signin');
        await page.fill('#email', TEST_USER_EMAIL);
        await page.fill('#password', TEST_USER_PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForURL(url => !url.toString().includes('signin'), { timeout: 15000 });

        // Navigate to ChatViewer
        await page.goto('/en/chat-viewer');
        await page.waitForSelector('#chatIdInput');

        // Don't enter any chatId, just verify "No logs available" shows
        await page.click('#chatIdInput');
        await page.type('#chatIdInput', 'non-existent-chat-id-12345', { delay: 100 });
        await page.click('#refresh-logs-button');
        await page.waitForTimeout(2000);

        // Should show "No logs available" or empty state
        const noLogsMessage = await page.locator('text=No logs available').count();
        expect(noLogsMessage).toBeGreaterThan(0);
        console.log('Empty state verified for non-existent chat');
    });
});
