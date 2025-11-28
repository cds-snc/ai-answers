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
import SessionService from './services/SessionService.js';

// Add the icon packs
library.add(fas, far);

// ---- Adobe Analytics Logic (unchanged) ----
const adobeUrl = window.RUNTIME_CONFIG?.ADOBE_ANALYTICS_URL || process.env.REACT_APP_ADOBE_ANALYTICS_URL;
if (adobeUrl) {
  const script = document.createElement('script');
  script.src = adobeUrl;
  script.async = false;
  document.head.insertBefore(script, document.head.firstChild);

  try {
    const bottomScript = document.createElement('script');
    bottomScript.type = 'text/javascript';
    bottomScript.text = '_satellite.pageBottom();';
    window.addEventListener('load', () => {
      try {
        if (document.body) document.body.appendChild(bottomScript);
      } catch (e) {
        console.warn('Failed to append Adobe pageBottom script to body', e);
      }
    });
  } catch (e) {
    console.warn('Failed to prepare Adobe pageBottom script', e);
  }
}
// --------------------------------------------

// ⭐ Unified Fingerprint Initialization (runs ONCE)
async function initFingerprint() {
  try {
    if (
      typeof window !== 'undefined' &&
      SessionService &&
      typeof SessionService.sendFingerprint === 'function'
    ) {
      await SessionService.sendFingerprint();
    }
  } catch (e) {
    console.warn("Fingerprint initialization failed", e);
  }
}

const renderApp = async () => {
  const root = ReactDOM.createRoot(document.getElementById('root'));

  // ⭐ Fingerprint sent ONCE before render
  await initFingerprint();

  root.render(<App />);
};

// ---- Environment Logic ----
if (process.env.REACT_APP_ENV === 'production') {
  DataStoreService.checkDatabaseConnection()
    .then((isConnected) => {
      console.log(isConnected ? 'Database is connected' : 'Database is NOT connected');
      renderApp();
    })
    .catch((error) => {
      console.error('Error checking database connection:', error);
      renderApp();
    });
} else {
  console.log('Running in development mode. Skipping DB check.');
  renderApp();
}

reportWebVitals();

// ---- Service Worker Logic (unchanged) ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/stream-saver-sw.js')
      .then((registration) => console.log('SW registered:', registration))
      .catch((error) => console.error('SW registration failed:', error));
  });
}
