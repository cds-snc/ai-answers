import { describe, it, expect } from 'vitest';
import { getAnswerLanguage, toLangAttr, resolveChromeLang } from '../answerLanguage.js';

describe('getAnswerLanguage', () => {
  it('prefers the live-session shape (answer.questionLanguage) over the persisted shape', () => {
    expect(
      getAnswerLanguage({
        answer: { questionLanguage: 'fra' },
        question: { language: 'eng' },
      })
    ).toBe('fra');
  });

  it('falls back to the persisted shape (question.language) when answer.questionLanguage is absent', () => {
    expect(
      getAnswerLanguage({
        answer: {},
        question: { language: 'spa' },
      })
    ).toBe('spa');
  });

  it('returns empty string when neither shape has a language', () => {
    expect(getAnswerLanguage({ answer: {}, question: {} })).toBe('');
  });

  it('returns empty string when interaction is undefined', () => {
    expect(getAnswerLanguage(undefined)).toBe('');
  });
});

describe('toLangAttr', () => {
  it('maps an ISO-639-3 code to its BCP-47 equivalent', () => {
    expect(toLangAttr('eng')).toBe('en');
    expect(toLangAttr('fra')).toBe('fr');
    expect(toLangAttr('spa')).toBe('es');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(toLangAttr(' FRA ')).toBe('fr');
  });

  it('passes through a code with no ISO-639-1 equivalent unchanged', () => {
    expect(toLangAttr('crk')).toBe('crk');
  });

  it('passes through an already-BCP-47 code unchanged', () => {
    expect(toLangAttr('en')).toBe('en');
    expect(toLangAttr('fr')).toBe('fr');
  });

  it('returns undefined for the "undetermined" sentinel (und)', () => {
    expect(toLangAttr('und')).toBeUndefined();
  });

  it('returns undefined for the "no linguistic content" sentinel (zxx)', () => {
    expect(toLangAttr('zxx')).toBeUndefined();
  });

  it('returns undefined for falsy input', () => {
    expect(toLangAttr('')).toBeUndefined();
    expect(toLangAttr(null)).toBeUndefined();
    expect(toLangAttr(undefined)).toBeUndefined();
  });

  it('maps known aliases for the same language to the same BCP-47 code', () => {
    expect(toLangAttr('ara')).toBe('ar');
    expect(toLangAttr('arb')).toBe('ar');
    expect(toLangAttr('zho')).toBe('zh');
    expect(toLangAttr('cmn')).toBe('zh');
  });
});

describe('resolveChromeLang', () => {
  it('switches chrome to the answer language when the answer is in the other official language', () => {
    expect(resolveChromeLang('fr', 'en')).toBe('fr');
    expect(resolveChromeLang('en', 'fr')).toBe('en');
  });

  it('keeps chrome in the answer language when it already matches the page language', () => {
    expect(resolveChromeLang('en', 'en')).toBe('en');
    expect(resolveChromeLang('fr', 'fr')).toBe('fr');
  });

  it('falls back to the page language when the answer is in a non-official language', () => {
    expect(resolveChromeLang('es', 'en')).toBe('en');
    expect(resolveChromeLang('ar', 'fr')).toBe('fr');
    expect(resolveChromeLang('crk', 'en')).toBe('en');
  });

  it('falls back to the page language when the answer language is undefined (und/zxx/undetected)', () => {
    expect(resolveChromeLang(undefined, 'en')).toBe('en');
    expect(resolveChromeLang(undefined, 'fr')).toBe('fr');
  });
});
