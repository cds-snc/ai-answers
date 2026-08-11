import { useEffect } from 'react';

/**
 * Works around a GcdsButton (@gcds-core/components) timing bug: the
 * component copies aria-* attributes from its host element into its
 * shadow-DOM native <button>/<a> inside its own click handler
 * (inheritAttributes, called from handleClick), which runs before React's
 * batched state update — triggered by that same click — commits the new
 * aria-pressed value onto the host. The shadow element's aria-pressed is
 * therefore always one click behind whatever the visible label says, so
 * screen readers announce the wrong toggle state on every click.
 *
 * This re-applies the current value directly to the shadow DOM's native
 * button after every render that changes it, independent of GcdsButton's
 * own (stale) attribute-inheritance timing.
 *
 * @param {import('react').RefObject} buttonRef ref on the <GcdsButton>
 * @param {boolean} pressed current aria-pressed value
 */
export function useAriaPressedSync(buttonRef, pressed) {
  useEffect(() => {
    const shadowButton = buttonRef.current?.shadowRoot?.querySelector('button, a');
    shadowButton?.setAttribute('aria-pressed', String(pressed));
  }, [buttonRef, pressed]);
}
