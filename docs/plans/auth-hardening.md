# Plan: Harden admin sign-up, sign-in and two-factor authentication

Status (2026-10-16): Phase 1 merged (PR #1939; see "Phase 1 status" for open items). The Phase 1 follow-up clean-up PR is built on branch `auth-cleanup`, not yet merged. The F5 fix (own PR) is built on branch `auth-hardening-emails` (2026-10-23), not yet merged. Phase 2 PR A is built on branch `auth-hardening-phase2` (2026-10-26), not yet merged; Phase 2 PRs B and C and Phase 3 are not started. 2FA is on in staging for testing and stays off in production until every item in "Before turning 2FA on in production" is done. Priority reduced by the VPN/firewall setup; see the deployment context section. Findings are from reading the code (not exploited against a
running system). Read `docs/coding-agent-docs/admin-and-auth.md` for how auth works today.

Standards this follows: OWASP ASVS v4 §2 (authentication) and §3 (sessions), OWASP
Authentication and Forgot-Password cheat sheets, NIST SP 800-63B (out-of-band authenticators,
rate limiting, password guidance).

## Findings

### F1. 2FA is not tied to the password step (High, when `twoFA.enabled` is on)

- `auth-login.js` stores `req.session.pendingUser` after the password check. **Nothing ever
  reads it back.**
- `auth-verify-2fa.js` and `auth-send-2fa.js` identify the user from `req.body.email` alone,
  and `auth-verify-2fa.js` ends in `req.login(user)`. A caller who has never presented the
  password can be logged in with just an email address and a valid code.
- Both are unauthenticated and answer `404 user not found` for unknown emails, so they also
  enumerate accounts, and `auth-send-2fa` can be used to email-bomb any registered address.

### F2. The 2FA code is guessable and unlimited (High, combined with F1)

- Code is a 6-digit TOTP from a permanent per-user secret (`TwoFAService.js`), accepted with
  `window: 20`, so 41 codes are valid at any moment: about 1 in 24,000 per guess.
- No attempt counter and no lockout (compare password reset: 5 tries then 30 minutes).
- The code is not single-use. A code stays valid for about 10 minutes and can be replayed.
- The general rate limiter does not help. It keys on `visitorId`, then session id, then IP
  (`buildRateLimiterIdentity`). A client that discards cookies gets a new session and a new
  bucket on every request. Bot detection only blocks known bot User-Agents, and the
  fingerprint check only covers `chat-graph-run`.
- Net effect: an attacker who knows only an admin's email address could expect to guess a valid
  code in tens of thousands of requests, with no mailbox access and no password.
- The schema already has unused `twoFACode` / `twoFAExpires` fields, left over from an earlier
  design.

### F3. Sign-up has no email verification and no abuse controls (Medium–High)

**Can an account be created for an address nobody owns? Yes.** `auth-signup.js`:

- Accepts any string as the email. There is no format check on the server (the browser's
  `type="email"` is the only check), no verification email, and no domain restriction. The
  `account@account.com` accounts you saw are exactly this.
- No CAPTCHA, honeypot or sign-up-specific rate limit. The fingerprint check does not cover it.
  The only brake is the generic public bucket, which resets with each new session (see F2).
- Creates the user as `active: false`. This is the control that works: an unverified account
  cannot sign in or reach any data until an admin activates it. So the damage is clutter in the
  Manage user accounts page, admin time wasted, and a risk that an admin activates a fake
  account by mistake. It is not data exposure.
- Side effects worth fixing:
  - It calls `req.login()` even for inactive users. `deserializeUser` then rejects them, but the
    session still carries `passport.user`, and the rate limiter treats that as signed in. A bot
    that signs up therefore moves to the signed-in bucket. In production that is 999 requests
    per minute against 20 for anonymous users, so effectively unlimited.
  - Returns `User already exists` (400), so account existence is enumerable by calling the API
    directly. The sign-up page hides it, but the API does not.
  - No server-side password rule. The 8-character minimum is only enforced in the browser, so
    direct API calls can set a 1-character password.
  - First-user-becomes-admin uses a non-atomic `countDocuments()`. On a fresh or emptied
    database, whoever signs up first becomes admin, and two simultaneous requests could both.

### F4. Smaller gaps found on the way

