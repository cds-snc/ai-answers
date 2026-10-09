import { useEffect } from 'react';

// WORKAROUND: GcdsFooter's subLinks only take { label: href } and render each
// as a plain gcds-link, so there's no way to open one in a new tab. Reach into
// the footer's shadow DOM and set target="_blank" on the matching gcds-link,
// which then adds the external icon and its translated label itself.
export function openFooterLinksInNewTab(footerEl, hrefs) {
  const links = footerEl?.shadowRoot?.querySelectorAll('gcds-link') || [];
  links.forEach((link) => {
    if (hrefs.includes(link.getAttribute('href') ?? link.href) && link.target !== '_blank') {
      link.target = '_blank';
    }
  });
}

export default function useFooterNewTabLinks(footerRef, hrefs, enabled) {
  const hrefKey = hrefs.join('|');
  useEffect(() => {
    const footerEl = footerRef.current;
    if (!enabled || !footerEl) return undefined;
    const apply = () => openFooterLinksInNewTab(footerEl, hrefKey.split('|'));
    // The footer draws its links after mount and redraws them on prop
    // changes, so watch its shadow root rather than applying once.
    const observer = new MutationObserver(apply);
    if (footerEl.shadowRoot) observer.observe(footerEl.shadowRoot, { childList: true, subtree: true });
    apply();
    return () => observer.disconnect();
  }, [footerRef, hrefKey, enabled]);
}
