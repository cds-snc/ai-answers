import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/App.css';
import App from './App.js';
import reportWebVitals from './reportWebVitals.js';
import '@cdssnc/gcds-components-react/gcds.css';
import '@cdssnc/gcds-utility/dist/gcds-utility.min.css';
import { library } from '@fortawesome/fontawesome-svg-core';
import '@fortawesome/fontawesome-svg-core/styles.css';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import DataStoreService from './services/DataStoreService.js';
import { initFingerprint } from './utils/fingerprint.js';
// Add the icon packs to the library
library.add(fas, far);

const renderApp = () => {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};
// Start deterministic fingerprint initialization early at bootstrap so
// service modules can await `window.fpInitPromise` to avoid timing races.
// We don't block rendering on it, but kickoff as soon as possible.
try {
  if (typeof window !== 'undefined' && typeof initFingerprint === 'function') {
    // expose the promise so any module can await: await window.fpInitPromise
    // Note: some test runners may not have window; guard accordingly.
    window.fpInitPromise = initFingerprint();
  }
} catch (e) {
  // swallow errors during bootstrap so they don't prevent app render
  console.warn('Fingerprint init failed to start during bootstrap', e);
}

if (process.env.REACT_APP_ENV === 'production') {
  DataStoreService.checkDatabaseConnection()
    .then((isConnected) => {
      if (isConnected) {
        console.log('Database is connected');
      } else {
        console.warn('Database is not connected. Some features may not work.');
      }
      renderApp();
    })
    .catch((error) => {
      console.error('Error checking database connection:', error);
      renderApp();
    });
} else {
  console.log('Running in development mode. Skipping database connection check.');
  renderApp();
}

reportWebVitals();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/stream-saver-sw.js') // Adjust the path if necessary
      .then((registration) => {
        console.log('StreamSaver service worker registered:', registration);
      })
      .catch((error) => {
        console.error('StreamSaver service worker registration failed:', error);
      });
  });
}
