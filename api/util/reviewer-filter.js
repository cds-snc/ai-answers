import { User } from '../../models/user.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { escapeRegex } from './db-query.js';

/**
 * The chat-assignment membership rule, shared by chat-assign.js's assign and
 * unassign handlers and user-assignable.js's picker list: two users are
 * "membership-linked" when they share a non-empty institution or a
 * non-empty group. An unset field never counts as matching another unset
 * field - two users with no institution are not "sharing" one.
 */
export function sharesMembership(a, b) {
  const sharesInstitution = Boolean(a?.institution) && a.institution === b?.institution;
  const sharesGroup = Boolean(a?.group) && a.group === b?.group;
  return sharesInstitution || sharesGroup;
}

/**
 * Mongo $or conditions matching anyone membership-linked to `user` (see
 * sharesMembership) - the query-side version of the same rule, for
 * user-assignable.js's picker list. Empty array when `user` has neither
 * institution nor group set.
 */
export function membershipConditions(user) {
  const conditions = [];
  if (user?.institution) conditions.push({ institution: user.institution });
  if (user?.group) conditions.push({ group: user.group });
  return conditions;
}

/**
 * Resolves the dashboards' "Institution" / "Reviewer email" filters into the
 * id sets getChatFilterConditions matches on (filters.reviewerMatch).
 *
 * Done once per request, up front, because reviewer identity is stored two
 * different ways: a chat's creator is a User ref (chat.user), but an expert
 * evaluation only carries the reviewer's email as a string
 * (expertFeedback.expertEmail, written from req.user.email at save time).
 * Pre-resolving both into ids lets every dashboard pipeline match with plain
 * $in conditions instead of each adding its own users lookup.
 *
 * @param {{ institution?: string, group?: string, reviewerEmail?: string }} params
 *   institution - partner department abbrKey (exact match on User.institution)
 *   group - partner group name (exact match on User.group)
 *   reviewerEmail - partial, case-insensitive email match
 * @returns {Promise<null | { userIds: ObjectId[], feedbackIds: ObjectId[] }>}
 *   null when neither filter is set. Empty arrays mean "no one matches" -
 *   the condition builder turns that into a match-nothing clause, never
 *   into "show everything".
 */
export async function resolveReviewerMatch({ institution, group, reviewerEmail } = {}) {
  const institutionValue = typeof institution === 'string' ? institution.trim() : '';
  const groupValue = typeof group === 'string' ? group.trim() : '';
  const emailValue = typeof reviewerEmail === 'string' ? reviewerEmail.trim() : '';
  if (!institutionValue && !groupValue && !emailValue) return null;

  const emailRegex = emailValue ? { $regex: escapeRegex(emailValue), $options: 'i' } : null;

  const userQuery = {};
  if (institutionValue) userQuery.institution = institutionValue;
  if (groupValue) userQuery.group = groupValue;
  if (emailRegex) userQuery.email = emailRegex;
  const users = await User.find(userQuery, { _id: 1, email: 1 }).lean();
  const userIds = users.map(u => u._id);

  // With an institution/group set, reviewers are exactly its members. With
  // only an email, match evaluations directly so reviewers whose account has
  // since been deleted still show up.
  const membershipSet = Boolean(institutionValue || groupValue);
  const feedbackQuery = membershipSet
    ? { expertEmail: { $in: users.map(u => u.email) } }
    : { expertEmail: emailRegex };
  const feedback = userIds.length || !membershipSet
    ? await ExpertFeedback.find(feedbackQuery, { _id: 1 }).lean()
    : [];
  const feedbackIds = feedback.map(f => f._id);

  return { userIds, feedbackIds };
}
