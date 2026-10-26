/**
 * Account preferences (Manage your account page) that seed a dashboard's
 * FilterPanel. Both read the AuthContext user shape returned by
 * api/auth/auth-me.js and return '' when the preference is off or the
 * underlying field isn't set.
 */

/**
 * The Partner institution (department) a dashboard should open with:
 * the user's own institution when "Filter dashboards to my institution" is
 * on. Institutions and the department filter share the same abbrKeys
 * (src/constants/partnerDepartments.js), which is what makes this a direct
 * mapping.
 */
export function getPreferredDepartment(user) {
  if (!user?.preferences?.prefilterDepartment) return '';
  return typeof user.institution === 'string' ? user.institution : '';
}

/**
 * The group a dashboard should scope to: the user's own group when "Filter
 * dashboards to my group" is on. Sent as the `group` query param and resolved
 * server-side by api/util/reviewer-filter.js (chats created or evaluated by
 * the group's members).
 */
export function getPreferredGroup(user) {
  if (!user?.preferences?.prefilterGroup) return '';
  return typeof user.group === 'string' ? user.group : '';
}
