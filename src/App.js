import { useEffect, useMemo } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, useLocation, useMatches } from 'react-router-dom';
import HomePage from './pages/HomePage.js';
import AboutPage from './pages/AboutPage.js';
import ChatDashboardPage from './pages/ChatDashboardPage.js';
import AdminPage from './pages/AdminPage.js';
import ScenarioOverridesPage from './pages/ScenarioOverridesPage.js';
import BatchPage from './pages/BatchPage.js';
import ChatViewer from './pages/ChatViewer.js';
import RegisterPage from './pages/RegisterPage.js';
import LoginPage from './pages/LoginPage.js';
import LogoutPage from './pages/LogoutPage.js';
import ResetRequestPage from './pages/ResetRequestPage.js';
import ResetVerifyPage from './pages/ResetVerifyPage.js';
import ResetCompletePage from './pages/ResetCompletePage.js';
import { GcdsHeader, GcdsBreadcrumbs, GcdsBreadcrumbsItem, GcdsFooter } from '@cdssnc/gcds-components-react';
import './styles/global.css';
import './styles/admin.css';
import './styles/chat.css';
import UsersPage from './pages/UsersPage.js';
import EvalPage from './pages/EvalPage.js';
import EvalDashboardPage from './pages/EvalDashboardPage.js';
import AutoEvalDashboardPage from './pages/AutoEvalDashboardPage.js';
import DatabasePage from './pages/DatabasePage.js';
import SettingsPage from './pages/SettingsPage.js';
import VectorPage from './pages/VectorPage.js';
import { AuthProvider } from './contexts/AuthContext.js';
import { RoleProtectedRoute } from './components/RoleProtectedRoute.js';
import MetricsPage from './pages/MetricsPage.js';
import { DEFAULT_METADATA, DCTERMS } from './config/metadata.js';
import PublicEvalPage from './pages/PublicEvalPage.js';
import SessionPage from './pages/SessionPage.js';
import ConnectivityPage from './pages/ConnectivityPage.js';
import ExperimentalAnalysisPage from './pages/experimental/ExperimentalAnalysisPage.js';
import ExperimentalDatasetsPage from './pages/experimental/ExperimentalDatasetsPage.js';
import NotFoundPage from './pages/404.js';
import { useTranslations } from './hooks/useTranslations.js';
import { translateSlug } from './utils/routes.js';


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
    newSegments.push(...restSegments.filter(Boolean).map(seg => translateSlug(seg, currentLang, newLang)));
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

const NotFoundRoute = () => {
  const location = useLocation();
  const { currentLang } = computeAlternateLangHref(location);
  return <NotFoundPage lang={currentLang} />;
};

