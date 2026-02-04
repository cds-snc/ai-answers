import { test, expect } from '@playwright/test';
import mongoose from 'mongoose';
import { User } from '../../models/user.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars to get MONGO_URI if set
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-answers';
const TEST_USER_EMAIL = 'e2e-test-user@example.com';
const TEST_USER_PASSWORD = 'password123';

test.describe('Authenticated AI Answers Testing', () => {

    test.beforeAll(async () => {
        // Connect to the database
        console.log('Connecting to DB at:', MONGODB_URI);
        await mongoose.connect(MONGODB_URI);

        // Ensure test user exists
        let user = await User.findOne({ email: TEST_USER_EMAIL });
        if (!user) {
            console.log('Creating test user...');
            user = new User({
                email: TEST_USER_EMAIL,
                password: TEST_USER_PASSWORD,
                role: 'partner',
                active: true
            });
            await user.save();
            console.log('Test user created.');
        } else {
            // Ensure connection matches what we expect (in case of manual changes)
            user.password = TEST_USER_PASSWORD; // Will be hashed by pre-save hook
            user.role = 'partner';
            user.active = true;
            await user.save();
            console.log('Test user updated/verified.');
        }
    });

    test.afterAll(async () => {
        await mongoose.disconnect();
    });

    test('should login and perform chat', async ({ page }) => {
        // Handle console logs
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

        // 1. Login
        console.log('Navigating to login page...');
        await page.goto('http://localhost:3001/en/signin');

        console.log('Filling credentials...');
        await page.fill('#email', TEST_USER_EMAIL);
        await page.fill('#password', TEST_USER_PASSWORD);

        console.log('Clicking login...');
        await page.click('button[type="submit"]');

        // Wait for navigation explicitly or check for error
        try {
            // Wait for either the URL to change to something other than signin
            // OR an error message to appear. 
            // Note: page.url() is immediate, so we wait for event or predicate.
            await Promise.race([
                page.waitForURL(url => !url.toString().includes('signin'), { timeout: 15000 }),
                page.waitForSelector('.error-message', { timeout: 15000 }), // class depends on LoginPage styles
                page.waitForSelector('[class*="error"]', { timeout: 15000 })
            ]);
        } catch (e) {
            console.log('Timeout waiting for login result. Checking page state...', e.message);
        }

        const url = page.url();
        console.log('Current URL after login attempt:', url);

        if (url.includes('signin')) {
            const errorMsg = await page.locator('[class*="error"]').textContent().catch(() => 'No error message found');
            console.log('Login failed. Error on page:', errorMsg);
            throw new Error(`Login failed. Remained on signin page. Error: ${errorMsg}`);
        }

        console.log('Login successful, redirected to:', url);

        // Wait for page to fully load
        await page.waitForTimeout(5000);
        console.log('Page loaded, waiting 5 seconds for full initialization');

        // 2. Perform Chat Interaction

        // Wait for the textarea
        console.log('Waiting for textarea...');
        await page.waitForSelector('textarea#message', { timeout: 30000 });

        const textarea = page.locator('textarea#message');
        console.log('Typing in the question...');
        await textarea.focus();
        await page.keyboard.type('What is SCIS? (Authenticated Test)');

        // Ensure the value is correctly set before proceeding
        await expect(textarea).toHaveValue('What is SCIS? (Authenticated Test)');
        console.log('Question field verified');

        // Wait a moment for React state to update
        await page.waitForTimeout(500);
        // Click send
        console.log('Clicking send...');
        const sendButton = page.locator('.btn-primary-send');

        await sendButton.click();

        // Wait for response to appear
        console.log('Waiting for response...');
        // Wait for message count to increase
        await page.waitForResponse(response =>
            response.url().includes('/api/chat/chat-message') && response.status() === 200
            , { timeout: 40000 }).catch(() => console.log('Timed out waiting for chat-message response'));

        // Verify we have messages
        const messageCount = await page.locator('.message').count();
        console.log('Message count:', messageCount);
        expect(messageCount).toBeGreaterThan(0);

        console.log('Chat verified with message count:', messageCount);
    });
});