- No lockout on password login (`auth-login.js`), only the general limiter.
- Password reset does not end existing sessions. A stolen session survives a reset.
- Email addresses are written to logs by `GCNotifyService`. Check this is acceptable under the
  privacy position in the system card.
- Email-only 2FA shares a mailbox with password reset, so it does not protect against mailbox
  compromise. That is a known limit of this design and should be stated plainly, not fixed here.

### F5. The admin users list sends sign-in secrets to the browser (Medium, found 2026-10-16)

`UserService.listUsers()` (`GET /api/user/user-users`, admin only) leaves out only `password`,
so every user's full document reaches the Users page. That includes `resetPasswordSecret` (the
permanent key behind password-reset codes: holding it is enough to make valid reset codes for
that account), `twoFACode` (hash of the current sign-in code), the legacy `twoFASecret`, and the
lockout counters. The page uses only `_id`, `email`, `role`, `active`, `institution`, `group` and
`createdAt`. Live in production today whether or not 2FA is on; admin is VPN-only, but the
secrets still sit in browser memory, devtools and any saved network trace.

Fix in its own small PR, not tied to a phase: return only the fields the page uses (an allowlist,
not an exclusion list) and test that no secret or counter field comes back. In the same file, stop
sending `error.message` in the 500 responses.

**Status (2026-10-23): built on branch `auth-hardening-emails`, not yet merged.** One allowlist
(`ADMIN_USER_FIELDS` in `services/UserService.js`) covers both `listUsers` and the PATCH response
from `adminUpdateUser`. PATCH had the same leak, because it also left out only `password`, and the
page replaces the saved row with that response. The 500 responses no longer include
`error.message`. Test: `api/user/__tests__/user-users-fields.test.js`.

Follow-ups found in review, each its own PR:
- **Hide secret fields by default.** Mark `resetPasswordSecret`, `twoFACode`, `twoFASecret` and
  the lockout counters `select: false` in `models/user.js`, so no query returns them unless it
  asks. Then F5 can't come back through some other endpoint. The sign-in, 2FA and reset code
  must then select them with `+field`.
- **Validate `role` in `adminUpdateUser`.** It accepts any string, and the update runs without
  schema validators, so the `['admin', 'partner']` enum is never checked. A PATCH with
  `role: 'superadmin'` is saved as is. Check it like `institution` and `group`.

## Deployment context: admin behind the Akamai firewall and VPN

Production has `twoFA.enabled` off. Admin access is meant to be reachable only from the
Government of Canada VPN, enforced at Akamai, and that is planned to be permanent. This lowers
urgency; it does not remove the work. **The repo cannot confirm the rule** (it only holds the
Akamai domain-ownership DNS records), so the first step is to verify it:

- Does the rule cover the **API paths** (`/api/auth/*`, `/api/user/*`, `/api/setting/*`,
  `/api/db/*`), or only the page URLs? The sign-in and sign-up pages are served by the same
  public site as the chat. Blocking `/en/admin` while leaving `/api/auth/auth-login` open
  protects nothing.
- Is the load balancer reachable **directly**, bypassing Akamai? Check that its security group
  and listener accept traffic only from Akamai.
- Both language hosts (`ai-answers` and `reponses-ia`) need the same rule.
- Fake accounts like `account@account.com` exist. Confirmed by the maintainer: they were created
  before the current restriction, so they show sign-up was open to the internet before the
  firewall. The permanent setup is public chat open, admin side VPN-only.

**Observed (October 2026):** from outside the VPN the whole site, public chat included, redirects
to a canada.ca 503 "AI Answers is not available" page. That page says public access is restricted
while infrastructure work takes place, so it is a **temporary full-site block, not the permanent
setup**. The permanent setup needs the chat public and the admin side VPN-only, which means a
path-level rule. When public access reopens, use an **allow-list**: only the public chat pages
and the specific public API routes are open to everyone, and everything else (all of
`/api/auth`, `/api/user`, `/api/setting`, `/api/db` and the rest of the admin APIs, plus the
sign-in and sign-up pages) is VPN-only by default. A block-list of admin paths would let any new
admin endpoint go live unprotected. Re-run the off-VPN checks against the new rule before reopening.

