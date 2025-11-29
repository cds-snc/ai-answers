/**
 * Helpers for setting cookies with a parent domain so they can be shared
 * across subdomains (only outside development).
 */
export const getParentDomain = (host, nodeEnv = process.env.NODE_ENV) => {
  // Only set domain cookie in non-development environments
  if (nodeEnv === 'development') return undefined;
  if (!host) return undefined;

  // Strip port if present
  const hostOnly = host.split(':')[0];
  const lower = hostOnly.toLowerCase();

  // Heuristic: avoid setting a parent domain for known preview/cloud provider
  // hostnames (these are often treated like public suffixes and browsers
  // may reject cookies that set Domain to them). Keep cookies host-only
  // for these environments so browsers accept them in previews.
  // Examples: AWS Lambda preview URLs that include "lambda-url" or end with
  // ".on.aws".
  if (lower.includes('lambda-url') || lower.endsWith('.on.aws')) return undefined;

  const parts = hostOnly.split('.').filter(Boolean);
  // If not a multi-label hostname (localhost, example), don't set domain
  if (parts.length <= 2) return undefined;

  // Drop the first label (subdomain) to get the parent domain
  // e.g. 'ai-answers.alpha.canada.ca' -> '.alpha.canada.ca'
  // e.g. 'reponses-ia.cdssandbox.xyz' -> '.cdssandbox.xyz'
  return '.' + parts.slice(1).join('.');
};

export const getCookieOptions = (req, maxAge) => {
  const isSecure = process.env.NODE_ENV !== 'development';
  const parentDomain = getParentDomain(req && req.get ? req.get('host') : undefined);

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'strict' : 'lax',
    maxAge,
    path: '/',
    ...(parentDomain ? { domain: parentDomain } : {})
  };
};
