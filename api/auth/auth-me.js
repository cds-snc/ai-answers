import UserService from '../../services/UserService.js';

// Session user (userId/email/role from config/passport.js) merged with the
// profile fields an admin or the user can change after login - institution,
// group, preferences - read fresh so a change shows up on the next page load
// without re-authenticating. FilterPanel reads preferences/institution off
// the AuthContext user this returns.
//
// This is a DB read on every call, including AuthContext.js's window-focus/
// visibilitychange revalidation - a deliberate freshness-over-cost tradeoff
// (self-service institution/group edits need to show up without a re-login),
// not an oversight.
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
            profile = await UserService.getMembershipProfile(req.user.userId);
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
