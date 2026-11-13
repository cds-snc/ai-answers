// Settings history page (src/pages/SettingsPage.js): how an audit row's
// action and details are shown. Actions come from SettingsAuditService
// callers on the server.

const ACTION_LABEL_KEYS = {
  'setting.updated': 'settings.auditHistory.actions.settingUpdated',
  'settings.cache_refreshed': 'settings.auditHistory.actions.cacheRefreshed',
  'download_web_page.cache_cleared': 'settings.auditHistory.actions.downloadWebPageCacheCleared',
  'search_context.cache_cleared': 'settings.auditHistory.actions.searchCacheCleared',
  'database.exported': 'settings.auditHistory.actions.databaseExported',
  'database.retired_fields_removed': 'settings.auditHistory.actions.retiredFieldsRemoved',
  'database.retired_fields_removal_failed': 'settings.auditHistory.actions.retiredFieldsRemovalFailed',
};

// Locale key for a known action, or null: the page then shows the action as
// stored, rather than calling it a setting change.
export function auditActionLabelKey(action) {
  return ACTION_LABEL_KEYS[action] || null;
}

// An action row has no setting value, only metadata. Shown as "key: value"
// pairs, like the Setting column shows raw setting keys. Empty values are left out.
export function formatAuditMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const parts = Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  return parts.length ? parts.join(', ') : null;
}
