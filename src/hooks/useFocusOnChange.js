import { useEffect, useRef } from 'react';

// Returns a ref to attach to the element that should receive focus whenever
// `condition` changes to a truthy value. Pass a counter (not just a boolean)
// when the same "active" state can be re-triggered repeatedly (e.g. a second
// failed submit) — a boolean re-set to `true` while already `true` is a no-op
// in React and won't re-fire the effect, so focus/announcement would be
// silently skipped on repeat triggers.
export const useFocusOnChange = (condition) => {
  const ref = useRef(null);

  useEffect(() => {
    if (condition) {
      ref.current?.focus();
    }
  }, [condition]);

  return ref;
};
