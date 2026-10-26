// Shared by SystemHealthMonitor (parses the setting to send alert emails) and
// SettingsService (validates the setting's format before it's saved) — pulled
// out to its own module rather than one importing from the other, since
// SystemHealthMonitor already imports SettingsService and the reverse would
// be circular.
export function parseRecipients(value) {
  return String(value || '')
    .split(';')
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}
