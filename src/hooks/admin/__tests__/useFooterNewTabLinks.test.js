/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useFooterNewTabLinks, { openFooterLinksInNewTab } from '../useFooterNewTabLinks.js';

// Stand-in for GcdsFooter: its sub links live as gcds-link elements in a shadow root.
const makeFooter = (hrefs) => {
  const footer = document.createElement('div');
  const shadow = footer.attachShadow({ mode: 'open' });
  hrefs.forEach((href) => {
    const link = document.createElement('gcds-link');
    link.href = href; // Stencil sets href as a property, not an attribute
    shadow.appendChild(link);
  });
  return footer;
};
const targets = (footer) => [...footer.shadowRoot.querySelectorAll('gcds-link')].map((l) => l.target);

describe('openFooterLinksInNewTab', () => {
  it('sets target="_blank" only on the matching links', () => {
    const footer = makeFooter(['/en/about', '/en/admin#how-to-guides', 'mailto:x@y.ca']);
    openFooterLinksInNewTab(footer, ['/en/admin#how-to-guides']);
    expect(targets(footer)).toEqual([undefined, '_blank', undefined]);
  });

  it('does nothing when the footer has no shadow root yet', () => {
    expect(() => openFooterLinksInNewTab(document.createElement('div'), ['/x'])).not.toThrow();
    expect(() => openFooterLinksInNewTab(null, ['/x'])).not.toThrow();
  });
});

describe('useFooterNewTabLinks', () => {
  it('opens the link in a new tab once the footer draws it after mount', async () => {
    const footer = makeFooter([]);
    renderHook(() => useFooterNewTabLinks({ current: footer }, ['/fr/admin#how-to-guides'], true));
    const link = document.createElement('gcds-link');
    link.href = '/fr/admin#how-to-guides';
    footer.shadowRoot.appendChild(link);
    await waitFor(() => expect(targets(footer)).toEqual(['_blank']));
  });

  it('leaves the footer alone when disabled (public footer)', async () => {
    const footer = makeFooter(['/en/admin#how-to-guides']);
    renderHook(() => useFooterNewTabLinks({ current: footer }, ['/en/admin#how-to-guides'], false));
    await Promise.resolve();
    expect(targets(footer)).toEqual([undefined]);
  });
});
