import React from 'react';
import { GcdsIcon } from '@gcds-core/components-react';

// Issue #1048: warns a signed-in partner/admin that a local scenario
// override is currently active, so an odd-looking answer during testing
// isn't mistaken for a live production bug. Visually mirrors the existing
// referring-url banner (same pill styling in chat.css) since both are
// "context about what's shaping this answer" banners.
//
// Informational only — no link back to the editor here. That link lives
// above the "how to submit" disclosure instead (ScenarioSubmitInstructions.js,
// styled to match this same pill), not duplicated in this always-visible
// top banner too.
//
// `t` is expected to already return a plain string (pass ChatInterface's
// `safeT`, not its raw `t`) — the raw translator can return an object here.
//
// Always mounted (never conditionally rendered null), even with nothing to
// show: the banner appearing or changing department needs to be a content
// *change* inside an already-present role="status" region, not a fresh DOM
// insertion with its text already in it — the exact "populated on
// insertion" failure mode StatusMessage.js's own doc comment warns about,
// which screen readers reliably miss. The empty state collapses visually to
// nothing (see .scenario-override-banner--empty in chat.css) while staying
// in the accessibility tree so a later change is still caught.
const ScenarioOverrideBanner = ({ activeOverride, t }) => {
  const hasContent = Boolean(activeOverride);

  return (
    <div
      className={`scenario-override-banner${hasContent ? '' : ' scenario-override-banner--empty'}`}
      role="status"
      aria-live="polite"
    >
      {activeOverride && (
        <span className="scenario-override-banner__text">
          {/* Decorative reinforcement of the text, not new information —
              hidden from AT so it isn't announced redundantly. Same
              info-circle GcdsIcon StatusMessage's own `variant="info"` box
              uses (design-system.md), for visual consistency with that box
              family even though this banner isn't a StatusMessage itself. */}
          <GcdsIcon name="info-circle" marginRight="50" aria-hidden="true" />
          {t('homepage.chat.scenarioOverride.banner').replace('{department}', () => activeOverride.departmentKey)}
        </span>
      )}
    </div>
  );
};

export default ScenarioOverrideBanner;
