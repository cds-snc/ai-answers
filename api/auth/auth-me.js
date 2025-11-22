import { getUserFromCookie } from '../../middleware/auth.js';

const meHandler = async (req, res) => {
    try {
        const user = await getUserFromCookie(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        return res.status(200).json({
            success: true,
            user: {
                userId: user.userId,
                email: user.email,
                role: user.role,
                active: true
            }
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
