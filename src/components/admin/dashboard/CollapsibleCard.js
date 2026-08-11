import React from 'react';

// Shared shell for a dashboard-card whose heading + optional subtext are
// always visible (not hidden behind the collapse) — a screen-reader or
// keyboard user gets the key stat/description without needing to expand
// anything. The <details> below reveals the actual chart/table content
// behind a small link-styled trigger, separate from the heading itself.
// `anchorId` (optional): put on a wrapper around the collapsed content
// (not on <details> itself) so a same-page `<a href="#anchorId">` elsewhere
// on the dashboard lands on real content that's hidden while closed — modern
// browsers auto-expand any ancestor <details> to reveal a fragment-navigation
// target, but only when the target is actually inside the hidden subtree.
// The wrapper also carries `.collapsible-card__anchor` for a `scroll-margin-top`
// (admin.css) — without it, the browser scrolls the anchor itself to the very
// top of the viewport, pushing the card's own heading/subtext/trigger (which
// sit above it, outside <details>) off-screen above the fold.
// `collapsible` (default true): pass false to skip the <details>/<summary>
// entirely and render the content directly, always visible — e.g. a short
// list (harmful chats under 3 rows) doesn't need an extra click to reveal
// something that short/scannable already.
const CollapsibleCard = ({ heading, subtext, triggerLabel, triggerClassName = '', detailsClassName = '', defaultOpen = false, anchorId = null, collapsible = true, children }) => (
  <div className="dashboard-card collapsible-card">
    <h3 className={`card-title${subtext ? ' card-title--has-subtitle' : ''}`}>{heading}</h3>
    {subtext && <p className="card-subtitle font-size-text-xsm-nr">{subtext}</p>}
    {collapsible ? (
      <details open={defaultOpen} className={`dashboard-collapse${detailsClassName ? ` ${detailsClassName}` : ''}`}>
        <summary className={`dashboard-collapse__summary${triggerClassName ? ` ${triggerClassName}` : ''}`}>{triggerLabel}</summary>
        {anchorId ? <div id={anchorId} className="collapsible-card__anchor">{children}</div> : children}
      </details>
    ) : (
      anchorId ? <div id={anchorId} className="collapsible-card__anchor">{children}</div> : children
    )}
  </div>
);

export default CollapsibleCard;
