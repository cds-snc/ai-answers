# Authentication

This document describes the authentication flows for the admin/partner portal. All auth endpoints live in `api/auth/` and use Passport.js with a local (email+password) strategy.

## Roles and activation

- **admin** — full access. The first user to sign up is automatically admin and active.
- **partner** — limited access. All subsequent signups are partner role and **inactive by default** — an admin must activate them before they can sign in.

Roles are checked by middleware in `middleware/auth.js`:
- `authMiddleware` — requires any authenticated session
- `adminMiddleware` — requires `role: 'admin'`
- `partnerOrAdminMiddleware` — requires `role: 'partner'` or `role: 'admin'`

## Sign up

**Endpoint:** `POST /api/auth/auth-signup`
**Handler:** `api/auth/auth-signup.js`

1. User submits email and password.
2. Email is normalised (lowercase, trimmed) and checked for uniqueness.
3. Password is hashed via bcrypt (`models/user.js` pre-save hook).
4. TOTP secrets for 2FA and password reset are generated at signup.
5. First user → admin + active. All others → partner + inactive.
6. First user (admin) is logged in via Passport immediately after creation.
7. All other users receive a success message but cannot access any protected routes until an admin activates their account (`passport.deserializeUser` rejects inactive users).

**Note:** `auth-signup.js` calls `req.login()` for all users including inactive ones. This has no practical effect (the session is rejected on the next request), but the call is unnecessary for inactive users and could be guarded with an `if (user.active)` check.

## Sign in

**Endpoint:** `POST /api/auth/auth-login`
**Handler:** `api/auth/auth-login.js`

1. Passport local strategy validates email + password (`config/passport.js`).
2. Inactive accounts are rejected at the Passport strategy level.
3. If `twoFA.enabled` setting is **false** (the default), user is logged in directly.
4. If `twoFA.enabled` is **true**, the user is stored in `req.session.pendingUser` and a TOTP code is emailed via GC Notify. The user must then verify via the 2FA endpoint.

**2FA is not enforced by default.** It is controlled by the `twoFA.enabled` setting (configurable on the admin Settings page). When disabled, sign-in is single-factor (email + password only).

### 2FA verification

**Endpoint:** `POST /api/auth/auth-verify-2fa`
**Handler:** `api/auth/auth-verify-2fa.js`

- Verifies the TOTP code against the user's stored secret via `TwoFAService`.
- On success, completes the Passport login and clears `pendingUser` from the session.

### 2FA resend

**Endpoint:** `POST /api/auth/auth-send-2fa`
**Handler:** `api/auth/auth-send-2fa.js`

- Re-sends a TOTP code to the user's email. Only works when 2FA is enabled.

## Password reset

Two-step flow using time-based one-time passwords (TOTP) via the `speakeasy` library.

### Step 1 — Request reset email

**Endpoint:** `POST /api/auth/auth-send-reset`
**Handler:** `api/auth/auth-send-reset.js`

1. User enters their email on `ResetRequestPage`.
2. Handler generates a fresh TOTP secret, stores it on the user document, and derives a 6-digit code.
3. A reset link containing the code is emailed via GC Notify: `/{lang}/reset-complete?email={email}&code={code}`
4. Returns a generic response regardless of whether the email exists (prevents enumeration).

### Step 2 — Set new password

**Endpoint:** `POST /api/auth/auth-reset-password`
**Handler:** `api/auth/auth-reset-password.js`

1. User clicks the email link, landing on `ResetCompletePage` with email and code pre-filled from URL params.
2. User enters a new password and submits.
3. Handler verifies the TOTP code against the stored secret (20-step window ≈ 10 minutes).
4. On success, password is updated (bcrypt-hashed via pre-save hook) and all reset state is cleared.

### Password reset security controls

- **Rate limiting:** 5 code attempts per 15 min per IP+email; 3 reset-email requests per 15 min per IP+email (`middleware/auth-rate-limiter.js`).
- **Timed lockout:** After 5 failed code attempts, the account is locked for 30 minutes. The lockout persists even if a new reset email is requested.
- **Fresh secret per request:** Each call to `auth-send-reset` generates a new TOTP secret, invalidating any prior codes.
- **Single-use:** The secret is cleared on successful reset, so the link cannot be reused.
- **No enumeration:** All failure paths (`user not found`, `no secret`, `wrong code`) return the same generic error.
- **Atomic counters:** Failed attempt increment uses MongoDB `$inc` to prevent race conditions.

## Sign out

**Endpoint:** `POST /api/auth/auth-logout`
**Handler:** `api/auth/auth-logout.js`

- Calls `req.logout()` (Passport) then `req.session.destroy()`.

## Session management

- Sessions are managed by `express-session` (`middleware/express-session.js`).
- Session TTL is configurable via `session.defaultTTLMinutes` / `session.authenticatedTTLMinutes` settings.
- Authenticated sessions get a longer TTL set at login time.
- `req.user` is populated by Passport's `deserializeUser`, which re-checks `user.active` on every request.

## Key files

| File | Purpose |
|------|---------|
| `config/passport.js` | Passport local strategy, serialize/deserialize |
| `middleware/auth.js` | Auth/role verification middleware |
| `middleware/auth-rate-limiter.js` | Strict rate limits for reset endpoints |
| `middleware/rate-limiter.js` | Global API rate limiter |
| `models/user.js` | User schema, bcrypt pre-save hook |
| `services/TwoFAService.js` | TOTP generation and verification for 2FA |
| `services/GCNotifyService.js` | Email delivery via GC Notify |
| `src/services/AuthService.js` | Frontend API client for all auth endpoints |
