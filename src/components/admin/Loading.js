import React from 'react';

// Two small "still working" indicators, both built on the same spinner
// (.loading-animation, global.css). Kept as two separate components rather
// than one with a mode flag — LoadingStatus and LoadingOverlay render
// genuinely different shapes (inline vs. full-page), and merging them
// behind a flag is exactly the pattern that caused a real bug when this was
// StatusMessage's `loading` sub-type: two independent visual modes whose
// block-content requirement had to be reconciled by hand in three separate
// places, and one of those three was missed. Splitting rather than
// re-flagging keeps that bug structurally out of reach. Kept in one file
// (rather than three, with the spinner markup as its own shared component)
// because each one's spinner+text JSX is two lines, used by exactly one
// consumer each — not enough duplication to earn a third file.

// Inline "still working" text within page flow, in its own role="status"
// live region. Was StatusMessage's `loading` sub-type — see the scope note
// at the top of StatusMessage.js for why it moved out.
export const LoadingStatus = ({ message, id, className }) => (
  <div
    role="status"
    aria-live="polite"
    id={id}
    className={['status-message--loading', className].filter(Boolean).join(' ')}
  >
    <div className="loading-animation" aria-hidden="true"></div>
    {message}
  </div>
);

// Full-page/section "still loading" overlay — the backdrop + centered
// spinner+text box previously copy-pasted across PartnerDashboard.js,
// PublicDashboard.js, ChatLogsDashboard.js, EvalDashboardPage.js,
// AutoEvalDashboardPage.js, and ChatDashboardPage.js. Same markup and same
// CSS classes as before (.loading-overlay / .loading-overlay-content in
// admin.css) — just defined once now instead of six times.
export const LoadingOverlay = ({ message }) => (
  <div className="loading-overlay" role="status" aria-live="polite">
    <div className="loading-overlay-content">
      <div className="loading-animation" aria-hidden="true"></div>
      {/* .loading-overlay-content span is styled directly in admin.css
          (font-size/weight/color) — keep the message wrapped in a span,
          not a bare text node, or it silently loses that styling. */}
      <span>{message}</span>
    </div>
  </div>
);
