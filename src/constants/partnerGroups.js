// Groups / teams a partner user can belong to within their institution.
//
// Single source of truth for the Group dropdowns (Manage user accounts page,
// Create account page) and the server-side validation in
// api/util/user-profile.js. Deliberately a short curated list for now - add
// entries here as partner teams come on board. The stored value is the label
// itself; keep entries stable once users are assigned to them.
export const PARTNER_GROUPS = [
  'Military transitions',
];
