import { describe, it, expect } from 'vitest';
import { getParentDomain, getCookieOptions } from '../cookie-utils.js';

describe('cookie-utils', () => {
  it('keeps Lambda preview hosts host-only', () => {
    expect(getParentDomain('ut5ddkxlxnszu2iqnfps6j7mbm0kccdh.lambda-url.ca-central-1.on.aws')).toBeUndefined();
    expect(getParentDomain('ut5ddkxlxnszu2iqnfps6j7mbm0kccdh.lambda-url.ca-central-1.on.aws:443')).toBeUndefined();
  });

  it('still derives a parent domain for normal subdomains', () => {
    expect(getParentDomain('app.alpha.canada.ca')).toBe('.alpha.canada.ca');
  });

  it('omits Domain for preview cookies', () => {
    const req = { get: () => 'ut5ddkxlxnszu2iqnfps6j7mbm0kccdh.lambda-url.ca-central-1.on.aws' };
    expect(getCookieOptions(req, 60_000)).not.toHaveProperty('domain');
  });
});
