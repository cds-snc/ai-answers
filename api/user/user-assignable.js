import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';
import { membershipConditions } from '../util/reviewer-filter.js';

// The picker list for chat-assign.js: who the signed-in user is allowed to
// assign a chat to. Deliberately NOT the full account directory
// (user-users.js stays admin-only) - a partner only ever sees people who
// share their own institution or group (same membership rule enforced in
// chat-assign.js), plus themselves - self-assign is always allowed there
// regardless of institution/group, so the picker must always include the
// requester too, not just their institution/group-mates. An admin sees
// everyone active, same reach they already have via user-users.js.
//
// `reason: 'no_institution'` is "nothing to match against yet" - a partner
// with neither institution nor group set. The list still isn't empty (it's
// always at least themselves), but the frontend uses the reason to explain
// why no one else shows up, rather than leaving that unexplained.
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
    const conditions = membershipConditions(requester);
    const noInstitutionOrGroup = conditions.length === 0;
    // Self-assign is always allowed (see chat-assign.js), so the requester
    // is always in the picker list even with no institution/group set.
    conditions.push({ _id: req.user.userId });

    const users = await User.find({ ...baseQuery, $or: conditions }, { email: 1, institution: 1, group: 1 })
      .sort({ email: 1 })
      .lean();
    return res.status(200).json({ users: users.map(toAssignee), ...(noInstitutionOrGroup ? { reason: 'no_institution' } : {}) });
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
