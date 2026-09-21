import React, { useCallback, useRef } from 'react';
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
  // Stable across renders (as long as t is — see useTranslations.js) so
  // callers can safely put buildErrorStatus/renderStatusMessage in their own
  // useCallback/useEffect deps instead of having to omit them.
  const buildErrorStatus = useCallback((key, error, otherPlaceholders = {}) => {
    let template = t(key);
    for (const [name, value] of Object.entries(otherPlaceholders)) {
      template = template.replace(`{${name}}`, () => value);
    }
    // split('{error}') assumes the placeholder appears exactly once — a
    // locale string with {error} twice would split into >2 pieces and this
    // destructure silently drops everything after the second occurrence.
    // No current key repeats it; if a future one does, this needs a
    // template.replace-based split instead.
    const parts = template.split('{error}');
    // A stale {message}-style key silently drops the separator (prefix ===
    // template, suffix === undefined) instead of erroring — loud in dev
    // rather than thrown, since a missing placeholder shouldn't take down
    // the whole status box.
    if (parts.length === 1 && !import.meta.env.PROD) {
      console.error(`useErrorStatus: locale key "${key}" has no {error} placeholder — buildErrorStatus can't split it.`);
    }
    const [prefix, suffix] = parts;
    const detail = error?.message || String(error);
    return { prefix, suffix, detail, isError: true };
  }, [t]);

  // Same as buildErrorStatus, but `detail` is pre-wrapped in <code lang="en">
  // — for callers that don't render through renderStatusMessage
  // (DeleteChatSection.js, DeleteExpertEval.js, VectorPage.js's
  // renderDocdb8Error). Never pass this to renderStatusMessage too — it
  // wraps `detail` itself, nesting the tag twice. DeleteByChatIdSection.js's
  // own nonce state is the reason this can't just be a StatusMessage.js
  // consumer — see the TODO above useRepeatableStatus() there.
  const wrapErrorDetail = useCallback((key, error, otherPlaceholders = {}) => {
    const built = buildErrorStatus(key, error, otherPlaceholders);
    return { ...built, detail: <code lang="en">{built.detail}</code> };
  }, [buildErrorStatus]);

  // Nonce per call-site `key`, keyed by status object identity — a fresh
  // object (even with identical text) is a new outcome.
  const nonceRef = useRef(new Map());

  // successVariant: DatabasePage.js's operations are completed mutations
  // ('success', the default); SettingsPage.js's cache refresh is a neutral
  // confirmation, not a mutation ('info') - a real semantic difference
  // between the two existing callers, not just inconsistency to paper over.
  //
  // `key` distinguishes sibling boxes on the same hook instance (DatabasePage.js
  // has ~13). No useCallback — this plain Set must be fresh every render so
  // the collision check below can catch two calls sharing a key.
  const seenKeysThisRender = new Set();
  const renderStatusMessage = (status, successVariant = 'success', key = 'default') => {
    if (seenKeysThisRender.has(key)) {
      console.error(`useErrorStatus: renderStatusMessage called more than once with key "${key}" in the same render — pass a distinct key per call site.`);
    }
    seenKeysThisRender.add(key);

    const cached = nonceRef.current.get(key);
    const unchanged = cached && cached.status === status;
    const nonce = unchanged ? cached.nonce : (cached?.nonce ?? 0) + 1;
    if (!unchanged) nonceRef.current.set(key, { status, nonce });

    return (
      <StatusMessage variant={status ? (status.isError ? 'error' : successVariant) : undefined} nonce={nonce}>
        {status && (
          status.detail !== undefined
            ? <>{status.prefix}<code lang="en">{status.detail}</code>{status.suffix}</>
            : status.text
        )}
      </StatusMessage>
    );
  };

  return { buildErrorStatus, wrapErrorDetail, renderStatusMessage };
};
