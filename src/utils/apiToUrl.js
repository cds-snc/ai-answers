const getApiUrl = (endpoint) => {
  const serverUrl =
    process.env.NODE_ENV === "development" ? "http://127.0.0.1:3001" : "";
  return `${serverUrl}/api/${endpoint}`;
};

const getProviderApiUrl = (provider, endpoint) => {
  const serverUrl =
    process.env.NODE_ENV === "development" ? "http://127.0.0.1:3001" : "";
  // Map provider aliases to their actual service names
  if (provider === "claude") {
    provider = "anthropic";
  } else if (provider === "chatgpt") {
    provider = "openai";
  } else if (provider === "azure-openai" || provider === "azure") {
    provider = "azure";
  }

  return `${serverUrl}/api/${provider}-${endpoint}`;
};

const providerOrder = ["openai", "azure", "anthropic", "cohere"];

export { getApiUrl, getProviderApiUrl, providerOrder };
