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
import { GcdsNotice, GcdsText } from '@gcds-core/components-react';

const LoginPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const navigate = useNavigate();
  const location = useLocation();
  const { login, refreshUser, getDefaultRouteForRole } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, errorCount, errorRef, setError, clearError, validate, isFieldInvalid } = useAuthFormValidation();
  const [isLoading, setIsLoading] = useState(false);
  const sessionExpired = new URLSearchParams(location.search).get('reason') === 'session-expired';

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
      navigate(location.pathname, { replace: true });
    }
    setIsLoading(true);
    try {
      const data = await login(trimmedEmail, password);
      // If backend requires two-step verification, backend already sent the email; prompt for code
      if (data && data.twoFA) {
        setShowTwoStep(true);
        return;
      }
      const defaultRoute = data?.defaultRoute || '/';
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
  // new view's intro text — role="status" also announces it as a live
  // region, matching FeedbackComponent's thank-you-message pattern.
  // NOTE: showTwoStep stays `true` across a resend (requestTwoStep calls
  // setShowTwoStep(true) again, a no-op), so this effect won't refire then —
  // don't rely on it to announce resend-specific feedback.
  const twoStepIntroRef = useFocusOnChange(showTwoStep);

  const verifyTwoStep = async () => {
    setIsLoading(true);
    clearTwoStepError();
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
      {sessionExpired && (
        <GcdsNotice
          noticeRole="warning"
          noticeTitleTag="h2"
          noticeTitle={t('login.sessionExpired.title')}
          className="mb-400"
        >
          <GcdsText>{t('login.sessionExpired.message')}</GcdsText>
        </GcdsNotice>
      )}

      {/* When in 2FA flow show only the 2FA UI */}
      {showTwoStep ? (
        <div>
          <p role="status" tabIndex={-1} ref={twoStepIntroRef}>
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
