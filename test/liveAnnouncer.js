import { expect } from 'vitest';
import { waitFor } from '@testing-library/react';
import { getAnnouncedText, getAnnouncedTexts } from '../src/utils/liveAnnouncer.js';

// Waits for `text` to land in the shared live announcer
// (src/utils/liveAnnouncer.js) — 'polite' (role="status") or 'assertive'
// (role="alert"). Announcements are written a tick after they're requested,
// so a synchronous read right after the trigger sees nothing. Several
// announcements can be present at once (each has its own node); `exact`
// means one of them equals `text`, otherwise any of them contains it.
// Returns the full announced text (one line per announcement) for any
// further assertion.
//
// Use this, not `findByRole('alert')`, to assert an outcome was announced:
// StatusMessage/LoadingOverlay boxes aren't live regions themselves, so the
// role query only ever finds the site-wide regions — and finds them empty
// if it runs too early.
export async function waitForAnnouncement(text, kind = 'polite', { exact = false } = {}) {
  // Announcements are spaced out (liveAnnouncer.js's GAP_MS) and a
  // skippable one waits before it's spoken, so a few queued messages can
  // take longer than waitFor's default 1s.
  await waitFor(() => {
    if (exact) expect(getAnnouncedTexts(kind)).toContain(text);
    else expect(getAnnouncedText(kind)).toContain(text);
  }, { timeout: 4000 });
  return getAnnouncedText(kind);
}
