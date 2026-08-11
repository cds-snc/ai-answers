import React from 'react';

// SettingsAuditService truncates stored values at 2000 characters, so a single
// audit cell can still hold far more text than a table row can show — the
// redaction word lists and alert-recipient lists are the realistic offenders.
// Anything longer than this preview collapses behind a disclosure so the row
// stays readable, rather than one entry stretching the whole table.
export const AUDIT_VALUE_PREVIEW_LENGTH = 120;

const SettingsAuditValue = ({ value, emptyLabel }) => {
  // Only a genuinely absent value is "not applicable". An empty string is a
  // real recorded value — settings in EMPTY_ALLOWED_SETTINGS can be cleared —
  // and has to stay distinguishable from one that was never set.
  if (value === null || value === undefined) return emptyLabel;

  const text = String(value);

  if (text.length <= AUDIT_VALUE_PREVIEW_LENGTH) {
    return <span className="settings-audit-value">{text}</span>;
  }

  return (
    <details className="settings-audit-value settings-audit-value--long">
      <summary>{`${text.slice(0, AUDIT_VALUE_PREVIEW_LENGTH)}…`}</summary>
      <span>{text}</span>
    </details>
  );
};

export default SettingsAuditValue;
