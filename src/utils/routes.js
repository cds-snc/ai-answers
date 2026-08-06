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
  'public-dashboard':      { en: 'public-dashboard',             fr: 'tableau-de-bord-public' },
  'partner-dashboard':     { en: 'partner-dashboard',            fr: 'tableau-de-bord-partenaire' },
  'technical-metrics':     { en: 'technical-metrics',            fr: 'metriques-techniques' },
  sessions:                { en: 'sessions',                     fr: 'sessions' },
  'scenario-overrides':    { en: 'scenario-overrides',           fr: 'derogation-scenarios' },
  settings:                { en: 'settings',                     fr: 'parametres' },
  database:                { en: 'database',                     fr: 'base-de-donnees' },
  vector:                  { en: 'vector',                       fr: 'vecteur' },
  connectivity:            { en: 'connectivity',                 fr: 'connectivite' },
  'how-to-eval-informed':  { en: 'how-to/eval-informed-answers',  fr: 'comment-faire/reponses-informees-par-evaluations' },
  'experimental-datasets': { en: 'experimental/datasets',         fr: 'experimental/ensembles-de-donnees' },
  'experimental-create-dataset': { en: 'experimental/create-dataset', fr: 'experimental/creer-ensemble-de-donnees' },
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

/**
 * Translates the path segments that follow the language prefix.
 *
 * Segments must be translated as a path, not one at a time: some routes have
 * multi-segment slugs (e.g. 'how-to/eval-informed-answers'), and translating
 * 'how-to' and 'eval-informed-answers' separately matches neither, leaving the
 * URL in the original language. Matches the longest route prefix first, then
 * preserves any trailing segments such as an id.
 *
 * e.g. translatePathSegments(['how-to', 'eval-informed-answers'], 'en', 'fr')
 *      => ['comment-faire', 'reponses-informees-par-evaluations']
 */
export const translatePathSegments = (segments, fromLang, toLang) => {
  const cleanSegments = (segments || []).filter(Boolean);

  for (let length = cleanSegments.length; length > 0; length -= 1) {
    const candidate = cleanSegments.slice(0, length).join('/');
    for (const slugs of Object.values(ROUTE_SLUGS)) {
      if (slugs[fromLang] === candidate) {
        const translated = slugs[toLang] || candidate;
        return [...translated.split('/'), ...cleanSegments.slice(length)];
      }
    }
  }

  // No route matched the path — fall back to translating each segment on its own.
  return cleanSegments.map((segment) => translateSlug(segment, fromLang, toLang));
};
