import React from 'react';

// Shared shell for a dashboard-card whose heading + optional subtext are
// always visible (not hidden behind the collapse) — a screen-reader or
// keyboard user gets the key stat/description without needing to expand
// anything. The <details> below reveals the actual chart/table content
// behind a small link-styled trigger, separate from the heading itself.
const CollapsibleCard = ({ heading, subtext, triggerLabel, triggerClassName = '', defaultOpen = false, children }) => (
  <div className="dashboard-card collapsible-card">
    <h3 className={`card-title${subtext ? ' card-title--has-subtitle' : ''}`}>{heading}</h3>
    {subtext && <p className="card-subtitle font-size-text-xsm-nr">{subtext}</p>}
    <details open={defaultOpen} className="dashboard-collapse">
      <summary className={`dashboard-collapse__summary${triggerClassName ? ` ${triggerClassName}` : ''}`}>{triggerLabel}</summary>
      {children}
    </details>
  </div>
);

export default CollapsibleCard;
