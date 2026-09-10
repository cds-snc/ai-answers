import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';

// Session user (userId/email/role from config/passport.js) merged with the
// profile fields an admin or the user can change after login - institution,
// group, preferences - read fresh so a change shows up on the next page load
// without re-authenticating. FilterPanel reads preferences/institution off
// the AuthContext user this returns.
const PROFILE_FIELDS = { institution: 1, group: 1, preferences: 1 };

const meHandler = async (req, res) => {
    try {
        // req.user is automatically populated by Passport if authenticated
        if (!req.isAuthenticated()) {
            return res.status(200).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        let profile = {};
        try {
            await dbConnect();
            const dbUser = await User.findById(req.user.userId, PROFILE_FIELDS).lean();
            if (dbUser) {
                profile = {
                    institution: dbUser.institution || '',
                    group: dbUser.group || '',
                    preferences: {
                        prefilterDepartment: Boolean(dbUser.preferences?.prefilterDepartment),
                        prefilterGroup: Boolean(dbUser.preferences?.prefilterGroup)
                    }
                };
            }
        } catch (profileError) {
            // Auth still succeeds without the profile extras.
            console.error('Get current user profile error:', profileError);
        }

        return res.status(200).json({
            success: true,
            user: { ...req.user, ...profile },
            sessionExpiresAt: req.session?.cookie?.expires ? req.session.cookie.expires.toISOString() : null
        });
    } catch (error) {
        console.error('Get current user error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error retrieving user information'
        });
    }
};

export default meHandler;
