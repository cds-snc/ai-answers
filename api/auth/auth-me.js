const meHandler = async (req, res) => {
    try {
        // req.user is automatically populated by Passport if authenticated
        if (!req.isAuthenticated()) {
            return res.status(200).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        return res.status(200).json({
            success: true,
            user: req.user
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
