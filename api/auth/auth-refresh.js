// Refresh handler is no longer needed with express-session
// Session TTL is managed by express-session automatically
// This endpoint can be removed or kept as a no-op for backward compatibility

const refreshHandler = async (req, res) => {
    try {
        // With express-session, the session is automatically refreshed on each request
        // Check if user is still logged in
        if (req.session?.user) {
            return res.status(200).json({
                success: true,
                message: 'Session is valid'
            });
        }

        return res.status(401).json({
            success: false,
            message: 'No active session'
        });
    } catch (error) {
        console.error('Refresh handler error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking session'
        });
    }
};

export default refreshHandler;
