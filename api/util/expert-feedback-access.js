import { User } from '../../models/user.js';
import { isAutoEvalFeedback } from '../../services/EmbeddingMetadataService.js';
import { QA_GROUP } from '../../src/constants/partnerGroups.js';

// Who may edit an expert evaluation: its author, or an admin in the AI Answers
// QA group. The single source of this rule - feedback-get-expert sends the
// result to the screen as `canEdit`, feedback-update-expert enforces it.
//
// Reads the user from the database. The session has no group and only the role
// and email from login, and a change to any of them must apply straight away.
export async function canEditExpertFeedback(user, expertFeedback) {
  if (!user?.userId || !expertFeedback) return false;
  // Auto-evals are never edited - see AGENTS.md "Never let AI evaluations
  // feed answer generation".
  if (isAutoEvalFeedback(expertFeedback)) return false;
  const stored = await User.findById(user.userId, { role: 1, group: 1, email: 1 }).lean();
  if (!stored) return false;
  if (stored.role === 'admin' && stored.group === QA_GROUP) return true;
  const author = String(expertFeedback.expertEmail || '').trim().toLowerCase();
  return author !== '' && author === String(stored.email || '').trim().toLowerCase();
}
