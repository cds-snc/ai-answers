export const ROUTE_SLUGS = {
  // Public
  signin:                  { en: 'signin',                       fr: 'se-connecter' },
  about:                   { en: 'about',                        fr: 'a-propos' },
  register:                { en: 'register',                     fr: 's-inscrire' },
  logout:                  { en: 'logout',                       fr: 'deconnexion' },
  'reset-request':         { en: 'reset-request',                fr: 'reinitialisation' },
  'reset-verify':          { en: 'reset-verify',                 fr: 'verification-reinitialisation' },
  'reset-complete':        { en: 'reset-complete',               fr: 'reinitialisation-reussie' },
  // Protected
  admin:                   { en: 'admin',                        fr: 'admin' },
  'chat-dashboard':        { en: 'chat-dashboard',               fr: 'tableau-de-bord' },
  batch:                   { en: 'batch',                        fr: 'lot' },
  'chat-viewer':           { en: 'chat-viewer',                  fr: 'visualiseur-de-clavardage' },
  users:                   { en: 'users',                        fr: 'utilisateurs' },
  eval:                    { en: 'eval',                         fr: 'evaluation' },
  'eval-dashboard':        { en: 'eval-dashboard',               fr: 'tableau-de-bord-evaluation' },
  'auto-eval-dashboard':   { en: 'auto-eval-dashboard',          fr: 'tableau-de-bord-auto-evaluation' },
  'public-eval':           { en: 'public-eval',                  fr: 'evaluation-publique' },
  metrics:                 { en: 'metrics',                      fr: 'metriques' },
  sessions:                { en: 'sessions',                     fr: 'sessions' },
  'scenario-overrides':    { en: 'scenario-overrides',           fr: 'derogation-scenarios' },
  settings:                { en: 'settings',                     fr: 'parametres' },
  database:                { en: 'database',                     fr: 'base-de-donnees' },
  vector:                  { en: 'vector',                       fr: 'vecteur' },
  connectivity:            { en: 'connectivity',                 fr: 'connectivite' },
};

/**
 * Returns the full path for a named route in the given language.
 * e.g. getPath('signin', 'fr') => '/fr/se-connecter'
 */
export const getPath = (name, lang = 'en') => {
  const slugs = ROUTE_SLUGS[name];
  const slug = slugs ? (slugs[lang] || slugs.en) : name;
  return `/${lang}/${slug}`;
};

/**
 * Translates a URL slug from one language to another.
 * Returns the slug unchanged if no mapping is found.
 * e.g. translateSlug('se-connecter', 'fr', 'en') => 'signin'
 */
export const translateSlug = (slug, fromLang, toLang) => {
  for (const slugs of Object.values(ROUTE_SLUGS)) {
    if (slugs[fromLang] === slug) return slugs[toLang] || slug;
  }
  return slug;
};
