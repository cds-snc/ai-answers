import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import AuthService from '../services/AuthService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { getPath } from '../utils/routes.js';
import PasswordInput from '../components/auth/PasswordInput.js';
import AnnouncedError from '../components/auth/AnnouncedError.js';
import { useAnnouncedError } from '../hooks/auth/useAnnouncedError.js';
import { useAuthFormValidation } from '../hooks/auth/useAuthFormValidation.js';
import { normalizeEmail } from '../utils/auth/validateEmail.js';
import { useFocusOnChange } from '../hooks/useFocusOnChange.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import { announce } from '../utils/liveAnnouncer.js';

const LoginPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const navigate = useNavigate();
  const location = useLocation();
  const { login, refreshUser, getDefaultRouteForRole } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, errorCount, errorRef, setError, clearError, validate, isFieldInvalid } = useAuthFormValidation();
  const [isLoading, setIsLoading] = useState(false);
  // Seeded from the URL marker, then owned locally: handleSubmit clears it
  // (and the marker) without a router navigation — see there.
  const [sessionExpired, setSessionExpired] = useState(
    () => new URLSearchParams(location.search).get('reason') === 'session-expired'
  );
  // Unlike App.js's session-warning box (ambient, no focus-move needed),
  // this is a one-time mount-time message explaining a redirect the user
  // didn't initiate — same category ResetCompletePage.js's invalid-reset-
  // link case gets explicit focus-move for, and for the same reason: no
  // nearby trigger the user just interacted with to anchor their attention.
  const sessionExpiredRef = useFocusOnChange(sessionExpired);

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    // If 2FA flow already started, ignore normal submit
    if (showTwoStep) {
      return;
    }
    const trimmedEmail = normalizeEmail(email);
    if (!validate({ email: trimmedEmail, password }, t)) {
      return;
    }
    // The expiry marker is informational only. Once the user starts a fresh
    // login attempt that passes validation, remove it so it cannot persist
    // into a new session.
    if (sessionExpired) {
      // history.replaceState, not navigate(): a router navigation gets a
      // fresh location.key, so useRouteChangeFocus would move focus to
      // <main> and usePageMetadata would announce "Sign in" mid-submit.
      // The URL is cleaned so the marker can't survive a reload; the notice
      // is local state, so it can go too. Safe to unmount: it only ever
      // holds focus on mount, and focus is on the submit button by now.
      window.history.replaceState(window.history.state, '', location.pathname);
      setSessionExpired(false);
    }
    setIsLoading(true);
    // The submit button disables itself while signing in, which drops
    // focus to <body> — its own "Signing in..." label change is never
    // heard. Announce it, so there's a signal between the click and the
    // landing page (same as any other loading state — skippable, so a fast
    // sign-in reads just the landing page's title).
    announce(t('login.form.submitting'), { skippable: true });
    try {
      const data = await login(trimmedEmail, password);
      // If backend requires two-step verification, backend already sent the email; prompt for code
      if (data && data.twoFA) {
        setShowTwoStep(true);
        return;
      }
      const defaultRoute = data?.defaultRoute || '/';
      // A plain navigate(): the landing page gets the same focus-to-<main>
      // treatment as every other client-side route change
      // (useRouteChangeFocus). Skipping it left a screen-reader user parked
      // wherever the old page's cursor was, with nothing read.
      navigate(defaultRoute);
    } catch (err) {
      setError(t('login.invalidCredentials'), ['email', 'password']);
    } finally {
      setIsLoading(false);
    }
  };

  // Two-step verification state
  const [showTwoStep, setShowTwoStep] = useState(false);
  const [code, setCode] = useState('');
  const {
    error: twoStepError,
    errorCount: twoStepErrorCount,
    errorRef: twoStepErrorRef,
    setError: setTwoStepError,
    clearError: clearTwoStepError,
  } = useAnnouncedError();
  // The credentials form (and whatever had focus in it) unmounts when the
  // 2FA view mounts in its place, so focus would otherwise revert to <body>
  // with no signal to AT users that the view changed. Move focus onto the
  // new view's intro text — focus reads it, so it's deliberately not also
  // a live region (same as FeedbackComponent's thank-you message).
  // NOTE: showTwoStep stays `true` across a resend (requestTwoStep calls
  // setShowTwoStep(true) again, a no-op), so this effect won't refire then —
  // don't rely on it to announce resend-specific feedback.
  const twoStepIntroRef = useFocusOnChange(showTwoStep);

  const verifyTwoStep = async () => {
    setIsLoading(true);
    clearTwoStepError();
    // Same reasoning as handleSubmit's announce().
    announce(t('login.form.submitting'), { skippable: true });
    try {
      // backend method remains verify2FA
      const data = await AuthService.verify2FA(email, code);
      // AuthService stores token and user; refresh context
      await refreshUser();
      // Prefer explicit defaultRoute from the verify response if present
      let defaultRoute = data?.defaultRoute;
      // Otherwise compute from returned user role (or fallback to '/')
      if (!defaultRoute && data?.user?.role) {
        defaultRoute = getDefaultRouteForRole(data.user.role, lang);
      }
      if (!defaultRoute) defaultRoute = '/';
      navigate(defaultRoute);
    } catch (err) {
      setTwoStepError(t('login.2fa.invalidCode'));
    } finally {
      setIsLoading(false);
    }
  };

  // Request a verification code to be sent to the user's email (public endpoint)
  const requestTwoStep = async () => {
    if (!email) return;
    setIsLoading(true);
    clearTwoStepError();
    try {
      // backend method remains send2FA
      await AuthService.send2FA(email);
      setShowTwoStep(true);
    } catch (err) {
      setTwoStepError(t('login.2fa.sendError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-login-container">
      <h1>{showTwoStep ? t('login.2fa.title') : t('login.title')}</h1>
      {/* Was GcdsNotice — no role/aria-live in its render at all, so this
          never announced anything (see App.js's matching comment / status-
          and-error-messaging.md for the full reasoning). tabIndex={-1} +
          sessionExpiredRef move focus here on mount since there's no prior
          user interaction to anchor attention to an unexpected redirect. */}
      {sessionExpired && (
        <StatusMessage
          variant="warning"
          className="mb-400"
          ref={sessionExpiredRef}
          tabIndex={-1}
          announce={false}
        >
          <p><strong>{t('login.sessionExpired.title')}</strong></p>
          <p>{t('login.sessionExpired.message')}</p>
        </StatusMessage>
      )}

      {/* When in 2FA flow show only the 2FA UI */}
      {showTwoStep ? (
        <div>
          <p tabIndex={-1} ref={twoStepIntroRef}>
            {t('login.2fa.sentToEmail')}
          </p>
          {twoStepError && (
            <AnnouncedError
              id="login-2fa-error"
              message={twoStepError}
              errorCount={twoStepErrorCount}
              inputRef={twoStepErrorRef}
            />
          )}
          <div className="auth-form-group">
            <label htmlFor="code">{t('login.2fa.code')}</label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={isLoading}
              aria-describedby={twoStepError ? 'login-2fa-error' : undefined}
              aria-invalid={!!twoStepError}
            />
          </div>
          <div>
            <button onClick={verifyTwoStep} disabled={isLoading} className="btn-primary-sm auth-submit-button">
              {t('login.2fa.verify')}
            </button>
            <button onClick={requestTwoStep} disabled={isLoading || !email}>
              {t('login.2fa.resend')}
            </button>
          </div>
        </div>
      ) : (
        // Default login form with signup link when not in 2FA flow
        <>
          {error && (
            <AnnouncedError id="login-error" message={error} errorCount={errorCount} inputRef={errorRef} />
          )}
          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-form-group">
              <label htmlFor="email">{t('login.email')}</label>
              <input
                type="email"
                id="email"
                value={email}
                title={t('login.email')}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                aria-describedby={error ? 'login-error' : undefined}
                aria-invalid={isFieldInvalid('email')}
              />
            </div>
            <PasswordInput
              id="password"
              label={t('login.password')}
              value={password}
              title={t('login.password')}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="current-password"
              ariaDescribedBy={error ? 'login-error' : undefined}
              ariaInvalid={isFieldInvalid('password')}
              lang={lang}
            />
            <button type="submit" disabled={isLoading} className="btn-primary-sm auth-submit-button">
              {isLoading ? t('login.form.submitting') : t('login.submit')}
            </button>
          </form>
          <div className="auth-links">
            <Link to={getPath('register', lang)}>{t('login.form.signupLink')}</Link>
            &nbsp;|&nbsp;
            <Link to={getPath('reset-request', lang)}>{t('login.form.forgotPassword')}</Link>
          </div>
        </>
      )}
    </div>
  );
};

export default LoginPage;
