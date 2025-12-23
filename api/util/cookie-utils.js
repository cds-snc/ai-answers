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
  
  const parts = hostOnly.split('.').filter(Boolean);
  // If not a multi-label hostname (localhost, example), don't set domain
  if (parts.length <= 2) return undefined;

  // Drop the first label (subdomain) to get the parent domain
  // e.g. 'ai-answers.alpha.canada.ca' -> '.alpha.canada.ca'
  // e.g. 'reponses-ia.cdssandbox.xyz' -> '.cdssandbox.xyz'
  return '.' + parts.slice(1).join('.');
};

export const getCookieOptions = (req, maxAge) => {
  const isSecure = (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test');
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
