import { useEffect, useRef } from 'react';
import { announce } from '../utils/liveAnnouncer.js';

// Announces an element's visible text through the shared live announcer
// (src/utils/liveAnnouncer.js) whenever that text changes — or, with an
// optional `nonce`, whenever the caller bumps it (for a repeat of the exact
// same outcome, e.g. saving twice in a row, which is otherwise not a
// "change"). Reads the rendered DOM text rather than a `message` prop so
// callers that render richer `children` (a <code> detail, two paragraphs)
// get announced too, without each having to flatten their content to a
// string.
//
// Runs after every render (no dep array) and de-dupes against the last
// announced text+nonce, so a parent re-rendering with unchanged content is
// a no-op. When the element unmounts (ref goes null) the memo is reset, so
// the same text appearing again later is announced again.
//
// `enabled: false` is for a message that focus is about to be moved onto
// (see ScenarioOverridesPage's save outcome): focus landing on it already
// reads it, and a live announcement on top is a double read.
//
// `skippable: true` is for an in-progress state ("Loading…"): it's only
// spoken if still true a moment later, and dropped if the result arrives
// first — see liveAnnouncer.js.
export function useAnnounceOnChange(nodeRef, { enabled = true, assertive = false, skippable = false, nonce } = {}) {
  const lastRef = useRef(null);

  useEffect(() => {
    const text = nodeRef.current?.textContent?.trim() ?? '';
    if (!text) {
      lastRef.current = null;
      return;
    }
    if (!enabled) return;
    const key = `${nonce ?? ''} ${text}`;
    if (key === lastRef.current) return;
    lastRef.current = key;
    announce(text, { assertive, skippable });
  });
}
