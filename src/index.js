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
import { DataStoreService } from './services/DataStoreService.js';
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
