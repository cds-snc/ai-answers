import { test, expect } from '@playwright/test';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables for DB connection
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { User } from '../../models/user.js';
import { Chat } from '../../models/chat.js';
import { Interaction } from '../../models/interaction.js';

const TEST_ADMIN_EMAIL = 'admin@example.com';
const TEST_PASSWORD = 'password123';

test.describe('Chat Dashboard E2E Testing', () => {

    test.beforeAll(async () => {
        // Ensure we have an admin user and some test data
        try {
            const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dev-database?authSource=admin&retryWrites=true&w=majority";
            console.log('Connecting to DB for setup:', MONGODB_URI);
            await mongoose.connect(MONGODB_URI);

            // 1. Setup Admin User
            let admin = await User.findOne({ email: TEST_ADMIN_EMAIL });
            if (!admin) {
                admin = new User({
                    email: TEST_ADMIN_EMAIL,
                    password: TEST_PASSWORD,
                    role: 'admin'
                });
            } else {
                admin.role = 'admin';
                admin.password = TEST_PASSWORD;
            }
            // Ensure 2FA is disabled for consistent testing
            admin.twoFASecret = undefined;
            admin.twoFACode = undefined;
            admin.twoFAExpires = undefined;
            await admin.save();
            console.log('Admin user ready.');

            // 2. Setup Test Chat Data
            const chatCount = await Chat.countDocuments();
            if (chatCount === 0) {
                console.log('Seeding test chat data...');
                const interactionId = 'e2e-test-interaction-123';
                const chatId = 'e2e-test-chat-123';

                const interaction = new Interaction({
                    interactionId: interactionId,
                    question: 'How do I test the dashboard?',
                    answer: 'By running this E2E test.',
                    timestamp: new Date()
                });
                await interaction.save();

                const chat = new Chat({
                    chatId: chatId,
                    interactionIds: [interactionId],
                    pageLanguage: 'en',
                    createdAt: new Date()
                });
                await chat.save();
                console.log('Test chat data seeded.');
            }

            await mongoose.disconnect();
        } catch (err) {
            console.error('Test setup failed:', err);
        }
    });

    test('should login as admin and view chat dashboard with performance metrics', async ({ page }) => {
        console.log('Starting Chat Dashboard E2E test...');

        // 1. Navigate directly to login page
        await page.goto('http://localhost:3001/en/signin');
        console.log('Navigated to login page');

        // Wait for email input to be visible
        await page.waitForSelector('input[name="email"]', { timeout: 10000 });
        console.log('Login form loaded');

        await page.fill('input[name="email"]', TEST_ADMIN_EMAIL);
        await page.fill('input[name="password"]', TEST_PASSWORD);
        await page.click('button[type="submit"]');
        console.log('Submitted login form');

        // 2. Wait for redirect and navigate to Chat Dashboard
        await page.waitForTimeout(2000); // Give time for login to complete

        console.log('Navigating to Chat Dashboard...');
        await page.goto('http://localhost:3001/en/admin/chat-dashboard');

        // Wait for the table to be visible
        await page.waitForSelector('table#chat-dashboard-table', { timeout: 15000 });
        console.log('Dashboard loaded.');

        // 3. Verify No Error on First Load (Empty LocalStorage)
        // Simulate empty local storage by reloading with it cleared
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        console.log('Page reloaded with empty localStorage.');

        // Wait for table to initialize
        await page.waitForSelector('table#chat-dashboard-table', { timeout: 15000 });

        // Check for error messages
        const errorAlert = page.locator('.error[role="alert"]');
        if (await errorAlert.isVisible()) {
            const errorText = await errorAlert.innerText();
            console.error('Found error on dashboard:', errorText);
            throw new Error(`Dashboard showed error on first load: ${errorText}`);
        }

        // 4. Verify Performance Metrics are Visible
        const loadTimeContainer = page.locator('div[style*="text-align: right"]');
        await expect(loadTimeContainer).toBeVisible({ timeout: 15000 });

        const containerText = await loadTimeContainer.innerText();
        console.log('UI Performance Display:', containerText);

        // Verify the container shows some timing information (contains a number with 's' for seconds)
        expect(containerText).toMatch(/\d+\.\d+s/);

        // 5. Change date range to last 2 months to see more data
        console.log('Setting date range to last 2 months...');

        const dateRangeInput = page.locator('input[name="daterange"]');
        if (await dateRangeInput.isVisible()) {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 2);

            const formatDate = (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            const rangeText = `${formatDate(startDate)} - ${formatDate(endDate)}`;

            console.log('Setting date range to:', rangeText);
            await dateRangeInput.click();
            await page.waitForTimeout(500);

            const drpApply = page.locator('.applyBtn, button:has-text("Apply"):visible');
            if (await drpApply.first().isVisible().catch(() => false)) {
                await drpApply.first().click();
                await page.waitForTimeout(500);
            }
        }

        // 6. Click Apply Filters button
        console.log('Clicking Apply Filters...');
        const applyButton = page.locator('button:has-text("Apply")').first();

        const responsePromise = page.waitForResponse(response =>
            response.url().includes('/api/chat/chat-dashboard') && response.status() === 200,
            { timeout: 30000 }
        );

        await applyButton.click();

        const response = await responsePromise;
        const responseData = await response.json();

        console.log('API Response received. Records:', responseData.recordsTotal);

        expect(responseData).toHaveProperty('_performance');
        console.log('API Performance from response:', responseData._performance);

        // Log table row count
        await page.waitForTimeout(1000);
        const rowCount = await page.locator('table#chat-dashboard-table tbody tr').count();
        console.log('Rows in table after filter:', rowCount);

        console.log('Chat Dashboard E2E test completed successfully!');
    });
});
