# Admin interface, accounts and authentication

Short map of how the admin/partner side works. Read it before touching login, roles,
user management, sessions or admin routes. Facts below were checked against the code;
file paths are the source of truth if they drift.

## Roles

`models/user.js` — `role` is `'admin'` or `'partner'` (default `partner`).

| Role | Can do |
|---|---|
| `partner` | Evaluation and chat dashboards, metrics, chat viewer, batches, scenario overrides, own account page |
| `admin` | Everything a partner can, plus: users, settings, database, vector, sessions, auto-eval, technical metrics, connectivity, experimental pages |

There is no separate "expert" role in the schema (some older docs say so).

The role lives in three places that must agree when you add a page or endpoint:

1. **Route** — `src/App.js` route table, `roles: ['admin']` or `['admin', 'partner']`.
   `RoleProtectedRoute` (`src/components/RoleProtectedRoute.js`) redirects unauthenticated
   users to sign-in and wrong-role users to their default route.
2. **Menu** — `src/pages/AdminPage.js` shows a "Partner menu" to everyone signed in and an
   "Admin menu" inside `<RoleBasedContent roles={['admin']}>`.
3. **API** — `middleware/auth.js`. The front-end guard is **not** a security control; every
   admin endpoint must wrap its handler:
   `withProtection(handler, authMiddleware, adminMiddleware)` (admin only) or
   `withProtection(handler, authMiddleware, partnerOrAdminMiddleware)`.
   `withProtection` throws at startup if given no middleware. Hiding a link does not protect
   an endpoint.

## Accounts

- **Signup** (`api/auth/auth-signup.js`): the **first user ever created becomes an active
  admin**. Everyone after is a `partner` with `active: false` and cannot use the system until
  an admin activates them on the Manage user accounts page (`/en/users`, admin only).
  When the database has no users, sign-up saves the new user as an active admin with
  `isFirstAdmin: true`, in one write. That field has a unique sparse index, so if two sign-ups
  race on an empty database, the second save fails and is retried as an inactive partner. **The
  index must exist on DocumentDB**; without it, both could become admin. Only that first admin is
  logged in at sign-up; an inactive account gets no session login. A duplicate-email save (a
  double submit) answers `User already exists`, not 500.
- **Password and email rules** are checked on the server, not only on the page. The password
  rule (`src/utils/auth/passwordRule.js`: at least 8 characters, no composition rules, no
  maximum) is shared by the sign-up and reset pages and both handlers. Sign-up also refuses an
  email that fails the shared `isValidEmail` (`src/utils/auth/validateEmail.js`, which includes
  the 254-character limit).
- **Inactive accounts** are blocked at login (`config/passport.js` local strategy) and on every
  request (`deserializeUser` returns no user if `active` is false), so deactivating an admin
  action takes effect on the user's next request, not at session expiry.
- **User management** (`api/user/user-users.js` → `services/UserService.js`): admins list,
  activate/deactivate, change role, set institution/group, delete. Admin-only.
- **Institution and group** (`institution`, `group` on the user): drive the dashboard
  department/reviewer prefilters and who a partner may assign chats to
  (`UserService.canAssignTo`, `api/chat/chat-assign-interaction.js`). A partner sets their own
  once on the Account page (`api/user/user-me.js` then locks it); admins can change it any time.
  Not collected at signup.
- Passwords are bcrypt-hashed in a `pre('save')` hook. The session stores only
  `{ userId, email, role }`.

## Login and two-factor authentication

Two-factor authentication (2FA) is a setting, `twoFA.enabled` (Settings page, admin). Check it
before saying "2FA is on" about any deployment.

