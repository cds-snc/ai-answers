// src/hooks/useLangToggleLang.js
//
// Workaround for a GC DS bug: gcds-lang-toggle passes `lang` to its
// gcds-link, but gcds-link declares `lang` as an internal @State. In the
// custom-elements build that @gcds-core/components-react uses, that state
// takes over the element's `lang`, so the attribute never reaches the DOM.
// "Français"/"English" then has no lang, and screen readers read it in the
// page's language. This sets the attribute ourselves.
// Remove once GC DS fixes it (still present in @gcds-core/components 1.6.0).
import { useEffect } from 'react';

const WATCH = { childList: true, subtree: true };

export const useLangToggleLang = (currentLang) => {
  useEffect(() => {
    const header = document.querySelector('gcds-header');
    if (!header) return undefined;
    let cancelled = false;
    const linkLang = currentLang === 'fr' ? 'en' : 'fr';

    // This build has no componentOnReady to wait on, each element renders on
    // its own schedule, and the React wrapper sets langHref after
    // gcds-header's first render - so the toggle and its link can appear (or
    // be re-created) at any point. Watch both shadow roots and re-apply.
    // Observing a root that's already observed just replaces its options.
    const apply = () => {
      const toggle = header.shadowRoot?.querySelector('gcds-lang-toggle');
      if (!toggle?.shadowRoot) return;
      observer.observe(toggle.shadowRoot, WATCH);
      const link = toggle.shadowRoot.querySelector('gcds-link');
      if (link && link.getAttribute('lang') !== linkLang) {
        link.setAttribute('lang', linkLang);
      }
    };
    const observer = new MutationObserver(apply);

    customElements.whenDefined('gcds-header').then(() => {
      if (cancelled || !header.shadowRoot) return;
      observer.observe(header.shadowRoot, WATCH);
      apply();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [currentLang]);
};
