import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import UserService from '../../services/UserService.js';

async function usersHandler(req, res) {
    switch (req.method) {
        case 'GET':
            try {
                res.status(200).json(await UserService.listUsers());
            } catch (error) {
                console.error('Error retrieving users:', error);
                res.status(500).json({ message: 'Failed to retrieve users', error: error.message });
            }
            break;

        case 'PATCH':
            try {
                const { userId, ...fields } = req.body;
                if (!userId || typeof userId !== 'string') {
                    return res.status(400).json({ message: 'Valid user ID (string) is required' });
                }
                res.status(200).json(await UserService.adminUpdateUser(userId, fields));
            } catch (error) {
                if (error.status) return res.status(error.status).json({ message: error.message });
                console.error('Error updating user:', error);
                res.status(500).json({ message: 'Failed to update user', error: error.message });
            }
            break;

        case 'DELETE':
            try {
                const { userId } = req.query;
                if (!userId || typeof userId !== 'string') {
                    return res.status(400).json({ message: 'Valid user ID (string) is required' });
                }
                await UserService.deleteUser(userId);
                res.status(200).json({ message: 'User deleted' });
            } catch (error) {
                if (error.status) return res.status(error.status).json({ message: error.message });
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
