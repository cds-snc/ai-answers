import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/App.css';
import App from './App.js';
import reportWebVitals from './reportWebVitals.js';
import '@cdssnc/gcds-components-react/gcds.css';
import '@cdssnc/gcds-utility/dist/gcds-utility.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import checkDatabaseConnection from './services/database.js';

const renderApp = () => {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

if (process.env.REACT_APP_ENV === 'production') {
  checkDatabaseConnection()
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