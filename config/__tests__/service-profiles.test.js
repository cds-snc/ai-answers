import { describe, it, expect } from 'vitest';
import { DEFAULT_SERVICE_PROFILE_ID, getServiceProfile } from '../service-profiles.js';

describe('service profiles', () => {
  it('has a default profile that matches regular AI Answers', () => {
    const profile = getServiceProfile(DEFAULT_SERVICE_PROFILE_ID);

    expect(profile.id).toBe('default');
    expect(profile.maxTurns).toBe(3);
  });

  it.each([
    ['an unknown id', 'not-a-profile'],
    ['undefined', undefined],
    ['an empty string', ''],
    ['an inherited object key', 'toString'],
  ])('throws for %s instead of falling back to default', (_label, id) => {
    expect(() => getServiceProfile(id)).toThrow(/service profile/i);
  });
});
