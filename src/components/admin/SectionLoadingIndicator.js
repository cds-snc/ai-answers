import React from 'react';

// Small, purely visual "still loading" indicator for one section of a
// multi-fetch dashboard (MetricsDashboard.js/TechnicalMetricsDashboard.js's
// SectionWrapper). Deliberately NOT a StatusMessage/live region: up to 7 of
// these can mount at the same instant when Apply is clicked, and each being
// its own role="status" would flood screen readers with redundant
// "Loading..." announcements (WAI-ARIA APG's live-region guidance warns
// against exactly this - prefer one consolidated announcement over several
// simultaneous ones for what is, to the user, a single operation). The one
// real announcement is LoadingOverlay (shown until the first section settles)
// followed by a single shared "metrics loaded" completion announcement -
// see MetricsDashboard.js/useTechnicalMetrics.js's hasAnySectionSettled.
// This is quieter chrome only: smaller text, smaller spinner, no box - not
// hidden from AT entirely (a screen reader browsing to it manually still
// reads accurate text), just not a live announcement.
//
// TODO (design review): shape is a placeholder - small inline text+spinner
// for now. Worth a design pass on whether each section should instead read
// as its own little contained overlay (dimming/covering just that section's
// content while it loads) rather than inline text beside the title -
// undecided, not a functional gap either way.
const SectionLoadingIndicator = ({ message }) => (
  <div className="section-loading-indicator">
    <div className="loading-animation loading-animation--small" aria-hidden="true"></div>
    <span>{message}</span>
  </div>
);

export default SectionLoadingIndicator;
