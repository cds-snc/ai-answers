import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';
import UserService from '../../services/UserService.js';

// The picker list for chat-assign-interaction.js: who the signed-in user is
// allowed to assign a question to. Rule and `reason` live in
// UserService.listAssignable.
async function userAssignableHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  try {
    return res.status(200).json(await UserService.listAssignable(req.user));
  } catch (error) {
    console.error('Error retrieving assignable users:', error);
    return res.status(500).json({ message: 'Failed to retrieve assignable users' });
  }
}

export default function handler(req, res) {
  return withProtection(userAssignableHandler, authMiddleware, partnerOrAdminMiddleware)(req, res);
}
