// Groups / teams a partner user can belong to within their institution.
//
// Single source of truth for the Group dropdowns (Manage user accounts page,
// Manage your account page) and the server-side validation in
// api/util/user-profile.js. Deliberately a short curated list for now - add
// entries here as partner teams come on board. The stored value is the
// English label (the key below); keep entries stable once users are
// assigned to them. Labels are per language because the value is shown in
// the French UI too (selects, filter pill) and a French screen reader would
// otherwise read the English name with a French voice (SC 3.1.2).
export const PARTNER_GROUP_LABELS = {
  'Military transitions': { en: 'Military transitions', fr: 'Transitions militaires' },
};

export const PARTNER_GROUPS = Object.keys(PARTNER_GROUP_LABELS);

// Display label for a stored group value; falls back to the value itself so
// an unknown/legacy value still renders rather than disappearing.
export function getPartnerGroupLabel(value, lang = 'en') {
  return PARTNER_GROUP_LABELS[value]?.[lang] || value || '';
}