If the rule covers the API paths and the origin is closed:

| Item | Effect of the firewall |
|---|---|
| F1, F2 (2FA) | **Dormant while 2FA is off**: the endpoints return 403. It is a trap for whoever turns 2FA on later. Either fix before it is ever enabled, or remove the 2FA code. Not urgent. |
| F3 (sign-up flood) | External bots can't reach it. Phase 2 drops to low priority: server-side password rule, no auto-login at sign-up and the generic response are cheap and still worth doing. Email verification and domain allow-list become optional. |
| Password login lockout (F4) | **Rises in importance.** With 2FA off, the password is the only factor, and VPN membership is a very large population (every GC employee and any compromised GC workstation). |
| Session end on reset (Phase 3.1) | Unchanged. |

Other effects:

- **Per-IP limits can backfire.** VPN users likely share a few egress IPs, so an IP-keyed limiter
  could lock out every partner at once. Key auth limits on the account, with IP only as a loose
  backstop.
- A network boundary is one layer, not an authentication control. A misconfigured rule, a
  direct-to-origin path or a bad Akamai change silently removes it, and nothing in the app would
  notice. Keep the cheap in-app controls.
- If the firewall is the intended permanent control, say so in `SYSTEM_CARD.md` and
  `SYSTEM_CARD_FR.md` only once the API coverage above is confirmed. Don't state it until then.

## Plan

Phases are ordered by risk. Phase 1 should ship on its own and fast. Each phase is a separate
PR (AGENTS.md rule 14).

### Phase 1: Fix 2FA (F1, F2). Do this first.

1. **Bind verification to the login attempt.**
   - `auth-login.js` creates a challenge after a correct password and stores its id in the
     session, replacing the unused `pendingUser`.
   - `auth-verify-2fa.js` and a resend endpoint ignore `req.body.email`. They read the user
     only from that session challenge, and return a single generic failure when there is none.
   - Remove the unauthenticated `auth-send-2fa` route. Resend is the same session-bound call,
     with a cooldown of about 60 seconds and a cap of about 3 per challenge.
2. **Replace the TOTP-with-window design with a per-challenge one-time code.**
   - Generate 6–8 random digits with `crypto.randomInt`. Store an HMAC of the code, an expiry
     (10 minutes) and an attempt counter on the user record (reuse or replace `twoFACode` /
     `twoFAExpires`). Compare with `crypto.timingSafeEqual`.
   - Single use: delete on success. A new challenge replaces any earlier one.
   - Attempt counter lives **in the database, not the session**, because an attacker can throw
     the session away. 5 wrong codes invalidate the challenge. Repeated invalidations lock 2FA
     for the account for 30 minutes (same shape as the reset lockout, atomic `$inc`).
   - Drop `twoFASecret` use for sign-in. It can stay in the schema until a cleanup migration.
3. **Rate limit auth endpoints by IP and by account**, not by session. Add a dedicated limiter
   (`rate-limiter-flexible` is already a dependency) in front of `/api/auth/*`, keyed by
   `req.ip` and by normalized email. **Production currently has `session.rateLimitPersistence` set to
   Memory**, so each ECS task keeps its own counters. The effective limit is multiplied by the
   number of tasks and resets on every deploy or restart, and the "one active answer at a time"
   lock is also per task. Redis is already provisioned and used for sessions, so switch
   rate limiting to Redis (a Settings change, no new infrastructure) before relying on any
   auth limit. **Verify `req.ip` is the real client IP behind
   the load balancer** (`trust proxy` is set to 1); if there is more than one proxy hop it
   would key on the proxy and lock everyone out together.
4. **Add a lockout for password sign-in** (F4): 5–10 failures per account per window, with
   backoff. The response must be identical for wrong password, unknown user and locked account.
5. **Uniform responses.** No `404 user not found`, no "2FA disabled" hints to unauthenticated
   callers.
6. **Tests** (vitest): verify without a prior password step fails; wrong email in body is
   ignored; code is rejected the second time; 5 wrong codes then the right code still fails;
   attempts persist across new sessions; resend cooldown; expired code.

### Phase 1 status: built, tested on a preview, open items

