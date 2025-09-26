import  { useEffect, useMemo } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage.js';
import ChatDashboardPage from './pages/ChatDashboardPage.js';
import AdminPage from './pages/AdminPage.js';
import BatchPage from './pages/BatchPage.js';
import ChatViewer from './pages/ChatViewer.js';
import SignupPage from './pages/SignupPage.js';
import LoginPage from './pages/LoginPage.js';
import LogoutPage from './pages/LogoutPage.js';
import { GcdsHeader, GcdsBreadcrumbs, GcdsFooter } from '@cdssnc/gcds-components-react';
import './styles/App.css';
import UsersPage from './pages/UsersPage.js';
import EvalPage from './pages/EvalPage.js';
import DatabasePage from './pages/DatabasePage.js';
import SettingsPage from './pages/SettingsPage.js';
import VectorPage from './pages/VectorPage.js';
import { AuthProvider } from './contexts/AuthContext.js';
import { RoleProtectedRoute } from './components/RoleProtectedRoute.js';
import MetricsPage from './pages/MetricsPage.js';
import PublicEvalPage from './pages/PublicEvalPage.js';
import SessionPage from './pages/SessionPage.js';

// Helper function to get alternate language path.
// Rules:
// - If the URL contains a site prefix ('ai-answers' or 'reponses-ia') we preserve
//   that the prefix maps to a language: 'ai-answers' => 'en', 'reponses-ia' => 'fr'.
//   When switching language we replace the prefix with the one matching the new
//   language (so 'ai-answers' <-> 'reponses-ia').
// - If the URL has no site prefix, we only toggle the leading language segment
//   (or insert it) and keep the rest of the pathname unchanged.
const getAlternatePath = (currentPath, currentLang) => {
  const newLang = currentLang === 'en' ? 'fr' : 'en';

  // Split into segments. Leading slash produces an empty first segment.
  const segments = currentPath.split('/'); // ['', 'ai-answers', 'en', 'page']
  // Debug: log incoming path and computed segments
  try {
    console.debug('[getAlternatePath] currentPath:', currentPath, 'currentLang:', currentLang, 'segments:', segments);
  } catch (e) {
    // ignore in non-browser environments
  }
  const prefixes = ['ai-answers', 'reponses-ia'];

  const hadPrefix = segments[1] && prefixes.includes(segments[1]);

  // Determine where the language would appear (after prefix if present, else first segment)
  const langIndex = hadPrefix ? 2 : 1;
  const hasLang = segments[langIndex] === 'en' || segments[langIndex] === 'fr';

  // Compute the rest of path after the language (if present) or after the prefix/first
  const restSegments = hasLang ? segments.slice(langIndex + 1) : segments.slice(langIndex);

  // If original had a prefix, map the new language to its canonical prefix.
  const langToPrefix = { en: 'ai-answers', fr: 'reponses-ia' };

  const newSegments = [''];
  if (hadPrefix) {
    newSegments.push(langToPrefix[newLang]);
  }

  // Always include the language segment (when toggling we include it explicitly).
  newSegments.push(newLang);

  if (restSegments && restSegments.length) {
    newSegments.push(...restSegments.filter(Boolean));
  }

  const result = newSegments.join('/') || `/${newLang}`;
  try {
    console.debug('[getAlternatePath] hadPrefix:', hadPrefix, 'langIndex:', langIndex, 'hasLang:', hasLang, 'restSegments:', restSegments, 'result:', result);
  } catch (e) {
    // ignore
  }
  return result;
};

