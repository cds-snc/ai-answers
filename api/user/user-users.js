import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function usersHandler(req, res) {
    switch (req.method) {
        case 'GET':
            try {
                await dbConnect();
                const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });
                res.status(200).json(users);
            } catch (error) {
                console.error('Error retrieving users:', error);
                res.status(500).json({ message: 'Failed to retrieve users', error: error.message });
            }
            break;

        case 'PATCH':
            try {
                const { userId, active, role } = req.body;
                if (!userId) {
                    return res.status(400).json({ message: 'User ID is required' });
                }
                const updateFields = {};
                if (typeof active === 'boolean') updateFields.active = active;
                if (role) updateFields.role = role;
                if (Object.keys(updateFields).length === 0) {
                    return res.status(400).json({ message: 'No valid fields to update' });
                }
                await dbConnect();
                const user = await User.findByIdAndUpdate(
                    userId,
                    updateFields,
                    { new: true, select: '-password' }
                );

                if (!user) {
                    return res.status(404).json({ message: 'User not found' });
                }

                res.status(200).json(user);
            } catch (error) {
                console.error('Error updating user:', error);
                res.status(500).json({ message: 'Failed to update user', error: error.message });
            }
            break;

        case 'DELETE':
            try {
                const { userId } = req.body;
                if (!userId) {
                    return res.status(400).json({ message: 'User ID is required' });
                }
                await dbConnect();
                const user = await User.findByIdAndDelete(userId);
                if (!user) {
                    return res.status(404).json({ message: 'User not found' });
                }
                res.status(200).json({ message: 'User deleted' });
            } catch (error) {
                console.error('Error deleting user:', error);
                res.status(500).json({ message: 'Failed to delete user', error: error.message });
            }
            break;

        default:
            res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
            res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}

// Apply protection to all routes since this is an admin-only endpoint
export default function handler(req, res) {
    return withProtection(usersHandler, authMiddleware, adminMiddleware)(req, res);
}
