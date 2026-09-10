import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';

// The picker list for chat-assign.js: who the signed-in user is allowed to
// assign a chat to. Deliberately NOT the full account directory
// (user-users.js stays admin-only) - a partner only ever sees people who
// share their own institution or group (same membership rule as
// resolveReviewerMatch), which naturally includes themselves. An admin sees
// everyone active, same reach they already have via user-users.js.
//
// `reason: 'no_institution'` (with an empty list) is the "no list to show"
// case: a partner with neither institution nor group set yet - nothing to
// match against, not an error. The frontend uses this to explain why,
// rather than rendering a plain empty dropdown.
async function userAssignableHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  try {
    await dbConnect();

    const baseQuery = { active: true, role: { $in: ['partner', 'admin'] } };

    if (req.user.role === 'admin') {
      const users = await User.find(baseQuery, { email: 1, institution: 1, group: 1 })
        .sort({ email: 1 })
        .lean();
      return res.status(200).json({ users: users.map(toAssignee) });
    }

    const requester = await User.findById(req.user.userId, { institution: 1, group: 1 }).lean();
    const conditions = [];
    if (requester?.institution) conditions.push({ institution: requester.institution });
    if (requester?.group) conditions.push({ group: requester.group });

    if (conditions.length === 0) {
      return res.status(200).json({ users: [], reason: 'no_institution' });
    }

    const users = await User.find({ ...baseQuery, $or: conditions }, { email: 1, institution: 1, group: 1 })
      .sort({ email: 1 })
      .lean();
    return res.status(200).json({ users: users.map(toAssignee) });
  } catch (error) {
    console.error('Error retrieving assignable users:', error);
    return res.status(500).json({ message: 'Failed to retrieve assignable users' });
  }
}

const toAssignee = (user) => ({
  id: user._id.toString(),
  email: user.email,
  institution: user.institution || '',
  group: user.group || '',
});

export default function handler(req, res) {
  return withProtection(userAssignableHandler, authMiddleware, partnerOrAdminMiddleware)(req, res);
}
