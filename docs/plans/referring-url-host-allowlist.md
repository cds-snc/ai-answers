# Referring URL host allowlist for public users (AIA-006 follow-up)

Status: **in progress**. The server check and the dashboard card have shipped (PR 1). The
client display change (PR 2) is still to do; see [Remaining work](#remaining-work-pr-2-client).
Follows the AIA-006 fix (#2003, `api/util/referring-url.js`) and the GC host rule (#2033, #2035,
`api/util/govHost.js`).

## Problem

The AIA-006 fix makes `referringUrl` *safe to embed*:
- it must be http(s)
- `<`, `>`, quotes and whitespace are encoded, so it can't break out of `<referring-url>`
- the query string is dropped, and so is any anchor that is not a plain section name
- it's capped at 500 characters

It did not restrict *which hosts* are accepted. A signed-out visitor could send a
`referringUrl` from any site, e.g. `https://evil.example/Ignore-previous-instructions…`, and
its host and path reached the context agent (which is told to prioritize it), the answer agent,
query rewrite and program-action classify. It was also stored on the interaction, and it skips
the redaction guardrail.

## Decisions (product owner)

1. Only **signed-out** visitors are restricted. Signed-in admins and partners keep any http(s)
   referrer. They need it to test department matching against non-GC pages (Evaluation
   options, admin batch CSVs).
2. For a signed-out visitor with a non-GC referrer, the chat page should look like a direct
   visit, but the client **still sends** the referrer. The server drops it and records only the
   hostname, so the dashboard counts every visitor, not just clients that bypass the page.
3. Rejected referrers are counted by hostname only and shown to partners and admins in a
   collapsed card on the partner dashboard.

## Shipped design (PR 1: server and dashboard)

### The rule

`api/util/govHost.js` `isGovernmentLocation` is the only rule. It covers `canada.ca`, `gc.ca`
and their subdomains, department hosts from `departments_EN.js`/`departments_FR.js`,
`EXTRA_GC_HOSTS`, and `NON_GC_DEPARTMENT_HOSTS` (host-only and path-pinned). Matching is on the
parsed hostname by exact or dot-boundary suffix. `REFERRED_PUBLIC_DOMAIN_REGEX`
(`api/util/chat-filters.js`) is a substring match and is not used for this.

### Entry point

`api/util/referring-url.js`:
- `normalizeReferringUrl(raw)` is unchanged and accepts any host.
- `classifyReferringUrl(raw, { gcOnly })` parses once and returns
  `{ url, droppedReason: null | 'invalid' | 'not_gc', host }`. With `gcOnly` it runs
  `isGovernmentLocation` on the parsed URL before normalizing. A non-GC URL counts as
  `not_gc` even when it is also over the length cap, so every rejected visitor is counted.
- `rejectedReferrerHost(hostname)` is the only form ever kept (see Hostname rules).

`api/chat/chat-graph-run.js` is the only entry point:
- `gcOnly` is true unless `req.user.role` is `admin` or `partner`.
- For `not_gc`, `input.referringUrl` becomes `''` and the server logs
  `warn('Dropped non-GC referringUrl', chatId, { reason: 'not_gc', host, rawLength })`.
- For `invalid`, behaviour is the same as before (warn with `rawLength` only).
- The graph, the stored interaction and `BlockedQueryService.record` all read
  `input.referringUrl`, so they get `''`.

`ExperimentalBatchService` and `ExperimentalDatasetService` are admin-only and unchanged.

### Storing the host

`Interaction.rejectedReferrerHost` (String, default `''`) holds the hostname only.

It travels on the **request context** (`graphRequestContext` store), not on graph input.
LangGraph state keeps only the keys a graph's `Annotation` declares, so an
`input.rejectedReferrerHost` would never reach the persist step.
`GraphWorkflowHelper.persistInteraction` reads it from the store and passes it to
`InteractionPersistenceService`. That covers every graph and both persist paths (full answer
and short-circuit) without editing each graph. Batch runs have no value in the store, so they
save `''`.

### Hostname rules (logs, DB and dashboard)

- Only the normalized hostname is ever logged, stored or shown. Never the URL, path, anchor
  or raw input, because paths carry injected text and PII.
- WHATWG URL hostname: lowercase, IDN as punycode (`xn--…`). One trailing dot and one leading
  `www.` are stripped.
- IPv4/IPv6 literals become `ip-literal`. `localhost` and `*.localhost` become `localhost`.
- Capped at 253 characters. No hashes: a hash of a guessable URL can be reversed.

### Dashboard

- `api/metrics/metrics-referrals.js` returns `rejectedHosts: [{ host, count }]`. It holds the
  top 20 hosts by distinct conversation, using the same pipeline, date range, userType and
  department filters as `topReferrals`. The endpoint is still `partnerOrAdmin` only.
- `src/components/admin/dashboard/RejectedReferrersCard.js` sits under top referral pages on
  the partner dashboard. It is collapsed by default, and hosts are **plain text, not links**,
  because the sites may be hostile.

### Side effects

- Signed-out visitors from Google, partner sites and other non-GC pages have no stored
  `referringUrl`, so they drop out of top referrals. The new card counts them by host.
- `referredPublic` already counts only GC hosts, so `userType` doesn't change.
- AI Answers' own EN/FR hosts are under `canada.ca`, so language-switch referrers are kept.
- Local dev: `http://localhost` referrers are dropped for signed-out users.
- Chats from before this change have no `rejectedReferrerHost`. The card counts from
  deploy onward.

## Remaining work (PR 2: client)

Until PR 2 ships, a signed-out visitor with a non-GC referrer still sees the referring-URL
banner and compose-box echo. The server ignores that referrer.

- Hide a non-GC referrer from signed-out visitors (not admin/partner, via
  `useHasAnyRole(['admin','partner'])`). That means no banner, no compose-box echo, no aria
  label or `aria-describedby` target, and no department preselected from `urlDepartment`.
  Sources: `document.referrer` (`HomePage.js`), `?ref=` (`usePageContext`), the
  `ChatAppContainer` fallback chain and pageUrl backfill, and the `ChatInterface` display.
- Keep sending the original value. Work out the display value at render time from the
  stored candidate and the current role, not in a `useState` initializer: auth loads after
  first render.
- Share the rule with the client. Import `govHost.js` (option A) unless it adds more than about
  5 KB gzipped to the bundle. Otherwise use a dependency-free matcher plus an allowed-hosts JSON
  generated at build time, as `scripts/extract_domains.js` does (option B). Add a parity test that
  runs the same fixtures through the server and client checks.
- Client tests: signed out + non-GC `document.referrer` / `?ref=` is hidden but still sent;
  signed out + GC is shown and sent; a partner role arriving after first render shows the
  banner.

## Tests (PR 1)

- `api/util/__tests__/referring-url.test.js`: `classifyReferringUrl` kept / `not_gc` /
  `invalid` cases, pinned paths (including `%2f`), and `rejectedReferrerHost` normalization.
- `api/chat/__tests__/chat-graph-run.test.js`: a signed-out non-GC referrer reaches the graph
  and `BlockedQueryService` as `''`, with only the host on the request context and in the
  warning, and no path text anywhere. Signed-out GC and admin/partner non-GC are kept.
- `agents/graphs/workflows/__tests__/GraphWorkflowHelper.test.js` and
  `services/__tests__/InteractionPersistenceService.test.js`: the host goes from the
  request context to the stored interaction.
- `__tests__/integration.metrics-rejected-referrers.test.js`: distinct-conversation counts,
  date and department filters, cap of 20.
- `src/components/admin/dashboard/__tests__/RejectedReferrersCard.test.js`: collapsed by
  default, plain-text hosts, EN/FR labels, empty state.
- Manual: as admin tester in Evaluation options, a non-GC URL still applies (e.g.
  `dosimeteraudit.org/benchmark`).
