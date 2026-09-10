import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { User } from '../../models/user.js';
import { requireString, requireObjectIdString } from '../util/db-query.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';
import { ASSIGN_NOTE_MAX_LENGTH } from '../../src/constants/chatAssign.js';
import { sharesMembership } from '../util/reviewer-filter.js';

// Assigns a chat to one partner/admin user for review (issue #1656). Single
// assignee at a time - an already-assigned chat is rejected (409), not
// silently overwritten; DELETE clears the assignment (the "×" pill on
// ChatDashboardPage.js's assign column).
//
// Who can be assigned is deliberately narrow for v1, since a partner has no
// visibility into the full account directory (that stays admin-only, via
// user-users.js): a partner can assign to anyone sharing their own
// institution or group (same membership rule as resolveReviewerMatch), or to
// themselves regardless. There's no "group lead" role yet restricting this
// further within a group - every member of a group/institution can assign to
// every other member. An admin can assign to anyone. Enforced here, not just
// hidden in the UI - see api/user/user-assignable.js for the matching picker
// list a partner actually gets to see.
async function chatAssignHandler(req, res) {
  if (req.method === 'DELETE') {
    return unassignHandler(req, res);
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  try {
    await dbConnect();
    let { chatId, assignedTo, notes } = req.body || {};
    if (!chatId) {
      return res.status(400).json({ message: 'chatId is required' });
    }
    if (!assignedTo) {
      return res.status(400).json({ message: 'assignedTo is required' });
    }
    chatId = requireString(chatId, 'chatId');
    assignedTo = requireObjectIdString(assignedTo, 'assignedTo');
    if (notes !== undefined && typeof notes !== 'string') {
      return res.status(400).json({ message: 'notes must be a string' });
    }
    if (typeof notes === 'string' && notes.trim().length > ASSIGN_NOTE_MAX_LENGTH) {
      return res.status(400).json({ code: 'note_too_long', message: `notes must be ${ASSIGN_NOTE_MAX_LENGTH} characters or fewer` });
    }

    const assignee = await User.findById(assignedTo, { email: 1, role: 1, active: 1, institution: 1, group: 1 }).lean();
    if (!assignee || !assignee.active || !['partner', 'admin'].includes(assignee.role)) {
      return res.status(400).json({ message: 'Invalid assignee' });
    }

    if (req.user.role !== 'admin' && assignedTo !== req.user.userId) {
      const requester = await User.findById(req.user.userId, { institution: 1, group: 1 }).lean();
      if (!sharesMembership(requester, assignee)) {
        return res.status(403).json({ message: 'Partners can only assign chats to themselves or to someone in their own institution/group' });
      }
    }

    // assignedTo: null in the filter makes this an atomic check-and-set -
    // two concurrent assigns on the same unassigned chat can't both "win".
    const chat = await Chat.findOneAndUpdate(
      { chatId, assignedTo: null },
      {
        assignedTo,
        assignedBy: req.user.userId,
        assignedOn: new Date(),
        assignedNotes: (notes || '').trim(),
      },
      { new: true, select: 'chatId assignedTo assignedBy assignedOn assignedNotes' }
    ).lean();

    if (!chat) {
      const existing = await Chat.findOne({ chatId }, { _id: 1 }).lean();
      if (!existing) {
        return res.status(404).json({ message: 'Chat not found' });
      }
      return res.status(409).json({ code: 'already_assigned', message: 'This chat is already assigned.' });
    }

    return res.status(200).json({
      chatId: chat.chatId,
      assignedTo: chat.assignedTo.toString(),
      assignedToEmail: assignee.email,
      assignedBy: chat.assignedBy.toString(),
      assignedOn: chat.assignedOn,
      assignedNotes: chat.assignedNotes,
    });
  } catch (error) {
    console.error('Error assigning chat:', error);
    return res.status(500).json({ message: 'Failed to assign chat' });
  }
}

// Same reach as assigning: the current assignee, whoever made the
// assignment, an institution/group-mate of the current assignee, or an
// admin. Unassigning an already-unassigned chat is a no-op success, not an
// error - the pill that triggers this only exists on an assigned chat, so a
// second click landing here (a slow network, a double-click) shouldn't
// surface as a failure.
async function unassignHandler(req, res) {
  try {
    await dbConnect();
    let { chatId } = req.body || {};
    if (!chatId) {
      return res.status(400).json({ message: 'chatId is required' });
    }
    chatId = requireString(chatId, 'chatId');

    const chat = await Chat.findOne({ chatId }, { assignedTo: 1, assignedBy: 1 }).lean();
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    if (!chat.assignedTo) {
      return res.status(200).json({ chatId });
    }

    if (req.user.role !== 'admin') {
      const isCurrentAssignee = String(chat.assignedTo) === req.user.userId;
      const isOriginalAssigner = chat.assignedBy && String(chat.assignedBy) === req.user.userId;
      let allowed = isCurrentAssignee || isOriginalAssigner;
      if (!allowed) {
        const [requester, assignee] = await Promise.all([
          User.findById(req.user.userId, { institution: 1, group: 1 }).lean(),
          User.findById(chat.assignedTo, { institution: 1, group: 1 }).lean(),
        ]);
        allowed = sharesMembership(requester, assignee);
      }
      if (!allowed) {
        return res.status(403).json({ message: 'Not allowed to remove this assignment' });
      }
    }

    await Chat.updateOne({ chatId }, { assignedTo: null, assignedBy: null, assignedOn: null, assignedNotes: '' });
    return res.status(200).json({ chatId });
  } catch (error) {
    console.error('Error unassigning chat:', error);
    return res.status(500).json({ message: 'Failed to unassign chat' });
  }
}

export default function handler(req, res) {
  return withProtection(chatAssignHandler, authMiddleware, partnerOrAdminMiddleware)(req, res);
}
