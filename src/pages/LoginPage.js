import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import AuthService from '../services/AuthService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { getPath } from '../utils/routes.js';
import PasswordInput from '../components/auth/PasswordInput.js';
import AnnouncedError from '../components/auth/AnnouncedError.js';
import { useAnnouncedError } from '../hooks/auth/useAnnouncedError.js';
import { GcdsNotice, GcdsText } from '@gcds-core/components-react';

const LoginPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const navigate = useNavigate();
  const location = useLocation();
  const { login, refreshUser, getDefaultRouteForRole } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, errorCount, errorRef, setError, clearError } = useAnnouncedError();
  const [isLoading, setIsLoading] = useState(false);
  const sessionExpired = new URLSearchParams(location.search).get('reason') === 'session-expired';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    clearError();
    // If 2FA flow already started, ignore normal submit
    if (showTwoStep) {
      setIsLoading(false);
      return;
    }
    try {
      const data = await login(email, password);
      // If backend requires two-step verification, backend already sent the email; prompt for code
      if (data && data.twoFA) {
        setShowTwoStep(true);
        return;
      }
      const defaultRoute = data?.defaultRoute || '/';
      navigate(defaultRoute);
    } catch (err) {
      setError(t('login.invalidCredentials'));
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
    clearError();
    try {
      // backend method remains send2FA
      await AuthService.send2FA(email);
      setShowTwoStep(true);
    } catch (err) {
      setError(t('login.2fa.sendError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-login-container">
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
          <h2>{t('login.2fa.title')}</h2>
          <p>{t('login.2fa.sentToEmail')}</p>
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
            <input id="code" value={code} onChange={(e) => setCode(e.target.value)} disabled={isLoading} />
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
          <h1>{t('login.title')}</h1>
          {error && (
            <AnnouncedError id="login-error" message={error} errorCount={errorCount} inputRef={errorRef} />
          )}
          <form onSubmit={handleSubmit}>
            <div className="auth-form-group">
              <label htmlFor="email">{t('login.email')}</label>
              <input
                type="email"
                id="email"
                value={email}
                title={t('login.email')}
                onChange={(e) => { e.target.setCustomValidity(''); setEmail(e.target.value); }}
                onInvalid={(e) => e.target.setCustomValidity(e.target.validity.typeMismatch ? t('validation.emailInvalid') : t('validation.required'))}
                required
                disabled={isLoading}
              />
            </div>
            <PasswordInput
              id="password"
              label={t('login.password')}
              value={password}
              title={t('login.password')}
              onChange={(e) => { e.target.setCustomValidity(''); setPassword(e.target.value); }}
              onInvalid={(e) => e.target.setCustomValidity(t('validation.required'))}
              required
              disabled={isLoading}
              autoComplete="current-password"
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