Built and unit-tested (see `admin-and-auth.md` for the flow). Where the build differs from the
plan above, the items below say so. Preview testing on 2026-10-13 and 2026-10-15 and code review
found the following. None of it is a flaw in the Phase 1 design, but all of it must be settled
before `twoFA.enabled` goes on anywhere real.

1. **Fixed: 2FA hash key missing on previews.** Sign-in with 2FA on returned 500 with cause
   `twofa_no_secret` (now sent as `detail`, see item 4) because preview Lambdas get neither `TWOFA_SECRET` nor
   `SESSION_SECRET` (`.github/scripts/create-lambda-function.sh`). `TwoFAService.hashCode` now
   also falls back to `JWT_SECRET_KEY`, which every environment has. No infrastructure change
   needed.
2. **Settings are cached per server instance, loaded once at startup**
   (`SettingsService.loadAll()`, `server/server.js`; no timer). Saving a setting updates the
   database and only the cache of the instance that served the save. With several Lambda or ECS
   instances, `twoFA.enabled` appears on for some requests and off for others, and the Settings
   page can show the old value. **Not fixed yet** (the maintainer chose to wait). Proposed fix:
   reload settings from the database every ~60 seconds, own PR, with a test. Do this before
   turning 2FA on in production.
3. **Fixed 2026-10-15: the password step masked every failure as "Invalid email or password"**
   (`src/pages/LoginPage.js`), including 500s and 429s, which made debugging much slower. Each
   failure now gets its own message: 2FA locked, code could not be sent, server error, and
   "sign-in timed out" (which returns to the password form when the pending sign-in expires).
   These only appear after a correct password, so they reveal nothing new. A wrong password, an
   unknown email and a password lockout still share one message, which states the lockout rule.
   The 2FA step shows a message per `reason` and confirms a successful resend. A failed resend
   no longer invalidates the code already emailed: the new code is stored only after it is sent.
   On 2026-10-16 review changes moved the messages that no field is at fault for (lockout,
   failed send, server error, lost connection, timed out, resend result) from the form-error
   component to `StatusMessage`, which takes focus. A wrong password and a wrong code stay form
   errors. The same changes added focus tests and made "Send again" a secondary button.
4. Server responses use a fixed `reason` the page acts on (`locked`, `send_failed`, `expired`,
   `cooldown`, `invalid`, `server_error`). `AuthService` adds `server_error` for a 5xx with no
   `reason` and `network` when no response came back. A failed 2FA send at login is always
   `reason: "send_failed"` and also carries `detail` with the specific cause (`twofa_no_secret`,
   `twofa_no_template`, `send_failed` when GC Notify did not send, `twofa_send_error` for
   anything else; no error text) so the cause is visible in the browser's Network tab.
   Keep it; there is no log viewer in the app. Database and driver error codes never go in
   `detail`, only in the server log.
5. **Passed on a preview with `twoFA.enabled` on (2026-10-15),** though it took a few rounds of
   fixes to get there:
   - sign-in with the emailed code
   - resend the code, and resend again within the 1-minute cooldown
   - wrong codes are rejected and eventually lock 2FA
   - repeated wrong passwords lock sign-in
   - after a 2FA lockout, the right password shows "Too many incorrect codes…", not "Invalid
     email or password"
   - more than 10 minutes on the code screen, then Verify, returns to the sign-in form with
     "Your sign-in timed out…"
   - with a keyboard, "Resend code" moves focus to "New code sent." and Tab moves on from there
   - Wi-Fi or VPN off on the code screen, then Verify, says the server couldn't be reached, not
     "Invalid verification code"

   Unit tests cover TwoFAService, the 2FA handlers (including the login step), password lockout,
   and the LoginPage two-step messages and focus.

   The 2026-10-16 review changes (item 3) came after this run and have only unit tests. They
   change where these messages appear and where focus goes, so before merging, repeat the
   keyboard resend check and one of the message checks (lockout, timed out or no connection)
   on a preview.
6. **Decided 2026-10-16: `twoFASecret` is no longer generated.** Sign-up stopped filling it in
   the clean-up PR. The schema field stays so existing documents still load; clearing the value
   from existing accounts needs a migration and is not planned. `speakeasy` stays, password reset
   still uses it.
