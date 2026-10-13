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
10 failures lock the account for 15 minutes. While locked even the right password is rejected,
with the same "Invalid credentials" message as any other failure. An unknown email takes as long
to reject as a known one. The deactivated-account message is only shown after a correct password.

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
   30 minutes (429). Requesting a new code does not reset the count.
5. "Send again" (`auth-send-2fa`) also uses `pending2FA`, takes no email, and has a 60-second
   cooldown.

When 2FA is disabled, step 1 logs the user straight in, and the verify and send endpoints refuse
(no `pending2FA`). `NODE_ENV=test` also skips 2FA.

Attempt counters are on the user document on purpose: an attacker can discard a session or change
address, but not the account. `middleware/auth-rate-limiter.js` adds a loose per-IP limit (100
POSTs per 15 minutes, per task) on `/api/auth/*` as a backstop only. It is generous because staff
share VPN addresses.

Requirements and gotchas when turning 2FA on:

- `TWOFA_SECRET` (or `SESSION_SECRET`) must be an environment variable, or login returns 500 with
  `reason: "twofa_no_secret"`. Other `reason` values on that 500: `twofa_no_template`,
  `twofa_send_failed`, `twofa_send_error`.
- Settings are cached per instance at startup with no refresh, so on a multi-instance deployment
  a saved `twoFA.enabled` only takes effect on some instances. Unfixed; see the Phase 1 status
  section of the plan.
- The login page shows "Invalid email or password" for any failure, so check the `auth-login`
  response in the browser's Network tab to see the real status.

Remaining gap: sign-up does no email verification, domain check or server-side password rule, and
logs the new (inactive) user in, which moves them to the signed-in rate-limit bucket. Plan:
[docs/plans/auth-hardening.md](../plans/auth-hardening.md) (Phase 2). `twoFASecret` on the user is a legacy field no longer used for
sign-in codes; signup still fills it and it can be dropped in a cleanup.

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
`session.defaultTTLMinutes`, default 60). Admins can view/manage sessions on the Sessions page
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
