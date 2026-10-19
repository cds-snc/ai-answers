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

const whenReady = async (tag, el) => {
  await customElements.whenDefined(tag);
  if (typeof el.componentOnReady === 'function') await el.componentOnReady();
};

export const useLangToggleLang = (currentLang) => {
  useEffect(() => {
    let cancelled = false;
    const linkLang = currentLang === 'fr' ? 'en' : 'fr';

    const apply = async () => {
      const header = document.querySelector('gcds-header');
      if (!header) return;
      await whenReady('gcds-header', header);
      const toggle = header.shadowRoot?.querySelector('gcds-lang-toggle');
      if (toggle) await whenReady('gcds-lang-toggle', toggle);
      const link = toggle?.shadowRoot?.querySelector('gcds-link');
      if (cancelled) return;
      if (!link) {
        // GC DS changed the header's structure - this workaround needs updating.
        console.warn('useLangToggleLang: language link not found in gcds-header');
        return;
      }
      link.setAttribute('lang', linkLang);
    };

    apply().catch((err) => console.warn('useLangToggleLang:', err));
    return () => {
      cancelled = true;
    };
  }, [currentLang]);
};
