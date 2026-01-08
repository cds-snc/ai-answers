import { User } from '../../models/user.js';
import dbConnect from './db-connect.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import speakeasy from 'speakeasy';

async function userSecretsHandler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        await dbConnect();

        // Find users missing either twoFASecret or resetPasswordSecret
        const usersToUpdate = await User.find({
            $or: [
                { twoFASecret: { $exists: false } },
                { twoFASecret: null },
                { twoFASecret: '' },
                { resetPasswordSecret: { $exists: false } },
                { resetPasswordSecret: null },
                { resetPasswordSecret: '' }
            ]
        });

        let updatedCount = 0;
        const details = [];

        for (const user of usersToUpdate) {
            let changed = false;
            if (!user.twoFASecret) {
                user.twoFASecret = speakeasy.generateSecret({ length: 20 }).base32;
                changed = true;
            }
            if (!user.resetPasswordSecret) {
                user.resetPasswordSecret = speakeasy.generateSecret({ length: 20 }).base32;
                changed = true;
            }

            if (changed) {
                await user.save();
                updatedCount++;
                details.push(user.email);
            }
        }

        return res.status(200).json({
            success: true,
            message: `Updated secrets for ${updatedCount} users`,
            updatedCount,
            details
        });

    } catch (error) {
        console.error('User secrets backfill error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to backfill user secrets',
            error: error.message
        });
    }
}

export default function handler(req, res) {
    return withProtection(userSecretsHandler, authMiddleware, adminMiddleware)(req, res);
}
