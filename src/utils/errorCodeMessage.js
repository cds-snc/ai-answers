// Maps a backend-supplied error `code` (a small, stable enum — never free
// text) to a translated message via a local code->locale-key table, with a
// generic fallback for an unrecognized or missing code. This is the "map a
// stable code through a local object to a t() key" half of the two safe
// alternatives to showing a raw err.message — see
// docs/coding-agent-docs/status-and-error-messaging.md.
//
// Extracted after ResetCompletePage.js and BatchUpload.js independently
// hand-rolled the same shape (a code->key object literal, then t(key) with
// a fallback) slightly differently each time — the same kind of drift this
// codebase keeps hitting whenever a shared shape gets copy-pasted instead
// of extracted the first time.
export const resolveErrorMessage = (code, codeMap, fallbackKey, t) => {
  const key = code && codeMap[code];
  return key ? t(key) : t(fallbackKey);
};
