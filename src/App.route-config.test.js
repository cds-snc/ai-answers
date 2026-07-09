/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateBrowserRouter,
  mockRouterProvider,
  mockAuthProvider,
  mockRoleProtectedRoute,
  mockHomePage,
  mockGenericPage,
  mockUseAuth,
  mockUseTranslations,
  mockTranslateSlug,
} = vi.hoisted(() => ({
  mockCreateBrowserRouter: vi.fn((routes) => routes),
  mockRouterProvider: vi.fn(() => null),
  mockAuthProvider: vi.fn(({ children }) => React.createElement(React.Fragment, null, children)),
  mockRoleProtectedRoute: vi.fn(({ children }) => React.createElement(React.Fragment, null, children)),
  mockHomePage: vi.fn(() => null),
  mockGenericPage: vi.fn(() => null),
  mockUseAuth: vi.fn(() => ({
    currentUser: null,
    sessionWarningVisible: false,
  })),
  mockUseTranslations: vi.fn(() => ({
    t: (key) => key,
  })),
  mockTranslateSlug: vi.fn((slug) => slug),
}));

vi.mock('react-router-dom', () => ({
  createBrowserRouter: mockCreateBrowserRouter,
  RouterProvider: mockRouterProvider,
  Outlet: () => null,
  useLocation: () => ({ pathname: '/en', search: '', hash: '' }),
  useMatches: () => [],
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsHeader: ({ children }) => React.createElement('gcds-header', null, children),
  GcdsBreadcrumbs: ({ children }) => React.createElement('gcds-breadcrumbs', null, children),
  GcdsBreadcrumbsItem: ({ children }) => React.createElement('gcds-breadcrumb-item', null, children),
  GcdsFooter: () => React.createElement('gcds-footer'),
  GcdsNotice: ({ children }) => React.createElement('gcds-notice', null, children),
  GcdsText: ({ children }) => React.createElement('gcds-text', null, children),
}));

vi.mock('./contexts/AuthContext.js', () => ({
  AuthProvider: mockAuthProvider,
  useAuth: mockUseAuth,
}));

vi.mock('./components/RoleProtectedRoute.js', () => ({
  RoleProtectedRoute: mockRoleProtectedRoute,
}));

vi.mock('./hooks/useTranslations.js', () => ({
  useTranslations: mockUseTranslations,
}));

vi.mock('./utils/routes.js', () => ({
  translateSlug: mockTranslateSlug,
}));

vi.mock('./pages/HomePage.js', () => ({ default: mockHomePage }));
vi.mock('./pages/AboutPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/ChatDashboardPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/AdminPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/ScenarioOverridesPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/BatchPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/ChatViewer.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/RegisterPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/LoginPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/LogoutPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/ResetRequestPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/ResetVerifyPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/ResetCompletePage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/UsersPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/EvalPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/EvalDashboardPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/AutoEvalDashboardPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/DatabasePage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/SettingsPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/VectorPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/MetricsPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/ExecDashboardPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/PartnerDashboardPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/TechnicalMetricsPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/PublicEvalPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/SessionPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/ConnectivityPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/experimental/ExperimentalAnalysisPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/experimental/ExperimentalDatasetsPage.js', () => ({ default: mockGenericPage }));
vi.mock('./pages/404.js', () => ({ default: mockGenericPage }));

vi.mock('./config/metadata.js', () => ({
  DEFAULT_METADATA: {
    TITLE: { EN: 'Beta', FR: 'Bêta' },
    DESCRIPTION: { EN: 'English description', FR: 'Description française' },
  },
  DCTERMS: {
    CREATOR: { EN: 'Creator', FR: 'Créateur' },
  },
}));

import App from './App.js';
import { PUBLIC_HOME_ROUTE_PATHS } from './config/appRoutePaths.js';

const getChildren = () => mockCreateBrowserRouter.mock.calls.at(-1)[0][0].children;
const getHomeRoutes = () => getChildren().filter((route) => PUBLIC_HOME_ROUTE_PATHS.includes(route.path));

describe('App route config', () => {
  beforeEach(() => {
    mockCreateBrowserRouter.mockClear();
    mockRouterProvider.mockClear();
    mockAuthProvider.mockClear();
    mockRoleProtectedRoute.mockClear();
    window.RUNTIME_CONFIG = { REQUIRE_AUTH_FOR_CHAT: false };
  });

  afterEach(() => {
    cleanup();
    delete window.RUNTIME_CONFIG;
  });

  it('registers the home routes as public when chat auth is disabled', () => {
    render(<App />);

    const homeRoutes = getHomeRoutes();

    expect(homeRoutes).toHaveLength(3);
    expect(homeRoutes.map((route) => route.path)).toEqual(['/', '/en', '/fr']);
    expect(homeRoutes.every((route) => route.element.type === mockHomePage)).toBe(true);
    expect(homeRoutes.every((route) => route.element.type !== mockRoleProtectedRoute)).toBe(true);
  });

  it('wraps the home routes in role protection when chat auth is enabled', () => {
    window.RUNTIME_CONFIG = { REQUIRE_AUTH_FOR_CHAT: true };

    render(<App />);

    const homeRoutes = getHomeRoutes();

    expect(homeRoutes).toHaveLength(3);
    expect(homeRoutes.map((route) => route.path)).toEqual(['/', '/en', '/fr']);
    expect(homeRoutes.every((route) => route.element.type === mockRoleProtectedRoute)).toBe(true);
    for (const route of homeRoutes) {
      expect(route.element.props.roles).toEqual(['admin', 'partner']);
    }
    expect(homeRoutes.every((route) => route.element.props.children.type === mockHomePage)).toBe(true);
  });
});
