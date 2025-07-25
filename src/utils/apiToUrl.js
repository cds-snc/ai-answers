const getApiUrl = (endpoint) => {
  const serverUrl =
    process.env.REACT_APP_API_URL ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:3001/api" : "/api");
  const prefix = endpoint.split("-")[0];
  console.log("getApiUrl called with endpoint:", endpoint, "=> serverUrl:", serverUrl, "prefix:", prefix);
  return `${serverUrl}/${prefix}/${endpoint}`;
};

const getProviderApiUrl = (provider, endpoint) => {
  const serverUrl =
    process.env.REACT_APP_API_URL ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:3001/api" : "/api");
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
