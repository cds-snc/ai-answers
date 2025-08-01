import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/App.css";
import App from "./App.js";
import reportWebVitals from "./reportWebVitals.js";
import "@cdssnc/gcds-components-react/gcds.css";
import "@cdssnc/gcds-utility/dist/gcds-utility.min.css";
import { library } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { fas } from "@fortawesome/free-solid-svg-icons";
import { far } from "@fortawesome/free-regular-svg-icons";
import DataStoreService from "./services/DataStoreService.js";
// Add the icon packs to the library
library.add(fas, far);

// Render the application immediately with error handling
try {
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("React app rendered successfully");
} catch (error) {
  console.error("Failed to render React app:", error);
  // Fallback: show error message in the root div
  const rootElement = document.getElementById("root");
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="padding: 20px; color: red; font-family: Arial, sans-serif;">
        <h1>Application Error</h1>
        <p>Failed to load the application. Please check the console for details.</p>
        <pre>${error.message}</pre>
      </div>
    `;
  }
}

// Perform the database connection check in the background without blocking the UI
if (process.env.REACT_APP_ENV === "production") {
  DataStoreService.checkDatabaseConnection()
    .then((isConnected) => {
      if (isConnected) {
        console.log("Database is connected");
      } else {
        console.warn("Database is not connected. Some features may not work.");
      }
    })
    .catch((error) => {
      console.error("Error checking database connection:", error);
    });
} else {
  console.log(
    "Running in development mode. Skipping database connection check."
  );
}

reportWebVitals();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/stream-saver-sw.js") // Adjust the path if necessary
      .then((registration) => {
        console.log("StreamSaver service worker registered:", registration);
      })
      .catch((error) => {
        console.error("StreamSaver service worker registration failed:", error);
      });
  });
}
