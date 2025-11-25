import jwt from 'jsonwebtoken';
import { User } from '../../models/user.js';
import dbConnect from '../db/db-connect.js';
import { generateToken } from '../../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET_KEY;

const refreshHandler = async (req, res) => {
    try {
        const refreshToken = req.cookies?.refresh_token;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'No refresh token provided'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, JWT_SECRET);

        // Ensure it's actually a refresh token
        if (decoded.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token type'
            });
        }

        await dbConnect();
        const user = await User.findById(decoded.userId);

        if (!user || !user.active) {
            return res.status(401).json({
                success: false,
                message: 'User not found or inactive'
            });
        }

        // Generate new access token
        const newAccessToken = generateToken(user);

        // Set new access token in cookie
        // Use secure cookies for any non-development environment (staging, production)
        const isSecure = process.env.NODE_ENV !== 'development';
        res.cookie('access_token', newAccessToken, {
            httpOnly: true,
            secure: isSecure,
            sameSite: isSecure ? 'strict' : 'lax',
            maxAge: 15 * 60 * 1000 // 15 minutes
        });

        return res.status(200).json({
            success: true,
            message: 'Token refreshed successfully'
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired refresh token'
        });
    }
};

export default refreshHandler;
