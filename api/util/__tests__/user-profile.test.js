import { describe, it, expect } from 'vitest';
import { normalizeInstitution, normalizeGroup } from '../user-profile.js';

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
