// The one place screen-reader announcements come from.
//
// Screen readers only reliably announce text that changes inside a node
// that was already in the DOM — a role="status" element inserted with its
// text already in it is dropped by VoiceOver. So visible boxes
// (StatusMessage, LoadingOverlay) are plain markup and push their text here
// via useAnnounceOnChange; an outcome with nothing visible calls announce().
//
// This module owns two always-present, visually hidden regions on
// document.body — polite (role="status") and assertive (role="alert").
// Each announcement is appended to its region as a new child element, one
// at a time from a queue with a minimum gap between them: several
// additions landing in the same instant get read newest-first by
// Chrome + VoiceOver, so "Loading" then "No data found" came out
// backwards. Spacing them out keeps the order. An identical repeat is its
// own addition rather than a no-op text update. aria-atomic="false" so
// only the new child is read, not the whole region again. Module-level
// rather than React context so nothing needs a provider.
//
// `skippable` marks an in-progress message ("Loading…") that's only worth
// saying if it's still true a moment later: it waits a short grace before
// being spoken, and is dropped if anything newer is queued first — so a
// fast load reads just its result, a slow one reads "Loading" then the
// result.
//
// Regions must exist before the first announcement — src/index.js calls
// ensureLiveAnnouncer() before React renders. On a fresh page load Chrome
// takes a moment to attach new nodes to the accessibility tree and
// VoiceOver is busy reading the page, so the queue holds off for a moment
// after that.
//
// Announcements remove themselves after a while so stale text ("Loading…")
// isn't left in the accessibility tree for a screen-reader user browsing
// by cursor to stumble over.

const REGIONS = {
  polite: { id: 'live-announcer-polite', role: 'status', live: 'polite' },
  assertive: { id: 'live-announcer-assertive', role: 'alert', live: 'assertive' },
};

// Hold-off after the regions are first created on page load.
const READY_DELAY_MS = 1500;
// Minimum time between two announcements in the same region. Per region on
// purpose: a polite and an assertive message can still land in the same
// instant, and then the assertive one is read first (or alone) — that's
// the intended priority, not a race to fix.
const GAP_MS = 400;
// How long a skippable message waits before being spoken.
const SKIPPABLE_GRACE_MS = 500;
const CLEAR_AFTER_MS = 10000;

let readyAt = 0;
const state = {
  polite: { queue: [], lastEmitAt: 0, timer: null },
  assertive: { queue: [], lastEmitAt: 0, timer: null },
};
const removals = new Set();

function ensureRegion(kind) {
  const { id, role, live } = REGIONS[kind];
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement('div');
    node.id = id;
    node.setAttribute('role', role);
    node.setAttribute('aria-live', live);
    node.setAttribute('aria-atomic', 'false');
    // Lets tests tell these apart from page content (test/vitest-hooks.js
    // excludes them from *ByText queries; getAnnouncedText reads them).
    node.setAttribute('data-live-announcer', kind);
    node.className = 'sr-only';
    document.body.appendChild(node);
  }
  return node;
}

// Call once, before React renders (src/index.js).
export function ensureLiveAnnouncer() {
  if (typeof document === 'undefined') return;
  for (const kind of Object.keys(REGIONS)) ensureRegion(kind);
  readyAt = Date.now() + READY_DELAY_MS;
}

function emit(kind, message) {
  const item = document.createElement('div');
  item.textContent = message;
  ensureRegion(kind).appendChild(item);
  const timer = setTimeout(() => {
    removals.delete(timer);
    item.remove();
  }, CLEAR_AFTER_MS);
  removals.add(timer);
}

function pump(kind) {
  const s = state[kind];
  clearTimeout(s.timer);
  s.timer = null;
  const next = s.queue[0];
  if (!next) return;
  const now = Date.now();
  const wait = Math.max(
    readyAt - now,
    s.lastEmitAt + GAP_MS - now,
    next.skippable ? next.queuedAt + SKIPPABLE_GRACE_MS - now : 0,
  );
  if (wait > 0) {
    s.timer = setTimeout(() => pump(kind), wait);
    return;
  }
  s.queue.shift();
  s.lastEmitAt = now;
  emit(kind, next.message);
  pump(kind);
}

export function announce(text, { assertive = false, skippable = false } = {}) {
  if (typeof document === 'undefined') return;
  const message = text == null ? '' : String(text).trim();
  if (!message) return;
  const kind = assertive ? 'assertive' : 'polite';
  // Anything newer supersedes a skippable message that hasn't been spoken —
  // in either queue: an assertive "Results loaded." must also drop a polite
  // "Loading…" still waiting out its grace, or it's read afterwards.
  for (const other of Object.keys(REGIONS)) {
    state[other].queue = state[other].queue.filter((item) => !item.skippable);
  }
  const s = state[kind];
  s.queue.push({ message, skippable, queuedAt: Date.now() });
  pump(kind);
}

// Test helper: everything currently in `kind`'s region, oldest first.
export function getAnnouncedTexts(kind = 'polite') {
  if (typeof document === 'undefined') return [];
  const region = document.getElementById(REGIONS[kind].id);
  return region ? Array.from(region.children, (el) => el.textContent) : [];
}

export function getAnnouncedText(kind = 'polite') {
  return getAnnouncedTexts(kind).join('\n');
}

// Test helper: drop queues, timers and both regions, so one test's
// announcement can't be read by the next (test/vitest-hooks.js calls this
// after every test).
export function resetLiveAnnouncer() {
  readyAt = 0;
  removals.forEach((t) => clearTimeout(t));
  removals.clear();
  for (const kind of Object.keys(REGIONS)) {
    const s = state[kind];
    clearTimeout(s.timer);
    s.timer = null;
    s.queue = [];
    s.lastEmitAt = 0;
    if (typeof document !== 'undefined') document.getElementById(REGIONS[kind].id)?.remove();
  }
}
