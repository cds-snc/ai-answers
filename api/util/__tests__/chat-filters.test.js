import { describe, it, expect } from 'vitest';
import { getChatFilterConditions } from '../chat-filters.js';

describe('getChatFilterConditions - noEval handling', () => {
  const basePath = 'interactions';

  describe('partnerEval', () => {
    it('returns null/empty match when only noEval is selected', () => {
      const conditions = getChatFilterConditions({ partnerEval: 'noEval' }, { basePath });
      expect(conditions).toHaveLength(1);
      const cond = conditions[0];
      expect(cond.$or).toBeDefined();
      expect(cond.$or).toEqual([
        { 'interactions.partnerEval': null },
        { 'interactions.partnerEval': '' }
      ]);
    });

    it('combines noEval with a single eval category using $or', () => {
      const conditions = getChatFilterConditions({ partnerEval: 'noEval,correct' }, { basePath });
      expect(conditions).toHaveLength(1);
      const cond = conditions[0];
      expect(cond.$or).toBeDefined();
      expect(cond.$or).toHaveLength(2);
      // First branch: null/empty
      expect(cond.$or[0].$or).toEqual([
        { 'interactions.partnerEval': null },
        { 'interactions.partnerEval': '' }
      ]);
      // Second branch: exact match
      expect(cond.$or[1]).toEqual({ 'interactions.partnerEval': 'correct' });
    });

    it('combines noEval with multiple eval categories using $or with $in', () => {
      const conditions = getChatFilterConditions({ partnerEval: 'noEval,correct,hasError' }, { basePath });
      expect(conditions).toHaveLength(1);
      const cond = conditions[0];
      expect(cond.$or).toBeDefined();
      expect(cond.$or).toHaveLength(2);
      // First branch: null/empty
      expect(cond.$or[0].$or).toEqual([
        { 'interactions.partnerEval': null },
        { 'interactions.partnerEval': '' }
      ]);
      // Second branch: $in match
      expect(cond.$or[1]).toEqual({ 'interactions.partnerEval': { $in: ['correct', 'hasError'] } });
    });

    it('handles single eval category without noEval (unchanged behavior)', () => {
      const conditions = getChatFilterConditions({ partnerEval: 'correct' }, { basePath });
      expect(conditions).toHaveLength(1);
      expect(conditions[0]).toEqual({ 'interactions.partnerEval': 'correct' });
    });

    it('handles multiple eval categories without noEval (unchanged behavior)', () => {
      const conditions = getChatFilterConditions({ partnerEval: 'correct,hasError' }, { basePath });
      expect(conditions).toHaveLength(1);
      expect(conditions[0]).toEqual({ 'interactions.partnerEval': { $in: ['correct', 'hasError'] } });
    });

    it('returns no conditions when partnerEval is "all"', () => {
      const conditions = getChatFilterConditions({ partnerEval: 'all' }, { basePath });
      expect(conditions).toHaveLength(0);
    });
  });

  describe('aiEval', () => {
    it('returns null/empty match when only noEval is selected', () => {
      const conditions = getChatFilterConditions({ aiEval: 'noEval' }, { basePath });
      expect(conditions).toHaveLength(1);
      const cond = conditions[0];
      expect(cond.$or).toBeDefined();
      expect(cond.$or).toEqual([
        { 'interactions.aiEval': null },
        { 'interactions.aiEval': '' }
      ]);
    });

    it('combines noEval with a single eval category using $or', () => {
      const conditions = getChatFilterConditions({ aiEval: 'noEval,needsImprovement' }, { basePath });
      expect(conditions).toHaveLength(1);
      const cond = conditions[0];
      expect(cond.$or).toBeDefined();
      expect(cond.$or).toHaveLength(2);
      expect(cond.$or[0].$or).toEqual([
        { 'interactions.aiEval': null },
        { 'interactions.aiEval': '' }
      ]);
      expect(cond.$or[1]).toEqual({ 'interactions.aiEval': 'needsImprovement' });
    });

    it('combines noEval with multiple eval categories using $or with $in', () => {
      const conditions = getChatFilterConditions({ aiEval: 'noEval,correct,hasCitationError' }, { basePath });
      expect(conditions).toHaveLength(1);
      const cond = conditions[0];
      expect(cond.$or).toBeDefined();
      expect(cond.$or).toHaveLength(2);
      expect(cond.$or[0].$or).toEqual([
        { 'interactions.aiEval': null },
        { 'interactions.aiEval': '' }
      ]);
      expect(cond.$or[1]).toEqual({ 'interactions.aiEval': { $in: ['correct', 'hasCitationError'] } });
    });

    it('returns no conditions when aiEval is "all"', () => {
      const conditions = getChatFilterConditions({ aiEval: 'all' }, { basePath });
      expect(conditions).toHaveLength(0);
    });
  });
});
