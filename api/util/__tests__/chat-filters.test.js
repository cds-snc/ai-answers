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

  describe('hasContentIssue (partnerEval only — no AI-eval equivalent)', () => {
    it('matches the tagged boolean field, independent of score category', () => {
      const conditions = getChatFilterConditions({ partnerEval: 'hasContentIssue' }, { basePath });
      expect(conditions).toHaveLength(1);
      expect(conditions[0]).toEqual({ 'interactions.partnerHasContentIssue': true });
    });

    it('ORs with a score category when both are selected', () => {
      const conditions = getChatFilterConditions({ partnerEval: 'hasContentIssue,correct' }, { basePath });
      expect(conditions).toHaveLength(1);
      expect(conditions[0]).toEqual({
        $or: [
          { 'interactions.partnerHasContentIssue': true },
          { 'interactions.partnerEval': 'correct' }
        ]
      });
    });

    it('ORs with noEval too, when all three are selected', () => {
      const conditions = getChatFilterConditions({ partnerEval: 'noEval,hasContentIssue' }, { basePath });
      expect(conditions).toHaveLength(1);
      expect(conditions[0]).toEqual({
        $or: [
          { $or: [{ 'interactions.partnerEval': null }, { 'interactions.partnerEval': '' }] },
          { 'interactions.partnerHasContentIssue': true }
        ]
      });
    });

    it('is ignored on aiEval (no such tag exists there)', () => {
      // 'hasContentIssue' is stripped as a recognized pseudo-category token
      // regardless of field, but only turns into a match branch for
      // partnerEval — so on aiEval it's silently dropped rather than either
      // matching the (nonexistent) tag or being treated as a literal
      // category string.
      const conditions = getChatFilterConditions({ aiEval: 'hasContentIssue' }, { basePath });
      expect(conditions).toHaveLength(0);
    });

    it('still matches a real category on aiEval when paired with the ignored token', () => {
      const conditions = getChatFilterConditions({ aiEval: 'hasContentIssue,correct' }, { basePath });
      expect(conditions).toHaveLength(1);
      expect(conditions[0]).toEqual({ 'interactions.aiEval': 'correct' });
    });
  });

  describe('evalLogic', () => {
    it('defaults to AND (two separate conditions) when evalLogic is not set', () => {
      const conditions = getChatFilterConditions({ partnerEval: 'correct', aiEval: 'needsImprovement' }, { basePath });
      expect(conditions).toHaveLength(2);
      expect(conditions).toContainEqual({ 'interactions.partnerEval': 'correct' });
      expect(conditions).toContainEqual({ 'interactions.aiEval': 'needsImprovement' });
    });

    it('treats any value other than "or" as AND', () => {
      const conditions = getChatFilterConditions(
        { partnerEval: 'correct', aiEval: 'needsImprovement', evalLogic: 'and' },
        { basePath }
      );
      expect(conditions).toHaveLength(2);
    });

    it('combines both into a single $or condition when evalLogic is "or" and both are set', () => {
      const conditions = getChatFilterConditions(
        { partnerEval: 'correct', aiEval: 'needsImprovement', evalLogic: 'or' },
        { basePath }
      );
      expect(conditions).toHaveLength(1);
      expect(conditions[0]).toEqual({
        $or: [
          { 'interactions.partnerEval': 'correct' },
          { 'interactions.aiEval': 'needsImprovement' }
        ]
      });
    });

    it('is a no-op when evalLogic is "or" but only one of the two filters is set', () => {
      const partnerOnly = getChatFilterConditions({ partnerEval: 'correct', evalLogic: 'or' }, { basePath });
      expect(partnerOnly).toHaveLength(1);
      expect(partnerOnly[0]).toEqual({ 'interactions.partnerEval': 'correct' });

      const aiOnly = getChatFilterConditions({ aiEval: 'needsImprovement', evalLogic: 'or' }, { basePath });
      expect(aiOnly).toHaveLength(1);
      expect(aiOnly[0]).toEqual({ 'interactions.aiEval': 'needsImprovement' });
    });

    it('is a no-op when evalLogic is "or" but neither filter is set', () => {
      const conditions = getChatFilterConditions({ evalLogic: 'or' }, { basePath });
      expect(conditions).toHaveLength(0);
    });
  });
});
