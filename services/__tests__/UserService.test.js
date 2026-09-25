import { describe, it, expect } from 'vitest';
import { normalizeInstitution, normalizeGroup, sharesMembership, membershipConditions, canAssignTo } from '../UserService.js';

describe('normalizeInstitution', () => {
  it('accepts a partner abbrKey and the empty (unassigned) value', () => {
    expect(normalizeInstitution('DND-MDN')).toBe('DND-MDN');
    expect(normalizeInstitution(' IRCC ')).toBe('IRCC');
    expect(normalizeInstitution('')).toBe('');
  });
  it('rejects unknown keys and non-strings', () => {
    expect(normalizeInstitution('NOT-A-DEPT')).toBeNull();
    expect(normalizeInstitution(42)).toBeNull();
    expect(normalizeInstitution(undefined)).toBeNull();
  });
});

describe('normalizeGroup', () => {
  it('accepts a curated group and the empty (none) value', () => {
    expect(normalizeGroup(' Military transitions ')).toBe('Military transitions');
    expect(normalizeGroup('')).toBe('');
  });
  it('rejects unknown groups and non-strings', () => {
    expect(normalizeGroup('Passports')).toBeNull();
    expect(normalizeGroup(null)).toBeNull();
  });
});

describe('sharesMembership / membershipConditions', () => {
  it('links users on a shared non-empty institution or group only', () => {
    expect(sharesMembership({ institution: 'IRCC' }, { institution: 'IRCC' })).toBe(true);
    expect(sharesMembership({ group: 'Military transitions' }, { group: 'Military transitions' })).toBe(true);
    expect(sharesMembership({ institution: '' }, { institution: '' })).toBe(false);
    expect(sharesMembership({ institution: 'IRCC' }, { institution: 'DND-MDN' })).toBe(false);
  });
  it('builds one $or branch per set field, none when both are unset', () => {
    expect(membershipConditions({ institution: 'IRCC', group: 'Military transitions' }))
      .toEqual([{ institution: 'IRCC' }, { group: 'Military transitions' }]);
    expect(membershipConditions({})).toEqual([]);
  });
});

describe('canAssignTo', () => {
  it('allows membership-linked users and anyone in the QA group, nobody else', () => {
    expect(canAssignTo({ institution: 'IRCC' }, { institution: 'IRCC' })).toBe(true);
    expect(canAssignTo({ institution: 'IRCC' }, { institution: 'ESDC', group: 'AI Answers QA' })).toBe(true);
    expect(canAssignTo({}, { group: 'AI Answers QA' })).toBe(true);
    expect(canAssignTo({ institution: 'IRCC' }, { institution: 'ESDC', group: 'Military transitions' })).toBe(false);
  });
});
