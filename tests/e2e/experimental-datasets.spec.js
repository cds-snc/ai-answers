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

test.describe('Experimental Datasets Upload Error', () => {

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

    test.afterAll(async () => {
        if (TEST_ENV === 'dev' && mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    });

    test('should display validation details when uploading an invalid dataset', async ({ page }) => {
        // 1. Login as Admin
        await page.goto('/en/signin');
        await page.fill('#email', TEST_ADMIN_EMAIL);
        await page.fill('#password', TEST_ADMIN_PASSWORD);
        await page.click('button[type="submit"]');

        // Wait for redirection
        await page.waitForURL(url => !url.toString().includes('signin'), { timeout: 15000 });

        // 2. Navigate to Experimental Datasets
        await page.goto('/en/experimental/datasets');
        await page.waitForLoadState('networkidle');

        // 3. Fill out the upload form
        await page.fill('#ds-name', 'Invalid Upload Test');

        // Select 'qa-pair' which expects both "question" and "answer" columns
        await page.selectOption('#ds-type', 'qa-pair');

        // 4. Create an invalid CSV in memory and attach it
        // This CSV is missing the "answer" column expected by 'qa-pair'
        const invalidCsvContent = 'question\n"What is the capital of France?"\n';

        await page.setInputFiles('input[type="file"]', {
            name: 'invalid_data.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(invalidCsvContent)
        });

        // 5. Submit the upload
        const uploadBtn = page.getByRole('button', { name: /Upload Dataset/i });

        const uploadPromise = page.waitForResponse(response =>
            response.url().includes('/api/experimental/experimental-dataset-upload'),
            { timeout: 10000 }
        );

        await uploadBtn.click();

        const uploadResponse = await uploadPromise;
        expect(uploadResponse.status()).toBe(400);

        // 6. Assert the error message and the detailed list are displayed
        // We expect the main error text and the specific missing column detail
        const errorAlert = page.locator('.bg-danger-light');
        await expect(errorAlert).toBeVisible();

        const mainErrorText = await errorAlert.locator('gcds-text').textContent();
        expect(mainErrorText).toContain('Dataset validation failed');

        const detailList = errorAlert.locator('ul');
        await expect(detailList).toBeVisible();
        await expect(detailList.locator('li')).toHaveText('Missing required column: "answer"');
    });

});
