import { describe, it, expect } from 'vitest';
import { getAnswerLanguage, toLangAttr, resolveDisplayContent } from '../answerLanguage.js';

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

// Signed-off admin/eval display rule: EN and FR show their own original
// text; only a genuinely non-EN/FR language falls back to the English
// version.
describe('resolveDisplayContent', () => {
  it('shows the original text for English, tagged lang="en"', () => {
    expect(resolveDisplayContent({ language: 'eng', original: 'Can I renew online?', english: 'Can I renew online?' }))
      .toEqual({ text: 'Can I renew online?', lang: 'en', isSource: false });
  });

  it('shows the original text for French, tagged lang="fr" - not the English fallback', () => {
    expect(resolveDisplayContent({ language: 'fra', original: 'Puis-je renouveler en ligne?', english: 'Can I renew online?' }))
      .toEqual({ text: 'Puis-je renouveler en ligne?', lang: 'fr', isSource: false });
  });

  it('falls back to the English version for a non-EN/FR language, tagged lang="en", and flags isSource', () => {
    expect(resolveDisplayContent({ language: 'ara', original: 'هل يمكنني التجديد عبر الإنترنت؟', english: 'Can I renew online?' }))
      .toEqual({ text: 'Can I renew online?', lang: 'en', isSource: true });
  });

  it('falls back to the original text when a non-EN/FR language has no English version available', () => {
    // Shouldn't happen once the translation pipeline has run, but a missing
    // english value must not silently produce empty/undefined display text.
    expect(resolveDisplayContent({ language: 'ara', original: 'هل يمكنني التجديد عبر الإنترنت؟', english: '' }))
      .toEqual({ text: 'هل يمكنني التجديد عبر الإنترنت؟', lang: 'ar', isSource: false });
  });

  it('defaults to showing the original text untagged when no language is known at all', () => {
    // Legacy data, or a field this hasn't been wired up for yet - matches
    // pre-existing display behaviour instead of guessing at a language.
    expect(resolveDisplayContent({ language: '', original: 'Can I renew online?', english: '' }))
      .toEqual({ text: 'Can I renew online?', lang: undefined, isSource: false });
  });

  it('treats an already-BCP-47 "en"/"fr" the same as the ISO-639-3 form', () => {
    expect(resolveDisplayContent({ language: 'en', original: 'Can I renew online?', english: '' }).isSource).toBe(false);
    expect(resolveDisplayContent({ language: 'fr', original: 'Puis-je renouveler en ligne?', english: '' }).isSource).toBe(false);
  });

  it('never returns undefined text, even with no original and no english', () => {
    expect(resolveDisplayContent({ language: 'ara', original: undefined, english: undefined }).text).toBe('');
  });
});
