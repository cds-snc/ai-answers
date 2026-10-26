// SettingsAuditService truncates stored values at 2000 characters, so a single
// audit cell can still hold far more text than a table row can show — the
// redaction word lists and alert-recipient lists are the realistic offenders.
// Anything longer than this preview collapses behind a disclosure so the row
// stays readable, rather than one entry stretching the whole table.
//
// This used to also export a React component rendering that disclosure, but
// the settings history table (SettingsPage.js) now renders through
// ExperimentalServerDataTable, whose columns build raw HTML strings via
// renderAuditValueHtml rather than JSX — this constant is the only piece
// still shared between the two.
export const AUDIT_VALUE_PREVIEW_LENGTH = 120;
