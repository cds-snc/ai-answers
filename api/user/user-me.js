import { requireObjectIdString } from '../util/db-query.js';
import { authMiddleware, withProtection } from '../../middleware/auth.js';
import UserService from '../../services/UserService.js';

// The signed-in user's own profile, read fresh from the database. The session
// object on req.user only carries userId/email/role (see config/passport.js),
// so institution/group - which an admin can change at any time - must come
// from here rather than from the session. Rules live in UserService.
async function meHandler(req, res) {
    try {
        const userId = requireObjectIdString(req.user?.userId, 'user ID');

        if (req.method === 'GET') {
            return res.status(200).json(await UserService.getProfile(userId));
        }

        if (req.method === 'PATCH') {
            return res.status(200).json(await UserService.updateOwnProfile(userId, req.body || {}));
        }

        res.setHeader('Allow', ['GET', 'PATCH']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ ...(error.code ? { code: error.code } : {}), message: error.message });
        }
        console.error('Error handling current user profile:', error);
        res.status(500).json({ message: 'Failed to handle profile request' });
    }
}

export default function handler(req, res) {
    return withProtection(meHandler, authMiddleware)(req, res);
}
