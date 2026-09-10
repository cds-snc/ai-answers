import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import { requireObjectIdString } from '../util/db-query.js';
import { authMiddleware, withProtection } from '../../middleware/auth.js';
import { normalizeInstitution, normalizeGroup } from '../util/user-profile.js';

// The signed-in user's own profile, read fresh from the database. The session
// object on req.user only carries userId/email/role (see config/passport.js),
// so institution/group - which an admin can change at any time - must come
// from here rather than from the session.
const PROFILE_FIELDS = { email: 1, role: 1, active: 1, institution: 1, group: 1, preferences: 1 };

const toProfile = (user) => ({
    email: user.email,
    role: user.role,
    active: Boolean(user.active),
    institution: user.institution || '',
    group: user.group || '',
    preferences: {
        prefilterDepartment: Boolean(user.preferences?.prefilterDepartment),
        prefilterGroup: Boolean(user.preferences?.prefilterGroup)
    }
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
            //
            // Institution/group are one-time self-picks for a partner: makes
            // the first self-assign easy (no admin has to set it up front),
            // but once set, only an admin (via user-users.js, no lock there)
            // can move the partner elsewhere - stops a partner reassigning
            // themselves out of a chat-assignment scope after the fact. Load
            // the current values first so this can compare against them;
            // admins aren't restricted, since they already have authority to
            // change this via the admin path anyway.
            const currentUser = await User.findById(userId, { role: 1, institution: 1, group: 1 }).lean();
            if (!currentUser) return res.status(404).json({ message: 'User not found' });
            const isLockedPartner = currentUser.role !== 'admin';

            const { institution, group, preferences } = req.body || {};
            const updateFields = {};
            if (institution !== undefined) {
                const value = normalizeInstitution(institution);
                if (value === null) return res.status(400).json({ message: 'Invalid institution' });
                if (isLockedPartner && currentUser.institution && value !== currentUser.institution) {
                    return res.status(403).json({ code: 'institution_locked', message: 'Ask an admin to change your institution.' });
                }
                updateFields.institution = value;
            }
            if (group !== undefined) {
                const value = normalizeGroup(group);
                if (value === null) return res.status(400).json({ message: 'Invalid group' });
                if (isLockedPartner && currentUser.group && value !== currentUser.group) {
                    return res.status(403).json({ code: 'group_locked', message: 'Ask an admin to change your group.' });
                }
                updateFields.group = value;
            }
            for (const key of ['prefilterDepartment', 'prefilterGroup']) {
                if (preferences?.[key] === undefined) continue;
                if (typeof preferences[key] !== 'boolean') {
                    return res.status(400).json({ message: `preferences.${key} must be a boolean` });
                }
                updateFields[`preferences.${key}`] = preferences[key];
            }
            // Clearing institution/group has to clear the matching
            // prefilter preference too - otherwise the checkbox stays
            // checked (stale server-side, not just a stale UI value) for a
            // filter that no longer has anything to prefilter to. Runs
            // after the loop above so it wins over a same-request
            // preferences value, keeping the invariant unconditional.
            if (updateFields.institution === '') {
                updateFields['preferences.prefilterDepartment'] = false;
            }
            if (updateFields.group === '') {
                updateFields['preferences.prefilterGroup'] = false;
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