Password sign-in (`config/passport.js`): wrong passwords are counted on the user document, and
10 failures lock the account for 15 minutes. The count starts again after 15 minutes with no
failed sign-in (`LOGIN_ATTEMPT_WINDOW_MS`), so occasional typos never add up to a lockout. While locked even the right password is rejected,
with the same "Invalid credentials" message as any other failure. An unknown email takes as long
to reject as a known one. The deactivated-account message is only shown after a correct password.
Because a lockout is never revealed per account, the login page's failure message
(`login.invalidCredentials`) tells everyone the rule ("After 10 failed attempts, sign-in is paused
for 15 minutes"). It repeats the numbers in `config/passport.js`; change both together.

Flow when 2FA is enabled (`api/auth/auth-login.js`, `auth-verify-2fa.js`, `auth-send-2fa.js`,
`services/TwoFAService.js`):

1. Email + password checked by Passport. The user is **not** logged in yet; the session records
   `pending2FA = { userId, createdAt }`.
2. A random 6-digit code is emailed through **GC Notify** (template from `twoFA.templateId` or
   `GC_NOTIFY_2FA_TEMPLATE_ID`). Only an HMAC of it is stored on the user, with a 10-minute expiry.
3. The user submits the code to `auth-verify-2fa`. **The endpoint takes the user from
   `pending2FA` and ignores any email in the body**, so it cannot be used without the password
   step. A correct code works once.
4. Failed codes are counted on the user document. 5 wrong codes discard the code and lock 2FA for
   30 minutes (429). Requesting a new code does not reset the count. Input that isn't 6 digits
   (after removing spaces) is refused before any database work, so it never counts. The page and
   the server share that rule (`normalizeTwoFACode` in `src/utils/auth/twoFACode.js`); the page
   flags a bad code before sending it (`login.2fa.codeFormat`).
5. "Send again" (`auth-send-2fa`) also uses `pending2FA`, takes no email, and has a 60-second
   cooldown. The code sent at sign-in counts, so a resend in the first minute is refused. Each
   resend replaces the previous code.

On the 2FA screen the login page shows a specific message for each refusal: `cooldown` ("Wait a
minute…"), `locked` ("Too many incorrect codes…"), a wrong code, and a success confirmation after a
resend. `AuthService.send2FA`/`verify2FA` put the server's `reason` on the thrown error.

When 2FA is disabled, step 1 logs the user straight in, and the verify and send endpoints refuse
(no `pending2FA`). `NODE_ENV=test` also skips 2FA.

Attempt counters are on the user document on purpose: an attacker can discard a session or change
address, but not the account. There is no separate per-IP limit on `/api/auth/*`; see the plan's
Phase 1 status for why it was dropped.

Requirements and gotchas when turning 2FA on (the full go-live list is "Before turning 2FA on
in production" in the plan):

- The code hash is keyed from `TWOFA_SECRET`, else `SESSION_SECRET`, else `JWT_SECRET_KEY`. Every
  deployed environment has `JWT_SECRET_KEY` (PR previews have no `SESSION_SECRET`), so nothing
  needs setting. With none of the three, login returns 500 with `reason: "send_failed"` and
  `detail: "twofa_no_secret"`. Other `detail` values on that 500: `twofa_no_template`,
  `send_failed` (GC Notify did not send the email) and `twofa_send_error` (any other error).
- Settings are cached per instance at startup with no refresh, so on a multi-instance deployment
  a saved `twoFA.enabled` only takes effect on some instances. Unfixed; see the Phase 1 status
  section of the plan.
- The password step of the login page shows its own message for 2FA lockout, a failed code
  send, a server error and a lost connection. A wrong password, an unknown email and a password
  lockout still share one message. For the cause of a failed send, check `detail` in the
  `auth-login` response in the browser's Network tab.

Remaining gap: sign-up does no email verification or domain check, and still answers
`User already exists` to a direct API call. Plan:
[docs/plans/auth-hardening.md](../plans/auth-hardening.md) (Phase 2, PRs B and C). `twoFASecret` on the user is a legacy field that nothing reads or
writes; existing accounts still hold a value until a migration clears it.

The admin users endpoint (`user-users`, list and PATCH) returns only the fields in
`ADMIN_USER_FIELDS` (`services/UserService.js`), never the whole user document, which holds
`resetPasswordSecret`, `twoFACode` and lockout counters (F5 in the plan). To show a new column on
the Users page, add its field to that allowlist, and keep secrets and counters out of it.
`api/user/__tests__/user-users-fields.test.js` fails if anything else comes back.

## Password reset

`auth-send-reset` → emailed link → `auth-reset-password`. Uses a separate TOTP secret
(`resetPasswordSecret`, regenerated on each request so older codes die). The send endpoint
returns the same message whether or not the account exists (no enumeration). Reset code window
is ±1 minute; **5 failed attempts lock the account's reset for 30 minutes**, and the counter is
deliberately not reset by requesting a new email. Template: `notify.resetTemplateId` or
`GC_NOTIFY_RESET_TEMPLATE_ID`.

## Sessions

`middleware/express-session.js`. Cookie `aianswers.sid`: `httpOnly`, `secure` outside
development/test, `sameSite: strict` when secure, rolling expiry. Store is chosen by
`session.type` (`mongo` default, `redis`, or in-memory). Anonymous visitors and signed-in users
both have sessions; signed-in users get `session.authenticatedTTLMinutes` (falls back to
`session.defaultTTLMinutes`, default 60). That rule is `getSessionTtlMs`; both sign-in handlers
(`auth-login.js`, `auth-verify-2fa.js`) call it after `req.login`, because the regenerated session
would otherwise keep the anonymous length. Admins can view/manage sessions on the Sessions page
(`session.managementEnabled`).

Rate limiting (`middleware/rate-limiter.js`) is applied to all `/api` routes, with a larger
bucket for signed-in users (default 300) than public (default 60).

## Settings

Runtime config lives in the settings store (`services/SettingsService.js`), edited by admins on
the Settings page (`api/setting/*`, all admin-only; changes are audited via `setting-audit.js`).
2FA, session, rate-limit, search provider, outage message and workflow defaults are all settings,
and most fall back to an environment variable. Look up the key in `SettingsService.js` before
adding a new one; the Settings page has its own key→section map in `src/pages/SettingsPage.js`.

## Checklist: adding an admin page or endpoint

1. Register the route slugs (EN + FR) in `src/utils/routes.js` and the route in `src/App.js`
   with the right `roles`.
2. Link it from `AdminPage.js` in the matching menu.
3. Protect every API handler it calls with `withProtection` + the right role middleware.
4. Add the `aria-label`led back-to-admin `<nav>` (see `AGENTS.md`).
5. Add EN and FR locale keys; add a how-to under `public/content/admin/` if users need one.
