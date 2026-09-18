// Shared by provider dropdowns, settings validation, and public-chat
// resolution so the accepted values cannot drift between client and server.
export const SEARCH_PROVIDERS = [
  { value: 'google' },
  { value: 'canadaca' },
];

export const SEARCH_PROVIDER_VALUES = SEARCH_PROVIDERS.map(({ value }) => value);
export const DEFAULT_SEARCH_PROVIDER = 'google';
