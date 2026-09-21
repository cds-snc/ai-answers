// Shared by provider dropdowns, settings validation, and public-chat
// resolution so the accepted values cannot drift between client and server.
export const SEARCH_PROVIDERS = [
  { value: 'google', labelKey: 'homepage.chat.options.searchSelection.google' },
  { value: 'canadaca', labelKey: 'homepage.chat.options.searchSelection.canadaca' },
];

export const SEARCH_PROVIDER_VALUES = SEARCH_PROVIDERS.map(({ value }) => value);
export const DEFAULT_SEARCH_PROVIDER = 'google';

export const resolveSearchProvider = (value, fallback = DEFAULT_SEARCH_PROVIDER) => {
  if (SEARCH_PROVIDER_VALUES.includes(value)) return value;
  return SEARCH_PROVIDER_VALUES.includes(fallback) ? fallback : DEFAULT_SEARCH_PROVIDER;
};
