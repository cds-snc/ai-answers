import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import AuthService from '../services/AuthService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import styles from '../styles/auth.module.css';

const LoginPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const navigate = useNavigate();
  const { login, refreshUser, getDefaultRouteForRole } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
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
  const [twoStepError, setTwoStepError] = useState('');

  const verifyTwoStep = async () => {
    setIsLoading(true);
    setTwoStepError('');
    try {
      // backend method remains verify2FA
      const data = await AuthService.verify2FA(email, code);
      // AuthService stores token and user; refresh context
      await refreshUser();
      // Prefer explicit defaultRoute from the verify response if present
      let defaultRoute = data?.defaultRoute;
      // Otherwise compute from returned user role (or fallback to '/')
      if (!defaultRoute && data?.user?.role) {
        defaultRoute = getDefaultRouteForRole(data.user.role);
      }
      if (!defaultRoute) defaultRoute = '/';
      navigate(defaultRoute);
    } catch (err) {
      setTwoStepError(t('login.2fa.invalidCode') || 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  // Request a verification code to be sent to the user's email (public endpoint)
  const requestTwoStep = async () => {
    if (!email) return;
    setIsLoading(true);
    setError('');
    try {
      // backend method remains send2FA
      await AuthService.send2FA(email);
      setShowTwoStep(true);
    } catch (err) {
      setError(t('login.2fa.sendError') || 'Failed to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.login_container}>
      {/* When in 2FA flow show only the 2FA UI */}
      {showTwoStep ? (
        <div className={styles.twofa_container}>
          <h2>{t('login.2fa.title') || 'Two-factor authentication'}</h2>
          <p className={styles.info_message}>{t('login.2fa.sentToEmail') || 'A verification code will be sent to your email.'}</p>
          {twoStepError && <div className={styles.error_message}>{twoStepError}</div>}
          <div className={styles.form_group}>
            <label htmlFor="code">{t('login.2fa.code') || 'Verification code'}</label>
            <input id="code" value={code} onChange={(e) => setCode(e.target.value)} disabled={isLoading} />
          </div>
          <div className={styles.twofa_actions}>
            <button onClick={verifyTwoStep} disabled={isLoading} className={styles.submit_button}>
              {t('login.2fa.verify') || 'Verify code'}
            </button>
            <button onClick={requestTwoStep} disabled={isLoading || !email} className={styles.secondary_button}>
              {t('login.2fa.resend') || 'Resend code'}
            </button>
          </div>
        </div>
      ) : (
        // Default login form with signup link when not in 2FA flow
        <>
          <h1>{t('login.title')}</h1>
          {error && <div className={styles.error_message}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className={styles.form_group}>
              <label htmlFor="email">{t('login.email')}</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className={styles.form_group}>
              <label htmlFor="password">{t('login.password')}</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <button type="submit" disabled={isLoading} className={styles.submit_button}>
              {isLoading ? t('login.form.submitting') : t('login.submit')}
            </button>
          </form>
          <div className={styles['auth-links']}>
            <Link to={`/${lang}/signup`}>{t('login.form.signupLink')}</Link>
            &nbsp;|&nbsp;
            <Link to={`/${lang}/reset-request`}>{t('login.form.forgotPassword') || 'Forgot password?'}</Link>
          </div>
        </>
      )}
    </div>
  );
};

export default LoginPage;