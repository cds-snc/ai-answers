import { User } from '../../models/user.js';
import { isAutoEvalFeedback } from '../../services/EmbeddingMetadataService.js';
import { QA_GROUP } from '../../src/constants/partnerGroups.js';

// Who may edit or delete an expert evaluation. The single source of these
// rules - feedback-get-expert sends the results to the screen as `canEdit`
// (Edit button) and `canDelete` (Delete button); feedback-update-expert and
// feedback-delete-expert enforce them. The delete rule also limits deleting a
// whole chat (chat-delete.js).
//
// Edit: its author, or an admin in the AI Answers QA group.
// Delete: its author, or any admin. To be reviewed.
//
// TODO: discuss group-level permissions: members of a group editing and
// deleting each other's evaluations, or a group admin who can edit and delete
// any in their group.
//
// Reads the user from the database because req.user has no group, so a group
// change applies straight away. Role and email come back in the same read.
async function hasAccess(user, expertFeedback, isAllowedAdmin) {
  if (!user?.userId || !expertFeedback) return false;
  // Auto-evals are never edited - see AGENTS.md "Never let AI evaluations
  // feed answer generation".
  if (isAutoEvalFeedback(expertFeedback)) return false;
  const stored = await User.findById(user.userId, { role: 1, group: 1, email: 1 }).lean();
  if (!stored) return false;
  if (stored.role === 'admin' && isAllowedAdmin(stored)) return true;
  const author = String(expertFeedback.expertEmail || '').trim().toLowerCase();
  return author !== '' && author === String(stored.email || '').trim().toLowerCase();
}

export function canEditExpertFeedback(user, expertFeedback) {
  return hasAccess(user, expertFeedback, (admin) => admin.group === QA_GROUP);
}

export function canDeleteExpertFeedback(user, expertFeedback) {
  return hasAccess(user, expertFeedback, () => true);
}
