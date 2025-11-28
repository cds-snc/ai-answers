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
// Add the icon packs to the library
library.add(fas, far);

// Load Adobe Analytics script synchronously BEFORE React renders
// This ensures _satellite is available before any tracking calls
const adobeUrl = window.RUNTIME_CONFIG?.ADOBE_ANALYTICS_URL || process.env.REACT_APP_ADOBE_ANALYTICS_URL;
if (adobeUrl) {
  const script = document.createElement('script');
  script.src = adobeUrl;
  script.async = false; // Load synchronously to ensure it's ready before React renders
  document.head.insertBefore(script, document.head.firstChild); // Insert at the very top of head
  // Also add a small inline script at the bottom of the body that calls
  // _satellite.pageBottom() once the window has finished loading. We wait
  // for the load event to ensure document.body exists and the Adobe
  // library has been executed.
  try {
    const bottomScript = document.createElement('script');
    bottomScript.type = 'text/javascript';
    bottomScript.text = '_satellite.pageBottom();';
    // Append at load so body is present and _satellite is ready
    window.addEventListener('load', () => {
      try {
        if (document.body) {
          document.body.appendChild(bottomScript);
        }
      } catch (e) {
        // swallow errors to avoid breaking bootstrap
        console.warn('Failed to append Adobe pageBottom script to body', e);
      }
    });
  } catch (e) {
    // swallow errors during bootstrap so they don't prevent app render
    console.warn('Failed to prepare Adobe pageBottom script', e);
  }
}

const renderApp = () => {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
      <App />
    );
};
// (Fingerprint initialization removed from bootstrap.)

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
