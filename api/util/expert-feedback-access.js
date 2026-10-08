import { isAutoEvalFeedback } from '../../services/EmbeddingMetadataService.js';

// Who may edit an expert evaluation: admins any, partners only their own.
// The single source of this rule - feedback-get-expert sends the result to
// the screen as `canEdit`, feedback-update-expert enforces it.
//
// TODO: let partners edit evaluations from their own group, not just their
// own. An evaluation belongs to the group it was written for (that group
// evaluates this type of work), so stamp the author's group on ExpertFeedback
// at save time rather than looking up the author's current group by email.
// The group is added alongside expertEmail, never in place of it - we still
// need to know which person in the group wrote it.
// Older evaluations have no group, so they stay author/admin-only.
export function canEditExpertFeedback(user, expertFeedback) {
  if (!user || !expertFeedback) return false;
  // Auto-evals are never edited - see AGENTS.md "Never let AI evaluations
  // feed answer generation".
  if (isAutoEvalFeedback(expertFeedback)) return false;
  if (user.role === 'admin') return true;
  const author = String(expertFeedback.expertEmail || '').trim().toLowerCase();
  const editor = String(user.email || '').trim().toLowerCase();
  return user.role === 'partner' && author !== '' && author === editor;
}
