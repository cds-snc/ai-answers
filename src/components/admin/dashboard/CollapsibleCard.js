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
const CollapsibleCard = ({ heading, subtext, triggerLabel, triggerClassName = '', detailsClassName = '', defaultOpen = false, anchorId = null, children }) => (
  <div className="dashboard-card collapsible-card">
    <h3 className={`card-title${subtext ? ' card-title--has-subtitle' : ''}`}>{heading}</h3>
    {subtext && <p className="card-subtitle font-size-text-xsm-nr">{subtext}</p>}
    <details open={defaultOpen} className={`dashboard-collapse${detailsClassName ? ` ${detailsClassName}` : ''}`}>
      <summary className={`dashboard-collapse__summary${triggerClassName ? ` ${triggerClassName}` : ''}`}>{triggerLabel}</summary>
      {anchorId ? <div id={anchorId} className="collapsible-card__anchor">{children}</div> : children}
    </details>
  </div>
);

export default CollapsibleCard;
