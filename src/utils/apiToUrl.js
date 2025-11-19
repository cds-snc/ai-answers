const getApiUrl = (endpoint) => {
  // Prefer an explicit override via REACT_APP_API_URL (useful for testing against
  // a remote backend). Otherwise default to a relative `/api` URL so the CRA
  // dev server proxy (`src/setupProxy.js`) can intercept requests during
  // development. Avoid hard-coding localhost:3001 here because that bypasses
  // the proxy and prevents dev-time cookie forwarding.
  const serverUrl = process.env.REACT_APP_API_URL || '/api';
  const prefix = endpoint.split("-")[0];
  //console.log("getApiUrl called with endpoint:", endpoint, "=> serverUrl:", serverUrl, "prefix:", prefix);
  return `${serverUrl}/${prefix}/${endpoint}`;
};

const getProviderApiUrl = (provider, endpoint) => {
  // Same logic for provider URLs: default to relative `/api` so the dev proxy
  // can forward requests. Override with REACT_APP_API_URL when needed.
  const serverUrl = process.env.REACT_APP_API_URL || '/api';
  // Map provider aliases to their actual service names
  if (provider === "claude") {
    provider = "anthropic";
  } else if (provider === "openai") {
    provider = "openai";
  } else if (provider === "azure-openai" || provider === "azure") {
    provider = "azure";
  }

  return `${serverUrl}/${provider}/${provider}-${endpoint}`;
};

const providerOrder = ["openai", "azure", "anthropic", "cohere"];

export { getApiUrl, getProviderApiUrl, providerOrder };
