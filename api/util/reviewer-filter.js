/**
 * The chat-assignment membership rule, shared by chat-assign-interaction.js's assign and
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