7. Review leftovers accepted for now: account lockout can be triggered by anyone who knows an
   email (inherent to lockout; admin is VPN-only; blocking burst lockouts would need the per-IP
   limits dropped in item 8); a parallel burst can slip a few extra guesses past 10. The
   failed-password count now resets after 15 minutes with no failure. The 2FA wrong-code count
   still has no decay, but reaching it needs the password; the session isn't regenerated at the
   password step (Phase 3.5); there is no cap on resends per challenge (planned above as ~3).
   Only the 60-second cooldown limits them, and only someone who passed the password step can
   resend, so the email-bomb risk is one email a minute to their own account.
   Since the clean-up PR, the sign-in step checks the 2FA lock against the user document
   Passport read before the password check (about 100 ms earlier) instead of reading it again.
   Someone who has the password and locks 2FA with parallel guesses inside that window can get
   one code emailed during the lockout. Verify still refuses, because it reads the lock live,
   and the email only reaches the account owner. A malformed code on a locked account answers
   `invalid` rather than `locked`, because the format check runs before any database work; the
   login page never sends one.
   Built thresholds, for comparison with plan items 2 and 4: 5 wrong 2FA codes lock 2FA for 30
   minutes straight away (there is no separate "invalidate the challenge" step first), and 10
   wrong passwords pause password sign-in for 15 minutes. `auth-send-2fa` was kept as the resend
   route but now acts only on the session's pending sign-in.
8. **Per-IP auth limiter removed.** Phase 1 first added one in front of `/api/auth/*` (item 3
   above). It was dropped because `trust proxy` is 1, so behind Akamai and the load balancer
   `req.ip` is likely a proxy address shared by many users, not the client, and the limiter could
   block staff sign-in as a group. The per-account lockouts are the real control. Revisit only
   with the hop count verified and counters in Redis.

### Phase 1 follow-up: clean-up PR (after Phase 1 merges)

From the 2026-10-15 and 2026-10-16 reviews. None of these is a security gap, so they were kept
out of the Phase 1 PR to keep it reviewable. Ship together as one small PR.

**Built on branch `auth-cleanup` (2026-10-16), not yet merged.** All three items below, plus
Phase 1 leftovers and fixes from an accessibility review and a code review (two rounds each).

- **Item 1, session length:** both sign-in handlers call `getSessionTtlMs` in
  `middleware/express-session.js`, the rule the middleware already used. Default 60 minutes on
  both paths; a test checks both get the same length.
- **Item 2, fewer reads:** `sendChallenge` takes exactly one of `user` (the document Passport
  read in the same request) or `userId`; `verifyChallenge` takes only `userId`, always reads the
  user itself, and returns the document it updated, so `auth-verify-2fa.js` doesn't read it
  again. The atomic write filters are unchanged.
- **Item 3, code format:** one rule, `normalizeTwoFACode` in `src/utils/auth/twoFACode.js`,
  used by the login page and `TwoFAService` (which also takes the code length from it). It
  removes spaces (`123 456` works) and refuses anything that isn't a string. The service checks
  it before any database work, so a malformed code is never counted. `auth-verify-2fa.js` no
  longer has its own empty-code check (the 400 with no `reason`): an empty, malformed or wrong
  code all get `401 { success: false, reason: 'invalid' }`.
