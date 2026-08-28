import { PARTNER_DEPARTMENTS } from '../../src/constants/partnerDepartments.js';
import { PARTNER_GROUPS } from '../../src/constants/partnerGroups.js';

/**
 * Validates a User.institution value: '' (unassigned) or one of the partner
 * department abbrKeys. Returns the normalized string, or null when invalid.
 */
export function normalizeInstitution(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return '';
  return PARTNER_DEPARTMENTS.includes(trimmed) ? trimmed : null;
}

/**
 * Validates a User.group value: '' (none) or one of the curated partner
 * groups. Returns the normalized string, or null when invalid.
 */
export function normalizeGroup(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return '';
  return PARTNER_GROUPS.includes(trimmed) ? trimmed : null;
}
