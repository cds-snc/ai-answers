import React, { useEffect, useState } from 'react';
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
import { normalizeTwoFACode } from '../utils/auth/twoFACode.js';
import { useFocusOnChange } from '../hooks/useFocusOnChange.js';
import StatusMessage, { useRepeatableStatus } from '../components/admin/StatusMessage.js';
import { announce } from '../utils/liveAnnouncer.js';
import { buildPageTitle } from '../config/pageTitle.js';

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

  // Sign-in outcomes no field is at fault for (server/connection failure,
  // lockout, timed-out session, a resend's result). A status, not a form
  // error: wrong email/password and wrong code stay on AnnouncedError.
  // The buttons disable while working, which drops focus to <body>, so focus
  // moves onto the message (focus reads it, so announce={false}). Repeatable,
  // so the same message twice in a row is read again.
  const { message: statusText, variant: statusVariant, nonce: statusNonce, announce: showStatus, clear: clearStatus } = useRepeatableStatus();
  const statusRef = useFocusOnChange(statusNonce);
  const statusBox = (
    <StatusMessage
      variant={statusVariant}
      message={statusText}
      className="mb-400"
      ref={statusRef}
      tabIndex={-1}
      announce={false}
      announcedVia="focus"
    />
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    clearStatus();
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
      // The login response carries only email/role/active; institution,
      // group and the dashboard filter preferences come from auth-me. Re-read
      // it before landing, as the two-step path below does, or the first
      // dashboard opens unfiltered even with a preference on.
      await refreshUser();
      const defaultRoute = data?.defaultRoute || '/';
      // A plain navigate(): the landing page gets the same focus-to-<main>
      // treatment as every other client-side route change
      // (useRouteChangeFocus). Skipping it left a screen-reader user parked
      // wherever the old page's cursor was, with nothing read.
      navigate(defaultRoute);
    } catch (err) {
      // Only a correct password reaches the 2FA step, so these reasons say
      // nothing about the account that the code screen wouldn't. A wrong
      // password, an unknown email and a password lockout all stay identical.
      const messages = {
        locked: 'login.2fa.locked',
        send_failed: 'login.2fa.sendError',
        server_error: 'login.serverError',
        network: 'login.networkError',
      };
      if (messages[err.reason]) {
        showStatus(t(messages[err.reason]), { variant: 'error' });
      } else {
        setError(t('login.invalidCredentials'), ['email', 'password']);
      }
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

  // Same URL as sign in, so App.js's route title can't tell the steps apart.
  useEffect(() => {
    if (!showTwoStep) return undefined;
    document.title = buildPageTitle(t('login.2fa.pageTitle'), lang);
    return () => { document.title = buildPageTitle(t('login.title'), lang); };
  }, [showTwoStep, lang, t]);

  // The sign-in session behind the code screen has lapsed (or the account
  // changed). A new code can't help, so go back to the password form and say why.
  const restartSignIn = () => {
    setShowTwoStep(false);
    setCode('');
    setPassword('');
    clearTwoStepError();
    showStatus(t('login.2fa.expired'), { variant: 'error' });
  };

  const verifyTwoStep = async (e) => {
    e.preventDefault();
    clearTwoStepError();
    clearStatus();
    // Checked here like the password form's empty fields, with the same rule
    // the server uses: a typo isn't sent, so it can't count toward the lockout.
    const normalizedCode = normalizeTwoFACode(code);
    if (!normalizedCode) {
      setTwoStepError(t('login.2fa.codeFormat'));
      return;
    }
    setIsLoading(true);
    // Same reasoning as handleSubmit's announce().
    announce(t('login.form.submitting'), { skippable: true });
    try {
      // backend method remains verify2FA
      const data = await AuthService.verify2FA(normalizedCode);
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
      if (err.reason === 'expired') {
        restartSignIn();
        return;
      }
      // Only a reason-less 4xx is a wrong code. A server or connection failure
      // says so, or the user retypes a correct code into the lockout count.
      const messages = { locked: 'login.2fa.locked', server_error: 'login.serverError', network: 'login.networkError' };
      if (messages[err.reason]) {
        showStatus(t(messages[err.reason]), { variant: 'error' });
      } else {
        setTwoStepError(t('login.2fa.invalidCode'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Ask for the verification code to be sent again (the server uses the sign-in session)
  const requestTwoStep = async () => {
    setIsLoading(true);
    clearTwoStepError();
    clearStatus();
    try {
      // backend method remains send2FA
      await AuthService.send2FA();
      setShowTwoStep(true);
      showStatus(t('login.2fa.resent'), { variant: 'success' });
    } catch (err) {
      if (err.reason === 'expired') {
        restartSignIn();
        return;
      }
      // The server refuses a resend within a minute of the last code (the one
      // sent at sign-in counts) and while 2FA is locked. Say so, not "failed".
      const messages = { cooldown: 'login.2fa.cooldown', locked: 'login.2fa.locked', network: 'login.networkError' };
      showStatus(t(messages[err.reason] || 'login.2fa.sendError'), { variant: 'error' });
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
          announcedVia="focus"
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
          {statusBox}
          {twoStepError && (
            <AnnouncedError
              id="login-2fa-error"
              message={twoStepError}
              errorCount={twoStepErrorCount}
              inputRef={twoStepErrorRef}
            />
          )}
          {/* A form so Enter in the field verifies, as on the password step.
              Resend is type="button" so it never submits. */}
          <form onSubmit={verifyTwoStep} noValidate>
            <div className="auth-form-group">
              <label htmlFor="code">{t('login.2fa.code')}</label>
              <p id="login-2fa-code-hint" className="field-hint">{t('login.2fa.codeHint')}</p>
              {/* inputMode/autoComplete: number pad and emailed-code autofill on
                  phones. No maxLength: it would silently cut a pasted code. */}
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isLoading}
                aria-required="true"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-describedby={twoStepError ? 'login-2fa-code-hint login-2fa-error' : 'login-2fa-code-hint'}
                aria-invalid={!!twoStepError}
              />
            </div>
            <div>
              <button type="submit" disabled={isLoading} className="btn-primary-sm auth-submit-button">
                {t('login.2fa.verify')}
              </button>
              <button type="button" onClick={requestTwoStep} disabled={isLoading} className="btn-secondary-sm auth-secondary-button">
                {t('login.2fa.resend')}
              </button>
            </div>
          </form>
        </div>
      ) : (
        // Default login form with signup link when not in 2FA flow
        <>
          {statusBox}
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
