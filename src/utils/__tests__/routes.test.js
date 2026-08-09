import { describe, it, expect } from 'vitest';
import { getPath, translateSlug, translatePathSegments } from '../routes.js';

describe('getPath', () => {
  it('builds a language-specific path for a named route', () => {
    expect(getPath('signin', 'en')).toBe('/en/signin');
    expect(getPath('signin', 'fr')).toBe('/fr/se-connecter');
  });

  it('builds multi-segment paths', () => {
    expect(getPath('how-to-eval-informed', 'en')).toBe('/en/how-to/eval-informed-answers');
    expect(getPath('how-to-eval-informed', 'fr')).toBe(
      '/fr/comment-faire/reponses-informees-par-evaluations'
    );
  });
});

describe('translatePathSegments', () => {
  it('translates a single-segment route', () => {
    expect(translatePathSegments(['signin'], 'en', 'fr')).toEqual(['se-connecter']);
    expect(translatePathSegments(['se-connecter'], 'fr', 'en')).toEqual(['signin']);
  });

  // Regression: segments used to be translated one at a time, so a multi-segment
  // slug matched no route and the language toggle kept the original language.
  it('translates a multi-segment route as a whole path', () => {
    expect(translatePathSegments(['how-to', 'eval-informed-answers'], 'en', 'fr')).toEqual([
      'comment-faire',
      'reponses-informees-par-evaluations',
    ]);
  });

  it('translates a multi-segment route back the other way', () => {
    expect(
      translatePathSegments(['comment-faire', 'reponses-informees-par-evaluations'], 'fr', 'en')
    ).toEqual(['how-to', 'eval-informed-answers']);
  });

  it('translates other multi-segment routes that had the same problem', () => {
    expect(translatePathSegments(['experimental', 'datasets'], 'en', 'fr')).toEqual([
      'experimental',
      'ensembles-de-donnees',
    ]);
  });

  it('preserves trailing segments such as an id', () => {
    expect(translatePathSegments(['experimental', 'datasets', 'abc123'], 'en', 'fr')).toEqual([
      'experimental',
      'ensembles-de-donnees',
      'abc123',
    ]);
  });

  it('leaves unknown paths untouched', () => {
    expect(translatePathSegments(['not', 'a', 'route'], 'en', 'fr')).toEqual(['not', 'a', 'route']);
  });

  it('drops empty segments and handles an empty path', () => {
    expect(translatePathSegments(['', 'signin', ''], 'en', 'fr')).toEqual(['se-connecter']);
    expect(translatePathSegments([], 'en', 'fr')).toEqual([]);
    expect(translatePathSegments(undefined, 'en', 'fr')).toEqual([]);
  });
});

describe('translateSlug', () => {
  it('still translates individual slugs', () => {
    expect(translateSlug('se-connecter', 'fr', 'en')).toBe('signin');
    expect(translateSlug('unknown', 'en', 'fr')).toBe('unknown');
  });
});
