import React, { useRef } from 'react';
import { useAnnounceOnChange } from '../../hooks/useAnnounceOnChange.js';

// Full-page/section "still loading" overlay — the backdrop + centered
// spinner+text box previously copy-pasted across PartnerDashboard.js,
// PublicDashboard.js, ChatLogsDashboard.js, EvalDashboardPage.js,
// AutoEvalDashboardPage.js, and ChatDashboardPage.js. Same markup and same
// CSS classes as before (.loading-overlay / .loading-overlay-content in
// admin.css) — just defined once now instead of six times.
//
// Announced through the shared announcer (src/utils/liveAnnouncer.js), not
// by being a live region itself: this is always conditionally rendered
// (`{loading && <LoadingOverlay/>}`), so as its own role="status" it was an
// element inserted with its text already in it — which VoiceOver drops.
// Nobody heard any dashboard's loading state. useAnnounceOnChange reads the
// rendered text so a JSX `message` (ChatLogsDashboard's two-key export
// message) works the same as a string.
//
// Not part of StatusMessage.js — unlike its `loading` state (general-purpose,
// any page might need an inline "still working" message), this is for when
// there's genuinely nothing else actionable on the page until the operation
// finishes (every other control is already disabled for the same duration
// anyway) — most often a dashboard's filter-driven fetch reload, but not
// only that; see ScenarioOverridesPage.js's department-load and Save/Revert
// overlays for a non-dashboard example of the same test. Narrow enough to
// earn its own file rather than a prop on a component everything else uses
// too.
const LoadingOverlay = ({ message }) => {
  const textRef = useRef(null);
  // skippable: a fast load reads just its result, not "Loading" too.
  useAnnounceOnChange(textRef, { skippable: true });
  return (
    <div className="loading-overlay">
      <div className="loading-overlay-content">
        <div className="loading-animation" aria-hidden="true"></div>
        {/* .loading-overlay-content span is styled directly in admin.css
            (font-size/weight/color) — keep the message wrapped in a span,
            not a bare text node, or it silently loses that styling. */}
        <span ref={textRef}>{message}</span>
      </div>
    </div>
  );
};

export default LoadingOverlay;