const AppLayout = () => {
  const location = useLocation();

  const { alternateLangHref, currentLang } = computeAlternateLangHref(location);
  const { t } = useTranslations(currentLang);
  const matches = useMatches();
  const is404 = matches.some(m => m.handle?.is404);

  useEffect(() => {
    // Removed the auth expiration checker setup
  }, []);

  // Track virtual page views ONLY for public pages (not admin routes)
  useEffect(() => {
    const isPublicPage = location.pathname === '/en' || location.pathname === '/fr' || location.pathname === '/';

    if (isPublicPage && typeof window !== 'undefined' && window._satellite) {
      window._satellite.track('pageview');
    }
  }, [location.pathname]);

  // Update Open Graph meta tags based on current language
  useEffect(() => {
    // Pages can opt-out by setting window.__CUSTOM_METADATA_ACTIVE (set by frontmatter hook)
    const isCustomMetadataPage =
      typeof window !== 'undefined' && window.__CUSTOM_METADATA_ACTIVE === true;

    const langKey = currentLang === 'fr' ? 'FR' : 'EN';
    const ogImage = currentLang === 'fr' ? 'og-image-fr.png' : 'og-image-en.png';
    const title = currentLang === 'fr' ? `Bêta : ${DEFAULT_METADATA.TITLE[langKey]}` : `Beta: ${DEFAULT_METADATA.TITLE[langKey]}`;
    const description = DEFAULT_METADATA.DESCRIPTION[langKey];
    const dctermsDescription = DEFAULT_METADATA.DESCRIPTION[langKey];
    const dctermsLang = currentLang === 'fr' ? 'fra' : 'eng';
    const author = DCTERMS.CREATOR[langKey];
    const dctermsCreator = DCTERMS.CREATOR[langKey];
    const dctermsAudience = currentLang === 'fr' ? 'grand public' : 'general public';
    let projectStatusMeta = document.querySelector('meta[name="project-status"]');
    if (projectStatusMeta) {
      const projectStatus = currentLang === 'fr' ? 'bêta' : 'beta';
      projectStatusMeta.setAttribute('content', projectStatus);
    }

    // Update html lang attribute
    document.documentElement.lang = currentLang;

    // Only update title and description for pages without custom metadata
    if (!isCustomMetadataPage) {
      // Update page title
      document.title = title;

      // Update dcterms.title
      let dctermsTitleMeta = document.querySelector('meta[name="dcterms.title"]');
      if (dctermsTitleMeta) {
        dctermsTitleMeta.setAttribute('content', title);
      }

      // Update description meta tag
      let descMeta = document.querySelector('meta[name="description"]');
      if (descMeta) {
        descMeta.setAttribute('content', description);
      }
    }

    // Update dcterms.language
    let dctermsLangMeta = document.querySelector('meta[name="dcterms.language"]');
    if (dctermsLangMeta) {
      dctermsLangMeta.setAttribute('content', dctermsLang);
    }

    // Update dcterms.description
    let dctermsDescMeta = document.querySelector('meta[name="dcterms.description"]');
    if (dctermsDescMeta) {
      dctermsDescMeta.setAttribute('content', dctermsDescription);
    }

    // Update author meta tag
    let authorMeta = document.querySelector('meta[name="author"]');
    if (authorMeta) {
      authorMeta.setAttribute('content', author);
    }

    // Update dcterms.creator
    let dctermsCreatorMeta = document.querySelector('meta[name="dcterms.creator"]');
    if (dctermsCreatorMeta) {
      dctermsCreatorMeta.setAttribute('content', dctermsCreator);
    }

    // Update dcterms.audience
    let dctermsAudienceMeta = document.querySelector('meta[name="dcterms.audience"]');
    if (dctermsAudienceMeta) {
      dctermsAudienceMeta.setAttribute('content', dctermsAudience);
    }

    // Only update social media meta tags for pages without custom metadata
    if (!isCustomMetadataPage) {
      // Update og:title
      let ogTitleMeta = document.querySelector('meta[property="og:title"]');
      if (ogTitleMeta) {
        ogTitleMeta.setAttribute('content', title);
      }

      // Update og:description
      let ogDescMeta = document.querySelector('meta[property="og:description"]');
      if (ogDescMeta) {
        ogDescMeta.setAttribute('content', description);
      }

      // Update og:image meta tag
      let ogImageMeta = document.querySelector('meta[property="og:image"]');
      if (ogImageMeta) {
        ogImageMeta.setAttribute('content', ogImage);
      }

      // Update twitter:title
      let twitterTitleMeta = document.querySelector('meta[property="twitter:title"]');
      if (twitterTitleMeta) {
        twitterTitleMeta.setAttribute('content', title);
      }

      // Update twitter:description
      let twitterDescMeta = document.querySelector('meta[property="twitter:description"]');
      if (twitterDescMeta) {
        twitterDescMeta.setAttribute('content', description);
      }

      // Update twitter:image meta tag
      let twitterImageMeta = document.querySelector('meta[property="twitter:image"]');
      if (twitterImageMeta) {
        twitterImageMeta.setAttribute('content', ogImage);
      }
    }
  }, [currentLang, location.pathname]);

  return (
    <>
      {!is404 && (
        <section className="alpha-top">
          <div className="container">
            <small>
              <span className="alpha-label">{t('homepage.status.label')}</span>&nbsp;&nbsp;
              {t('homepage.status.description')}
            </small>
          </div>
        </section>
      )}
      <GcdsHeader
        lang={currentLang}
        langHref={alternateLangHref}
        skipToHref="#main-content"
      >
        <GcdsBreadcrumbs slot="breadcrumb">
          {/* Show AI Answers breadcrumb on About and 404 pages */}
          {(location.pathname.includes('/en/about') || location.pathname.includes('/fr/a-propos') || is404) && (
            <GcdsBreadcrumbsItem href={currentLang === 'fr' ? '/fr' : '/en'}>
              {t('notFound.breadcrumb')}
            </GcdsBreadcrumbsItem>
          )}
        </GcdsBreadcrumbs>
      </GcdsHeader>
      <main id="main-content">
        {/* Outlet will be replaced by the matching route's element */}
        <Outlet />
      </main>
      <GcdsFooter display={is404 ? 'full' : 'compact'} lang={currentLang} />
    </>
  );
};