// Compute both the current language and the alternate lang href (preserving search/hash).
// Returns an object: { alternateLangHref, currentLang }
const computeAlternateLangHref = (location) => {
  // location is the object from react-router; pathname does not include protocol/host
  try {
    console.debug('[computeAlternateLangHref] location:', location);
  } catch (e) {
    // ignore
  }

  const path = (location && location.pathname) || '/';
  const pathSegments = path.split('/');
  // Debug: show computed path and segments
  try {
    console.debug('[computeAlternateLangHref] path:', path, 'pathSegments:', pathSegments);
  } catch (e) {
    // ignore
  }
  const prefixes = { 'ai-answers': 'en', 'reponses-ia': 'fr' };

  // Detect host-based prefix (subdomain) like ai-answers.alpha.canada.ca
  // react-router's location object doesn't include `hostname`/`protocol` in the
  // browser; fall back to `window.location` when available.
  const runtimeHostname = (location && location.hostname) || (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
  const runtimeProtocol = (location && location.protocol) || (typeof window !== 'undefined' && window.location && window.location.protocol) || '';
  // Use host (may include port) for replacement so we can preserve ports like :3000
  const runtimeHostWithPort = (typeof window !== 'undefined' && window.location && window.location.host) || runtimeHostname;
  const hostPrefixMatch = runtimeHostname.match(/^(ai-answers|reponses-ia)(?:\.|$)/);
  const hostPrefix = hostPrefixMatch ? hostPrefixMatch[1] : null;
  const hadHostPrefix = !!hostPrefix;

  let currentLang = 'en';
  if (pathSegments[1] === 'en' || pathSegments[1] === 'fr') {
    currentLang = pathSegments[1];
  } else if (pathSegments[1] && prefixes[pathSegments[1]]) {
    if (pathSegments[2] === 'en' || pathSegments[2] === 'fr') {
      currentLang = pathSegments[2];
    } else {
      currentLang = prefixes[pathSegments[1]]; // infer from path prefix
    }
  } else if (pathSegments[2] && (pathSegments[2] === 'en' || pathSegments[2] === 'fr')) {
    currentLang = pathSegments[2];
  } else if (hadHostPrefix) {
    // Infer language from host prefix when path doesn't contain language or site prefix
    currentLang = prefixes[hostPrefix] || currentLang;
  }

  try {
    console.debug('[computeAlternateLangHref] hostname:', runtimeHostname, 'hostPrefix:', hostPrefix, 'hadHostPrefix:', hadHostPrefix, 'currentLang:', currentLang);
  } catch (e) {
    // ignore
  }

  const alternatePath = getAlternatePath(path, currentLang);

  // If the original site uses a host prefix (subdomain), toggle that subdomain
  // and return an absolute URL; otherwise return a relative path. Use the
  // runtimeProtocol/runtimeHostWithPort computed above and preserve search/hash
  // by falling back to window.location when react-router's location doesn't
  // include them.
  const langToPrefix = { en: 'ai-answers', fr: 'reponses-ia' };
  const newLang = currentLang === 'en' ? 'fr' : 'en';
  let alternateLangHref;
  if (hadHostPrefix) {
    // Replace the first label of the hostname while preserving any port.
    const [hostOnly, port] = runtimeHostWithPort.split(':');
    const hostLabels = hostOnly.split('.');
    hostLabels[0] = langToPrefix[newLang];
    const newHost = hostLabels.join('.') + (port ? ':' + port : '');
    const search = (location && location.search) || (typeof window !== 'undefined' ? window.location.search : '');
    const hash = (location && location.hash) || (typeof window !== 'undefined' ? window.location.hash : '');
    alternateLangHref = `${runtimeProtocol}//${newHost}${alternatePath}${search || ''}${hash || ''}`;
  } else {
    const search = (location && location.search) || (typeof window !== 'undefined' ? window.location.search : '');
    const hash = (location && location.hash) || (typeof window !== 'undefined' ? window.location.hash : '');
    alternateLangHref = `${alternatePath}${search || ''}${hash || ''}`;
  }

  try {
    console.debug('[computeAlternateLangHref] currentLang:', currentLang, 'alternatePath:', alternatePath, 'alternateLangHref:', alternateLangHref);
  } catch (e) {
    // ignore
  }

  return { alternateLangHref, currentLang };
};

const AppLayout = () => {
  const location = useLocation();

  const { alternateLangHref, currentLang } = computeAlternateLangHref(location);

  useEffect(() => {
    // Removed the auth expiration checker setup
  }, []);

  // Update Open Graph meta tags based on current language
  useEffect(() => {
    const ogImage = currentLang === 'fr' ? 'og-image-fr.png' : 'og-image-en.png';
    
    // Update og:image meta tag
    let ogImageMeta = document.querySelector('meta[property="og:image"]');
    if (ogImageMeta) {
      ogImageMeta.setAttribute('content', ogImage);
    }
    
    // Update twitter:image meta tag
    let twitterImageMeta = document.querySelector('meta[property="twitter:image"]');
    if (twitterImageMeta) {
      twitterImageMeta.setAttribute('content', ogImage);
    }
  }, [currentLang]);

  return (
    <>
      <section className="alpha-top">
        <div className="container">
          <small>
            <span className="alpha-label">Alpha</span>&nbsp;&nbsp;
            {currentLang === 'en'
              ? 'Experimental page - not public.'
              : 'Page expérimentale - non publique.'}
          </small>
        </div>
      </section>
      <GcdsHeader 
        lang={currentLang} 
        langHref={alternateLangHref} 
        skipToHref="#main-content"
      >
        <GcdsBreadcrumbs slot="breadcrumb">
          {/* Add breadcrumb items as needed */}
        </GcdsBreadcrumbs>
      </GcdsHeader>
      <main id="main-content">
        {/* Outlet will be replaced by the matching route's element */}
        <Outlet />
      </main>
      <GcdsFooter display="compact" lang={currentLang} />
    </>
  );
};

export default function App() {
  const router = useMemo(() => {
    const homeEn = <HomePage lang="en" />;
    const homeFr = <HomePage lang="fr" />;
    const publicRoutes = [
      { path: '/', element: homeEn },
      { path: '/en', element: homeEn },
      { path: '/fr', element: homeFr },
      { path: '/en/signin', element: <LoginPage lang="en" /> },
      { path: '/fr/signin', element: <LoginPage lang="fr" /> },
      { path: '/en/signup', element: <SignupPage lang="en" /> },
      { path: '/fr/signup', element: <SignupPage lang="fr" /> },
      { path: '/en/logout', element: <LogoutPage lang="en" /> },
      { path: '/fr/logout', element: <LogoutPage lang="fr" /> }
    ];

    const protectedRoutes = [
      { path: '/en/chat-dashboard', element: <ChatDashboardPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/chat-dashboard', element: <ChatDashboardPage lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/admin', element: <AdminPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/admin', element: <AdminPage lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/batch', element: <BatchPage lang="en" />, roles: ['admin'] },
      { path: '/fr/batch', element: <BatchPage lang="fr" />, roles: ['admin'] },
      { path: '/en/chat-viewer', element: <ChatViewer lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/chat-viewer', element: <ChatViewer lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/users', element: <UsersPage lang="en" />, roles: ['admin'] },
      { path: '/fr/users', element: <UsersPage lang="fr" />, roles: ['admin'] },
      { path: '/en/eval', element: <EvalPage lang="en" />, roles: ['admin'] },
      { path: '/fr/eval', element: <EvalPage lang="fr" />, roles: ['admin'] },
      { path: '/en/public-eval', element: <PublicEvalPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/public-eval', element: <PublicEvalPage lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/metrics', element: <MetricsPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/metrics', element: <MetricsPage lang="fr" />, roles: ['admin', 'partner'] },
    { path: '/en/settings', element: <SettingsPage lang="en" />, roles: ['admin'] },
    { path: '/fr/settings', element: <SettingsPage lang="fr" />, roles: ['admin'] },
    { path: '/en/database', element: <DatabasePage lang="en" />, roles: ['admin'] },
    { path: '/fr/database', element: <DatabasePage lang="fr" />, roles: ['admin'] },
    { path: '/en/vector', element: <VectorPage lang="en" />, roles: ['admin'] },
    { path: '/fr/vector', element: <VectorPage lang="fr" />, roles: ['admin'] }
    ];

  // Add sessions admin-only route
  protectedRoutes.push({ path: '/en/sessions', element: <SessionPage lang="en" />, roles: ['admin'] });
  protectedRoutes.push({ path: '/fr/sessions', element: <SessionPage lang="fr" />, roles: ['admin'] });

    return createBrowserRouter([
      {
        element: (
          <AuthProvider>
            <AppLayout />
          </AuthProvider>
        ),
        children: [
          ...publicRoutes,
          ...protectedRoutes.map(route => ({
            path: route.path,
            element: (
              <RoleProtectedRoute roles={route.roles} lang={route.path.includes('/fr/') ? 'fr' : 'en'}>
                {route.element}
              </RoleProtectedRoute>
            )
          }))
        ]
      }
    ]);
  }, []);

  return (
    <RouterProvider router={router} />
  );
}