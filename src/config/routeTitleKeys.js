// src/config/routeTitleKeys.js
//
// Server-side twin of the `titleKey`s in App.js's route table. The client
// sets document.title from a route's titleKey too late for a real (non-SPA)
// page load's one-shot <title> announcement - this map lets server.js patch
// the initial <title>/meta tags per route before sending build/index.html.
//
// Keyed by route *name* (ROUTE_SLUGS in routes.js) and expanded to both
// languages' paths via getPath(), so a slug rename in ROUTE_SLUGS flows
// through here automatically instead of stranding a hand-typed path. The
// titleKeys themselves still have to match App.js's route table by hand -
// its entries carry JSX, so this can't import that array.
// src/config/__tests__/routeTitleKeys.test.js guards against drift by
// parsing App.js's route entries and diffing them against the expanded map.
//
// Deliberately NOT covered (falls back to the generic site title, same as
// before this map existed):
//   - Routes with no titleKey (home, about, logout, HowToPage's
//     markdown-driven routes, which set their own title from frontmatter).
//   - The `*` wildcard 404 route - would need the full route surface
//     enumerated here, not just the titled ones, to distinguish a real
//     unknown path from a known-but-untitled one.
import { getPath } from '../utils/routes.js';
import { normalizePathname } from '../utils/normalizePathname.js';

const ROUTE_NAME_TITLE_KEYS = {
  signin: 'login.title',
  'reset-request': 'reset.request.title',
  'reset-verify': 'reset.verify.title',
  'reset-complete': 'reset.complete.title',
  register: 'signup.title',

  'chat-dashboard': 'admin.chatDashboard.title',
  admin: 'admin.title',
  batch: 'batch.title',
  'chat-viewer': 'logging.title',
  users: 'users.title',
  eval: 'admin.navigation.eval',
  'eval-dashboard': 'admin.evalDashboard.title',
  'auto-eval-dashboard': 'admin.autoEvalDashboard.title',
  'public-eval': 'admin.publicEval.title',
  metrics: 'metrics.title',
  'public-dashboard': 'publicDashboard.title',
  'partner-dashboard': 'partnerDashboard.title',
  'technical-metrics': 'technicalMetrics.title',
  sessions: 'admin.session.title',
  'scenario-overrides': 'scenarioOverrides.title',
  settings: 'settings.title',
  database: 'admin.database.title',
  vector: 'vector.title',
  connectivity: 'connectivity.title',
  'experimental-analysis': 'experimental.analysis.title',
  'experimental-datasets': 'experimental.datasets.title',
  'experimental-create-dataset': 'experimental.datasets.createDatasetTitle',
};

// Routes whose titled path is a named route plus a dynamic segment
// (App.js registers these with the same ':param' suffix in both languages).
const DYNAMIC_ROUTE_TITLE_KEYS = [
  { route: 'experimental-analysis', suffix: '/:batchId', titleKey: 'experimental.results.title' },
  { route: 'experimental-suites', suffix: '/:datasetId', titleKey: 'experimental.suite.title' },
];

const LANGS = ['en', 'fr'];

// Full path -> titleKey, both languages, the same shape as App.js's own
// `path`/`handle.titleKey` pairs.
export const ROUTE_TITLE_KEYS = Object.fromEntries([
  ...Object.entries(ROUTE_NAME_TITLE_KEYS).flatMap(([route, titleKey]) =>
    LANGS.map((lang) => [getPath(route, lang), titleKey])
  ),
  ...DYNAMIC_ROUTE_TITLE_KEYS.flatMap(({ route, suffix, titleKey }) =>
    LANGS.map((lang) => [`${getPath(route, lang)}${suffix}`, titleKey])
  ),
]);

const toPattern = (routePath) =>
  routePath.includes(':')
    ? new RegExp(`^${routePath.replace(/:[^/]+/g, '[^/]+')}$`)
    : null;

const ROUTE_ENTRIES = Object.entries(ROUTE_TITLE_KEYS).map(([routePath, titleKey]) => ({
  routePath,
  titleKey,
  pattern: toPattern(routePath),
}));

// Resolves a real request path (e.g. req.path) to the titleKey App.js would
// have used for it, or null if the route has no titleKey (see the notes
// above - callers should fall back to the generic site title in that case,
// exactly like App.js's own title effect does for pageTitleKey === null).
export const getTitleKeyForPath = (pathname) => {
  const normalized = normalizePathname(pathname);
  if (ROUTE_TITLE_KEYS[normalized]) return ROUTE_TITLE_KEYS[normalized];
  const dynamicMatch = ROUTE_ENTRIES.find((entry) => entry.pattern?.test(normalized));
  return dynamicMatch ? dynamicMatch.titleKey : null;
};
