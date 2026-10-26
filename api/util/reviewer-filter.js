import { User } from '../../models/user.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { escapeRegex, normalizeLiteralString } from './db-query.js';
import { normalizeGroup, normalizeInstitution } from '../../services/UserService.js';

// Partial email search: the shared default pattern has no @ or +.
const EMAIL_SEARCH_PATTERN = /^[-A-Za-z0-9._@+]+$/;

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
  // Institution and group are checked against their curated lists (same
  // validators the profile routes use); an unknown value matches nothing
  // rather than silently dropping the filter.
  // A repeated query param (?group=A&group=B) arrives as an array; treat it
  // like an unknown value, not like "not set".
  const nobody = { userIds: [], feedbackIds: [] };
  const isBad = (v) => v !== undefined && v !== null && typeof v !== 'string';
  if (isBad(institution) || isBad(group) || isBad(reviewerEmail)) return nobody;
  const institutionRaw = institution ? institution.trim() : '';
  const institutionValue = institutionRaw ? normalizeInstitution(institutionRaw) : '';
  if (institutionValue === null) return nobody;
  const groupRaw = group ? group.trim() : '';
  const groupValue = groupRaw ? normalizeGroup(groupRaw) : '';
  if (groupValue === null) return nobody;
  // Length-capped by the shared default; an overlong value matches nothing.
  const emailValue = reviewerEmail ? normalizeLiteralString(reviewerEmail, { pattern: EMAIL_SEARCH_PATTERN }) : '';
  if (emailValue === null) return nobody;
  if (!institutionValue && !groupValue && !emailValue) return null;

  const emailRegex = emailValue ? { $regex: escapeRegex(emailValue), $options: 'i' } : null;

  // institution and group are ANDed here (both keys on one query object):
  // both narrow, so passing both matches only people who have that
  // institution AND that group. No caller passes both today; the test
  // pins it so a future caller doesn't inherit it by accident. Changing it
  // to OR is a deliberate decision, not a refactor.
  const userQuery = {};
  if (institutionValue) userQuery.institution = institutionValue;
  if (groupValue) userQuery.group = groupValue;
  if (emailRegex) userQuery.email = emailRegex;
  const users = await User.find(userQuery, { _id: 1, email: 1 }).lean();
  const userIds = users.map(u => u._id);

  // With an institution/group set, reviewers are exactly its members. With
  // only an email, match evaluations directly so reviewers whose account has
  // since been deleted still show up.
  //
  // TODO(perf, decide): feedbackIds is unbounded - every evaluation the
  // matched reviewers ever wrote, shipped inside the aggregate twice (raw ref
  // and looked-up doc branches). ~30 bytes per id, so 10k evaluations is
  // ~600 KB per request. Alternative: every consumer already looks up the
  // expert evaluation record (ExpertFeedback, which carries expertEmail) for
  // its own columns, so it could match "expertEmail in these" right there
  // with no id list at all - but that changes all five consumers' match
  // shape. Decide which way before the group filter has real volume behind it.
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