- **Code screen:** "Enter the six-digit code from your email." (`login.2fa.codeFormat`) as a
  field error before sending; a "Six digits" hint linked to the field (SC 3.3.2);
  `aria-required` (not `required`, so the browser's English-only check never appears); a
  `<form>` so Enter verifies, with Resend as `type="button"`;  `inputMode="numeric"` and `autoComplete="one-time-code"`. No `maxLength`,
  which would silently cut a pasted code. `TWOFA_CODE_LENGTH` has a comment naming the strings
  to update if the length changes.
- **Phase 1 leftovers:** sign-up no longer generates `twoFASecret` (Phase 1 status, item 6).
  The sign-up test's `User` mock was fixed for Vitest 4. The system card is deliberately not
  changed here; see "Docs to update with each phase".
- **Accepted, recorded in Phase 1 status item 7:** the sign-in step's lock check uses
  Passport's read, and a malformed code on a locked account answers `invalid`.
- **Not changed (pre-existing, affects every session):** when
  `session.authenticatedTTLMinutes` is invalid, signed-in sessions fall back to 60 minutes
  rather than to a valid `session.defaultTTLMinutes`.

**Check on staging before merging** (2FA is on there):
- Verify with an empty code and with `12ab`: "Enter the six-digit code from your email." shows
  with focus on it.
- A correct code signs in, typed as `123456` and as `123 456`.
- Enter in the code field verifies.
- With a keyboard, Resend still moves focus to "New code sent."
- On a phone, the number pad opens.

The original items, as planned:

1. **One place for the signed-in session length.** `api/auth/auth-login.js` and
   `api/auth/auth-verify-2fa.js` each work out the authenticated session TTL, with different
   fallbacks when no setting or env var is set (`'60'` vs `'10'` minutes). So a 2FA sign-in can
   get a 10-minute session where a password-only sign-in gets 60. Move it into one shared helper
   used by both, pick the intended default, and test that both paths get the same length.
2. **Fewer database round trips per sign-in step** (matters on DocumentDB). `TwoFAService`'s
   `loadUser` re-reads a user document it was already given (the login step passes the Passport
   user), and `auth-verify-2fa.js` reads the user again after `verifyChallenge`. Use the given
   document where it is fresh enough, and have `verifyChallenge` return the user document it
   updated so the handler doesn't fetch it again. Keep the atomic filters on the writes: the
   stale-read race fixed on 2026-10-15 depends on them, not on the first read.
3. **Check the code's format before it is sent or counted.** The password form checks for empty
   fields before sending; the code field doesn't check anything. An empty code is refused by
   the server without counting (`auth-verify-2fa.js` returns 400 with no `reason`), but the page
   still shows "Invalid verification code". A malformed code (only spaces, too short, letters)
   is worse: `verifyChallenge` adds to the attempt count before it checks for 6 digits, so a typo
   counts toward the 2FA lockout. Fix both ends:
   - `LoginPage.js`: check for an empty or non-6-digit code before sending, and show a field
     error the same way the password form does.
   - `TwoFAService.verifyChallenge`: reject anything that isn't 6 digits before the `$inc`, with
     `reason: 'invalid'`, so it never counts.
   - Tests: an empty or malformed code doesn't call the API or change `twoFAAttempts`.

### Phase 2: Sign-up controls (F3)

Split into three PRs (decided 2026-10-26):

- **PR A, built on branch `auth-hardening-phase2` (2026-10-26), not yet merged:** item 5
  (length rule only), the server-side email format check from item 2, no login at sign-up
  for inactive accounts (item 3), and item 7 as an atomic first-user-wins. Decisions:
  - **Item 7:** keep first-user-wins rather than `ADMIN_BOOTSTRAP_EMAIL`. On an empty
    database the first user is saved as an active admin with `isFirstAdmin: true`, in one
    write. A unique sparse index on that field lets only one save win a race; the loser is saved
    as an inactive partner. (A first version promoted whoever had the oldest `_id` after saving.
    A code review showed that two sign-ups could both be promoted, and a failure between the
    two writes could leave no admin.)
  - **Before merging:** confirm the `isFirstAdmin_1` unique sparse index exists on the staging
    and production DocumentDB clusters (`db.users.getIndexes()`). Mongoose creates it at
    startup only if `autoIndex` is on, and AGENTS.md asks for the deployed index to be checked,
    not assumed.
  - **Item 5:** no common or breached password list for now.
  - **No maximum length:** bcrypt only uses the first 72 bytes, so a longer passphrase still
    works.
  - The password field now has an "At least 8 characters" hint linked to it.
- **PR B:** items 1 and 6, the per-email send limits from item 4, and the same response for an
  existing email (rest of item 3). That response waits for verification so the real owner who
  mistypes gets an email ("you already have an account") instead of a false "received". Needs
  the GC Notify templates (decision 5). Also give the sign-up 400s for an invalid email or
  password a `code`, and show them on the Register page as field errors (the `TODO(a11y)` in
  `RegisterPage.js`, SC 3.3.1).
- **PR C, optional while admin is VPN-only:** the domain allow-list (rest of item 2) and the
  honeypot.

1. **Verify the email before the account counts.**
   - Sign-up creates an unverified record and emails a single-use token link through GC Notify
     (hashed token, 24-hour expiry), reusing the pattern in `auth-send-reset.js`.
   - Only a verified account appears in the admin's pending-activation list. Activation stays a
     manual admin decision.
2. **Restrict domains.** New setting `signup.allowedDomains` (comma list, e.g. `canada.ca`,
   `gc.ca`, partner domains). If empty, allow all and rely on the other controls. Reject
   syntactically invalid addresses and known disposable domains on the server.
3. **Do not log the user in at sign-up** (removes the rate-limit upgrade), and return the same
   message whether or not the email already exists.
4. **Abuse controls.** Per-email limits on sign-up and on verification-email sends (a
   verification email is a free email cannon otherwise), plus a honeypot field. Per-IP limits
   have the same problem that got the Phase 1 limiter removed (Phase 1 status, item 8): verify
   what `req.ip` is behind Akamai before keying anything on it, and put counters in Redis. **No
   CAPTCHA** (decided 2026-10-26): it is an accessibility barrier, and the sign-up flow must be
   fully accessible. The honeypot must be invisible to everyone: `display: none` hides it from
   screen readers and keyboard focus alike, with `autocomplete="off"` so autofill doesn't fill
   it and turn a real person away.
5. **Server-side password policy** (NIST 800-63B): minimum 8 enforced on the server, allow long
   passphrases, no composition rules, reject known-breached or very common passwords. Apply to
   sign-up and reset.
6. **Clean-up.** Unverified accounts expire automatically (TTL index on a date field that is
   cleared at verification; **confirm TTL index behaviour on DocumentDB 8 before relying on
   it**, otherwise use a scheduled job with bounded deletes). Add an "unverified" filter and
   bulk delete to the users page for the existing junk.
7. **Bootstrap admin safely.** Replace first-user-becomes-admin with an explicit
   `ADMIN_BOOTSTRAP_EMAIL` env var, or make the check atomic and self-disabling once an admin
   exists.
8. **Tests:** invalid and disposable emails rejected, unverified account can't be activated,
   token single-use and expiring, no session after sign-up, identical response for existing
   email, rate limits, weak password rejected over the API.

### Phase 3: Session and operations

1. End all of a user's sessions on password reset, deactivation, role change and delete
   (delete from the session store by `passport.user.userId`; both mongo and redis stores).
   Delete the user's "remember this device" tokens in the same place.
2. Treat a session as signed in for the rate limiter only when `req.user` is set.
3. Log auth events (failed password, failed 2FA, lockout, sign-up, verification) with account id
   rather than raw email, and alert on spikes. Fix the email-in-logs item from F4.
4. Consider requiring 2FA for admin accounts regardless of the global setting.
5. Regenerate the session when the password step succeeds (before `pending2FA` is set), not only
   at final login, to rule out session fixation.
6. Log password lockouts. 2FA lockouts are already logged (`TwoFAService`); password lockouts in
   `config/passport.js` are not.

### Remember this device for 12 hours (own PR, before 2FA goes on in production)

Added 2026-10-26. Partners must not be slowed down by a code at every sign-in. After a correct
code, the user can choose to skip the code on that browser for 12 hours. They still enter their
password each time. This follows NIST SP 800-63B at AAL2: a full re-authentication at least
every 12 hours, and within that window the password alone is enough.

Why not a longer session instead: the session is `rolling: true`
(`middleware/express-session.js`), so its TTL is an idle timeout. Raising
`session.authenticatedTTLMinutes` would let someone who signs in every day skip both the password
and the code forever.

1. **Checkbox on the code screen:** "Remember this device for 12 hours". Ticked by default:
   government staff rarely share a computer, and the user can untick it. Add new locale keys in
   EN and FR.
2. **Issue a token after a correct code, only when the box is ticked.** Use a random token in
   its own cookie (httpOnly, Secure, SameSite=strict), scoped to the parent domain like the
   session cookie so moving between the EN and FR hosts doesn't ask for a new code. Store only
   its hash, with `userId` and `expiresAt`, in a small collection with one row per device.
3. **Fixed 12 hours, hard-coded** as a constant beside the other 2FA constants. Don't make it a
   setting: 12 hours is the NIST upper limit, so a setting would only allow going past it.
   Using the token doesn't extend it.
4. **Check the token only after the password check succeeds**, in `auth-login.js`. If it is
   valid, unexpired and belongs to **the same user**, skip the challenge and call `req.login`
   with the same session regeneration and TTL as `auth-verify-2fa.js`. Otherwise send a code as
   today. The token must never replace the password, and a token for user A must do nothing for
   user B in the same browser (the F1 lesson).
5. **Revoke:** delete the user's device tokens on password reset, deactivation, role change and
   delete, the same events as Phase 3.1. Until Phase 3.1 ships, add this to the existing
   password-reset and deactivate handlers.
6. **Clean-up:** expired rows are already ignored by the query. A TTL index on `expiresAt` can
   delete them, but **confirm TTL index behaviour on DocumentDB 8 first** (same caveat as
   Phase 2.6).
7. **Tests:** a valid token skips the code; with the box unticked, no cookie is set; an expired
   token, another user's token, or a tampered token still sends a code; a token without the
   correct password does nothing; password reset and deactivation revoke tokens.

### Before turning 2FA on in production

2FA stays off in production until all of these are done. It is on in staging for testing.

1. Phases 1, 2 and 3, the Phase 1 clean-up PR, the F5 fix and "Remember this device" are
   merged.
2. Settings reload across instances (Phase 1 status, item 2), so `twoFA.enabled` takes effect on
   every instance, not only the one that saved it.
3. The production 2FA email template is set (`twoFA.templateId` or
   `GC_NOTIFY_2FA_TEMPLATE_ID`) and a test sign-in receives the code.
4. A full pass on staging with 2FA on: the checks in Phase 1 status item 5, plus any added by
   later phases.
5. `SYSTEM_CARD.md` and `SYSTEM_CARD_FR.md` updated in the same release to say 2FA is on (and
   whether it is required for admins, Phase 3 item 4), so the card matches production. Also
   say that a user can choose to skip the code on a device for up to 12 hours.

### Docs to update with each phase

- `docs/coding-agent-docs/admin-and-auth.md`: remove the "Gaps worth knowing" list as each
  item is fixed.
- Open, for a separate system card change: the components list (EN and FR, item 2 "Admin
  interface") says the admin interface has 2FA, but the card's authentication section says the
  codes are optional, and 2FA is off in production. Make the components list say optional, or
  leave it until 2FA goes on ("Before turning 2FA on in production", item 5).
- `SYSTEM_CARD.md` and `SYSTEM_CARD_FR.md`: authentication wording and any new sign-up controls
  (both languages, per AGENTS.md). Do not claim email verification, domain limits or lockout
  until they ship. The safety claims and the implementation must not differ.
- `docs/architecture/infrastructure-diagram.md` if a new Redis or limiter dependency is added.
- New locale keys in EN and FR for the verification email flow, plus matching GC Notify
  templates (EN and FR content) that someone must create outside the repo.

## Check the existing data first (read-only)

To size the sign-up problem, run against the users collection (DocumentDB-safe, no aggregation):

```js
db.users.find({ active: false }, { email: 1, createdAt: 1, _id: 0 }).sort({ createdAt: -1 })
```

Look for throwaway domains, bursts of creation times, and any `active: true` account whose
email you don't recognise. The last group matters most, because it means an admin approved a
fake. Also confirm in Settings whether `twoFA.enabled` is on in production. If it is, treat
Phase 1 as urgent.

## Decisions needed from maintainers

1. Which email domains may register? (Phase 2.2)
2. Should 2FA become mandatory for admins? (Answered 2026-10-16: `twoFA.enabled` is off in
   production and on in staging; see "Before turning 2FA on in production".)
3. Is a CAPTCHA acceptable for GC users, and is there an approved provider? (Answered
   2026-10-26: no CAPTCHA, for accessibility. See Phase 2.4.)
4. Existing unverified accounts: delete them all, or send a one-time verification email first?
5. Who creates the new GC Notify templates (verification, and any 2FA wording change), in both
   languages?

## Out of scope

- Authenticator-app (TOTP) or WebAuthn 2FA. Stronger than email codes and the right long-term
  answer, but a separate project.
- Changing the password-reset design, which is already sound (hashed-equivalent secret
  rotation, atomic attempt counter, generic responses).
