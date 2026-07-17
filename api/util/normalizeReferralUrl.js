import { SELF_REFERRAL_LABELS } from './chat-filters.js';

// Normalize a stored referringUrl to a stable "page" key so the top-referrals
// list counts the same page once regardless of cosmetic variation:
//   - strip the protocol (some referrers are stored without one)
//   - strip a leading "www."
//   - drop the query string (?...) and fragment (#...)
//   - drop trailing slash(es)
//   - lowercase the host (paths are left case-sensitive, as servers may be)
//
// Returns null for values that should not appear in the list at all: blanks and
// AI Answers' own self-referrals (in-app language switches / navigation between
// answers — not a partner site page). Self-referral host labels are the shared
// SELF_REFERRAL_LABELS from chat-filters.js so this stays in sync with the
// dashboard's userType / referred-public logic.
export function normalizeReferralUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''); // strip protocol
  s = s.replace(/^www\./i, '');                  // strip leading www.
  s = s.split('#')[0].split('?')[0];             // drop fragment + query
  s = s.replace(/\/+$/, '');                      // drop trailing slash(es)
  if (!s) return null;

  const slash = s.indexOf('/');
  const host = (slash === -1 ? s : s.slice(0, slash)).toLowerCase();
  const path = slash === -1 ? '' : s.slice(slash);
  if (!host) return null;

  const hostLabel = host.split('.')[0];
  if (SELF_REFERRAL_LABELS.includes(hostLabel)) return null;

  return host + path;
}
