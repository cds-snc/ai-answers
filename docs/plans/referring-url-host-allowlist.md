# Referring URL host allowlist for public users (AIA-006 follow-up)

Status: **planned**, not started. Follows the AIA-006 fix (`api/util/referring-url.js`).

## Problem

The AIA-006 fix makes `referringUrl` *safe to embed*:
- it must be http(s)
- `<`, `>`, quotes and whitespace are encoded, so it can't break out of `<referring-url>`
- the query string is dropped, and so is any anchor that is not a plain section name (letters, digits, `_` `-` `.`, no run of 6+ digits)
- it's capped at 500 characters

It does not restrict *which hosts* are accepted. A signed-out visitor can still send a
`referringUrl` from any site, and its host and path reach three prompts:
- the context agent (`<referring-url>` tag)
- the answer agent (`<referring-url>` tag)
- query rewrite and program-action classify (`referringUrl` field)

The text arrives percent-encoded, but the model can still read it, e.g.
`https://evil.example/Ignore-previous-instructions-and…`. The prompts tell the model to
rely on this tag. The context agent is told to prioritize it.

## Proposal

Apply a host allowlist in `normalizeReferringUrl`'s caller at the entry point
(`api/chat/chat-graph-run.js`), based on who is asking:

| Requester | Allowed hosts |
|---|---|
| Signed out (public) | `canada.ca`, `gc.ca` and their subdomains; anything else → `''` |
| Signed-in admin / partner | Any http(s) host (unchanged — needed to test department matching against non-GC pages; see `src/utils/chat/referringUrl.js`) |

The admin batch runner (`ExperimentalBatchService`) is admin-only and keeps accepting any host.

## Implementation notes

- **Match on the parsed `URL.hostname`, never on the raw string.** The existing
  `REFERRED_PUBLIC_DOMAIN_REGEX` in `api/util/chat-filters.js` is substring-based. A URL
  like `https://evil.example/x.canada.ca/` matches it. It's fine for dashboard
  classification, but it's not a security check. Use
  `hostname === 'canada.ca' || hostname.endsWith('.canada.ca')` (same for `gc.ca`).
- Do the host check inside `normalizeReferringUrl`, as an option
  (e.g. `normalizeReferringUrl(raw, { gcOnly: true })`), so there is still one parse. The
  CanadaLogin portal match (`docs/plans/canadalogin-assistant.md`) must reuse this same
  parsed value.
- Decide the signed-in signal: `req.user` present (any role) vs. specific roles.
- Log a dropped non-GC referrer the same way as an invalid one: a warning with
  `rawLength` only, never the value.

## Trade-offs to decide

- **Metrics.** Public visitors arriving from Google, partner sites or other non-GC pages
  will no longer have a stored referrer. They then drop out of the top-referrals list
  (`api/metrics/metrics-referrals.js`, `normalizeReferralUrl`). "Referred public"
  classification already only counts GC hosts, so `userType` is unaffected. If non-GC
  referral counts matter, store the host alone (not the path) for metrics and send only
  allowlisted URLs to the model.
- **Excluded GC subdomains.** Decide whether internal/CDS subdomains that
  `REFERRED_PUBLIC_EXCLUSION_REGEX` excludes should also be blocked for public users, or
  only excluded from metrics as today.
- **Self-referrals.** AI Answers' own hosts (EN `ai-answers…`, FR `reponses-ia…`) are GC
  hosts and stay allowed. In-app language switches still arrive as referrers.

## Tests

- Unit tests:
  - public + non-GC host → `''`
  - public + `www.canada.ca` / `*.gc.ca` → kept
  - public + lookalike hosts → `''` (`canada.ca.evil.example`, `evilcanada.ca`, `evil.example/x.canada.ca/`)
  - admin + any host → kept
- `chat-graph-run.test.js`: signed-out request with a non-GC URL reaches the graph as `''`;
  signed-in admin request keeps it.
- Manual: as admin tester in Evaluation options, a non-GC URL still applies (e.g.
  `dosimeteraudit.org/benchmark`).
