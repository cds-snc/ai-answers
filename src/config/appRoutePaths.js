export const PUBLIC_HOME_ROUTE_PATHS = ['/', '/en', '/fr'];

export const PUBLIC_AUTH_ALWAYS_EXEMPT_PATHS = [
  '/en/about',
  '/fr/a-propos',
  '/en/signin',
  '/fr/se-connecter',
  '/en/reset-request',
  '/fr/reinitialisation',
  '/en/reset-verify',
  '/fr/verification-reinitialisation',
  '/en/reset-complete',
  '/fr/reinitialisation-reussie',
  '/en/register',
  '/fr/s-inscrire',
  '/en/logout',
  '/fr/deconnexion',
];

export const getPublicAuthExemptPaths = (requireAuthForChat = false) => {
  const paths = new Set(PUBLIC_AUTH_ALWAYS_EXEMPT_PATHS);

  if (!requireAuthForChat) {
    for (const path of PUBLIC_HOME_ROUTE_PATHS) {
      paths.add(path);
    }
  }

  return paths;
};

export const isPublicAuthExemptPath = (pathname, requireAuthForChat = false) => {
  const normalizedPathname = pathname && pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname;
  return getPublicAuthExemptPaths(requireAuthForChat).has(normalizedPathname || '/');
};
