/* eslint-disable no-unused-vars */
/* eslint-disable import/no-unused-modules */
import React, { useState } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage.js';
import AdminPage from './pages/AdminPage.js';
import EvaluationPage from './pages/BatchPage.js';
import LogPage from './pages/LogPage.js';
import {
  GcdsHeader,
  GcdsBreadcrumbs,
  GcdsBreadcrumbsItem,
  GcdsFooter,
} from '@cdssnc/gcds-components-react';
import './styles/App.css';

// Helper function to get alternate language path
const getAlternatePath = (currentPath, currentLang) => {
  const newLang = currentLang === 'en' ? 'fr' : 'en';
  if (currentPath === '/' || currentPath === '/fr') {
    return `/${newLang}`;
  }
  // Remove leading language identifier if it exists and add new one
  const pathWithoutLang = currentPath.replace(/^\/(en|fr)/, '');
  return `/${newLang}${pathWithoutLang}`;
};

const AppLayout = () => {
  const location = useLocation();
  const currentLang = location.pathname.startsWith('/fr') ? 'fr' : 'en';
  const alternateLangHref = getAlternatePath(location.pathname, currentLang);

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

      <GcdsHeader lang={currentLang} langHref={alternateLangHref} skipToHref="#main-content">
        <GcdsBreadcrumbs slot="breadcrumb">{/* Add breadcrumb items as needed */}</GcdsBreadcrumbs>
      </GcdsHeader>

      <main id="main-content">
        {/* Outlet will be replaced by the matching route's element */}
        <Outlet />
      </main>

      <GcdsFooter display="compact" lang={currentLang} />
    </>
  );
};

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      {
        path: '/',
        element: <HomePage lang="en" />,
      },
      {
        path: '/en',
        element: <HomePage lang="en" />,
      },
      {
        path: '/en/admin',
        element: <AdminPage lang="en" />,
      },
      {
        path: '/en/batch',
        element: <EvaluationPage lang="en" />,
      },
      {
        path: '/fr',
        element: <HomePage lang="fr" />,
      },
      {
        path: '/fr/admin',
        element: <AdminPage lang="fr" />,
      },
      {
        path: '/fr/batch',
        element: <EvaluationPage lang="fr" />,
      },
      {
        path: '/en/logs',
        element: <LogPage lang="en" />,
      },
      {
        path: '/fr/logs',
        element: <LogPage lang="fr" />,
      },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
