# Plan: Harden admin sign-up, sign-in and two-factor authentication

Status: proposed, not started. Priority reduced by the VPN/firewall setup; see the deployment context section. Findings are from reading the code (not exploited against a
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

### Phase 2: Sign-up controls (F3)

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
4. **Abuse controls.** Per-IP and per-email limits on sign-up and on verification-email sends
   (a verification email is a free email cannon otherwise), plus a honeypot field. Add a CAPTCHA
   only if the first two don't hold; it costs accessibility and needs an approved provider.
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
2. Treat a session as signed in for the rate limiter only when `req.user` is set.
3. Log auth events (failed password, failed 2FA, lockout, sign-up, verification) with account id
   rather than raw email, and alert on spikes. Fix the email-in-logs item from F4.
4. Consider requiring 2FA for admin accounts regardless of the global setting.

### Docs to update with each phase

- `docs/coding-agent-docs/admin-and-auth.md`: remove the "Gaps worth knowing" list as each
  item is fixed.
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
2. Is `twoFA.enabled` on in production today, and should 2FA become mandatory for admins?
3. Is a CAPTCHA acceptable for GC users, and is there an approved provider?
4. Existing unverified accounts: delete them all, or send a one-time verification email first?
5. Who creates the new GC Notify templates (verification, and any 2FA wording change), in both
   languages?

## Out of scope

- Authenticator-app (TOTP) or WebAuthn 2FA. Stronger than email codes and the right long-term
  answer, but a separate project.
- Changing the password-reset design, which is already sound (hashed-equivalent secret
  rotation, atomic attempt counter, generic responses).
