import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import { requireObjectIdString } from '../util/db-query.js';
import { authMiddleware, withProtection } from '../../middleware/auth.js';
import { normalizeInstitution, normalizeGroup } from '../util/user-profile.js';

// The signed-in user's own profile, read fresh from the database. The session
// object on req.user only carries userId/email/role (see config/passport.js),
// so institution/group - which an admin can change at any time - must come
// from here rather than from the session.
const PROFILE_FIELDS = { email: 1, role: 1, active: 1, institution: 1, group: 1, preferences: 1, createdAt: 1 };

const toProfile = (user) => ({
    email: user.email,
    role: user.role,
    active: Boolean(user.active),
    institution: user.institution || '',
    group: user.group || '',
    preferences: {
        prefilterDepartment: Boolean(user.preferences?.prefilterDepartment),
        prefilterGroup: Boolean(user.preferences?.prefilterGroup)
    },
    createdAt: user.createdAt
});

async function meHandler(req, res) {
    try {
        await dbConnect();
        const userId = requireObjectIdString(req.user?.userId, 'user ID');

        if (req.method === 'GET') {
            const user = await User.findById(userId, PROFILE_FIELDS).lean();
            if (!user) return res.status(404).json({ message: 'User not found' });
            return res.status(200).json(toProfile(user));
        }

        if (req.method === 'PATCH') {
            // Self-service: institution, group and preferences. Role/active
            // stay admin-only via user-users.js. Same validators as the admin
            // path so both write the same values.
            const { institution, group, preferences } = req.body || {};
            const updateFields = {};
            if (institution !== undefined) {
                const value = normalizeInstitution(institution);
                if (value === null) return res.status(400).json({ message: 'Invalid institution' });
                updateFields.institution = value;
            }
            if (group !== undefined) {
                const value = normalizeGroup(group);
                if (value === null) return res.status(400).json({ message: 'Invalid group' });
                updateFields.group = value;
            }
            for (const key of ['prefilterDepartment', 'prefilterGroup']) {
                if (preferences?.[key] === undefined) continue;
                if (typeof preferences[key] !== 'boolean') {
                    return res.status(400).json({ message: `preferences.${key} must be a boolean` });
                }
                updateFields[`preferences.${key}`] = preferences[key];
            }
            if (Object.keys(updateFields).length === 0) {
                return res.status(400).json({ message: 'No valid fields to update' });
            }
            const user = await User.findByIdAndUpdate(
                userId,
                updateFields,
                { new: true, select: Object.keys(PROFILE_FIELDS).join(' ') }
            ).lean();
            if (!user) return res.status(404).json({ message: 'User not found' });
            return res.status(200).json(toProfile(user));
        }

        res.setHeader('Allow', ['GET', 'PATCH']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    } catch (error) {
        console.error('Error handling current user profile:', error);
        res.status(500).json({ message: 'Failed to handle profile request' });
    }
}

export default function handler(req, res) {
    return withProtection(meHandler, authMiddleware)(req, res);
}
