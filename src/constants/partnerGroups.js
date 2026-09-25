// Groups / teams a partner user can belong to within their institution.
//
// Single source of truth for the Group dropdowns (Manage user accounts page,
// Manage your account page) and the server-side validation in
// services/UserService.js. Deliberately a short curated list for now - add
// entries here as partner teams come on board. The stored value is the
// English label (the key below); keep entries stable once users are
// assigned to them. Labels are per language because the value is shown in
// the French UI too (selects, filter pill) and a French screen reader would
// otherwise read the English name with a French voice (SC 3.1.2).
// Each group belongs to one institution (abbrKey): only people in that
// institution can be in it (groupFitsInstitution).
export const PARTNER_GROUP_LABELS = {
  'Military transitions': { en: 'Military transitions', fr: 'Transitions militaires', institution: 'DND-MDN' },
  'AI Answers QA': { en: 'AI Answers QA', fr: 'AQ de Réponses IA', institution: 'CEO-BEC' },
};

// Open to every partner: anyone can assign questions to its members, not
// just their own institution/group-mates (UserService.canAssignTo). So only
// an admin can put someone in it - partners can't pick it on their account page.
export const QA_GROUP = 'AI Answers QA';

export const PARTNER_GROUPS = Object.keys(PARTNER_GROUP_LABELS);

// The groups someone in `institution` can pick.
export function groupsForInstitution(institution) {
  return PARTNER_GROUPS.filter((g) => PARTNER_GROUP_LABELS[g].institution === institution);
}

// No group always fits; otherwise the group must belong to the institution.
export function groupFitsInstitution(group, institution) {
  return !group || PARTNER_GROUP_LABELS[group]?.institution === institution;
}

// Display label for a stored group value; falls back to the value itself so
// an unknown/legacy value still renders rather than disappearing.
export function getPartnerGroupLabel(value, lang = 'en') {
  return PARTNER_GROUP_LABELS[value]?.[lang] || value || '';
}