export default function App() {
  const router = useMemo(() => {
    const homeEn = <HomePage lang="en" />;
    const homeFr = <HomePage lang="fr" />;
    const runtimeHostname = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    const hostPrefixMatch = runtimeHostname.match(/^(ai-answers|reponses-ia)(?:\.|$)/);
    const defaultLang = hostPrefixMatch && hostPrefixMatch[1] === 'reponses-ia' ? 'fr' : 'en';
    const homeDefault = defaultLang === 'fr' ? homeFr : homeEn;
    const requireAuthForChat = typeof window !== 'undefined' && window.RUNTIME_CONFIG && window.RUNTIME_CONFIG.REQUIRE_AUTH_FOR_CHAT;

    const publicRoutes = [
      ...(requireAuthForChat ? [] : [
        { path: '/', element: homeDefault },
        { path: '/en', element: homeEn },
        { path: '/fr', element: homeFr },
      ]),
      { path: '/en/about', element: <AboutPage lang="en" /> },
      { path: '/fr/a-propos', element: <AboutPage lang="fr" /> },
      { path: '/en/signin', element: <LoginPage lang="en" /> },
      { path: '/fr/se-connecter', element: <LoginPage lang="fr" /> },
      { path: '/en/reset-request', element: <ResetRequestPage lang="en" /> },
      { path: '/fr/reinitialisation', element: <ResetRequestPage lang="fr" /> },
      { path: '/en/reset-verify', element: <ResetVerifyPage lang="en" /> },
      { path: '/fr/verification-reinitialisation', element: <ResetVerifyPage lang="fr" /> },
      { path: '/en/reset-complete', element: <ResetCompletePage lang="en" /> },
      { path: '/fr/reinitialisation-reussie', element: <ResetCompletePage lang="fr" /> },
      { path: '/en/register', element: <RegisterPage lang="en" /> },
      { path: '/fr/s-inscrire', element: <RegisterPage lang="fr" /> },
      { path: '/en/logout', element: <LogoutPage lang="en" /> },
      { path: '/fr/deconnexion', element: <LogoutPage lang="fr" /> },
      { path: '*', element: <NotFoundRoute />, handle: { is404: true } }
    ];

    const protectedRoutes = [
      ...(requireAuthForChat ? [
        { path: '/', element: homeDefault, roles: ['admin', 'partner'] },
        { path: '/en', element: homeEn, roles: ['admin', 'partner'] },
        { path: '/fr', element: homeFr, roles: ['admin', 'partner'] },
      ] : []),
      { path: '/en/chat-dashboard', element: <ChatDashboardPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/tableau-de-bord', element: <ChatDashboardPage lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/admin', element: <AdminPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/admin', element: <AdminPage lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/batch', element: <BatchPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/lot', element: <BatchPage lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/chat-viewer', element: <ChatViewer lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/visualiseur-de-clavardage', element: <ChatViewer lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/users', element: <UsersPage lang="en" />, roles: ['admin'] },
      { path: '/fr/utilisateurs', element: <UsersPage lang="fr" />, roles: ['admin'] },
      { path: '/en/eval', element: <EvalPage lang="en" />, roles: ['admin'] },
      { path: '/fr/evaluation', element: <EvalPage lang="fr" />, roles: ['admin'] },
      { path: '/en/eval-dashboard', element: <EvalDashboardPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/tableau-de-bord-evaluation', element: <EvalDashboardPage lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/auto-eval-dashboard', element: <AutoEvalDashboardPage lang="en" />, roles: ['admin'] },
      { path: '/fr/tableau-de-bord-auto-evaluation', element: <AutoEvalDashboardPage lang="fr" />, roles: ['admin'] },
      { path: '/en/public-eval', element: <PublicEvalPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/evaluation-publique', element: <PublicEvalPage lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/metrics', element: <MetricsPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/metriques', element: <MetricsPage lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/sessions', element: <SessionPage lang="en" />, roles: ['admin'] },
      { path: '/fr/sessions', element: <SessionPage lang="fr" />, roles: ['admin'] },
      { path: '/en/scenario-overrides', element: <ScenarioOverridesPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/derogation-scenarios', element: <ScenarioOverridesPage lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/settings', element: <SettingsPage lang="en" />, roles: ['admin'] },
      { path: '/fr/parametres', element: <SettingsPage lang="fr" />, roles: ['admin'] },
      { path: '/en/database', element: <DatabasePage lang="en" />, roles: ['admin'] },
      { path: '/fr/base-de-donnees', element: <DatabasePage lang="fr" />, roles: ['admin'] },
      { path: '/en/vector', element: <VectorPage lang="en" />, roles: ['admin'] },
      { path: '/fr/vecteur', element: <VectorPage lang="fr" />, roles: ['admin'] },
      { path: '/en/connectivity', element: <ConnectivityPage lang="en" />, roles: ['admin'] },
      { path: '/fr/connectivite', element: <ConnectivityPage lang="fr" />, roles: ['admin'] },
      { path: '/en/experimental/analysis', element: <ExperimentalAnalysisPage lang="en" />, roles: ['admin'] },
      { path: '/fr/experimental/analysis', element: <ExperimentalAnalysisPage lang="fr" />, roles: ['admin'] },
      { path: '/en/experimental/datasets', element: <ExperimentalDatasetsPage lang="en" />, roles: ['admin'] },
      { path: '/fr/experimental/datasets', element: <ExperimentalDatasetsPage lang="fr" />, roles: ['admin'] }
    ];

    // sessions routes are defined in the protectedRoutes array above

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
              <RoleProtectedRoute roles={route.roles} lang={route.path === '/fr' || route.path.startsWith('/fr/') ? 'fr' : 'en'}>
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