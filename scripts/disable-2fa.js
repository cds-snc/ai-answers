import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { User } from '../models/user.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-answers';

async function disable2FA() {
    try {
        console.log('Connecting to DB to disable 2FA...');
        await mongoose.connect(MONGODB_URI);

        // In this app, 2FA is "enabled" if twoFASecret is set.
        // We can just clear it for all users to disable 2FA for testing.
        const result = await User.updateMany({}, {
            $set: {
                twoFASecret: null,
                twoFACode: null,
                twoFAExpires: null
            }
        });

        console.log(`Successfully disabled 2FA for ${result.modifiedCount} users.`);
    } catch (error) {
        console.error('Error disabling 2FA:', error);
    } finally {
        await mongoose.disconnect();
    }
}

disable2FA();
