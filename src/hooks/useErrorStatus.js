import React from 'react';
import StatusMessage from '../components/admin/StatusMessage.js';

// Shared { text } (success) | { prefix, suffix, detail, isError } (error)
// status shape, and the two small helpers that build/render it — extracted
// after DatabasePage.js (~13 call sites) and SettingsPage.js independently
// hand-rolled the same pattern. buildErrorStatus splits the translated
// template around {error} once; the raw detail (error.message) is never
// shown untagged - see AGENTS.md's "Never show a raw err.message" rule.
//
// Takes the raw error object (not error.message) so the
// `error.message || String(error)` fallback lives here once, not repeated
// per call site - a caught non-Error value or an Error with no .message
// would otherwise resolve detail to undefined, which renderStatusMessage's
// `!== undefined` check reads as "render status.text instead" - but this
// shape never sets .text, so StatusMessage's own empty-message guard would
// return null and the whole error box would silently vanish. Found by code
// review on DatabasePage.js, which was missing it; SettingsPage.js already
// had it.
//
// `t` is taken once here rather than passed to each call, so callers don't
// repeat useTranslations() plumbing through this - same shape as
// useAuthOutcomeMessages taking its dependencies once at the top.
export const useErrorStatus = (t) => {
  const buildErrorStatus = (key, error, otherPlaceholders = {}) => {
    let template = t(key);
    for (const [name, value] of Object.entries(otherPlaceholders)) {
      template = template.replace(`{${name}}`, () => value);
    }
    // split('{error}') assumes the placeholder appears exactly once — a
    // locale string with {error} twice would split into >2 pieces and this
    // destructure silently drops everything after the second occurrence.
    // No current key repeats it; if a future one does, this needs a
    // template.replace-based split instead.
    const [prefix, suffix] = template.split('{error}');
    const detail = error?.message || String(error);
    return { prefix, suffix, detail, isError: true };
  };

  // successVariant: DatabasePage.js's operations are completed mutations
  // ('success', the default); SettingsPage.js's cache refresh is a neutral
  // confirmation, not a mutation ('info') - a real semantic difference
  // between the two existing callers, not just inconsistency to paper over.
  const renderStatusMessage = (status, successVariant = 'success') => (
    <StatusMessage variant={status ? (status.isError ? 'error' : successVariant) : undefined}>
      {status && (
        status.detail !== undefined
          ? <>{status.prefix}<code lang="en">{status.detail}</code>{status.suffix}</>
          : status.text
      )}
    </StatusMessage>
  );

  return { buildErrorStatus, renderStatusMessage };
};
