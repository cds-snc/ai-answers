import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslations } from '../hooks/useTranslations.js';
import AuthService from '../services/AuthService.js';
import { getPath } from '../utils/routes.js';
import PasswordInput from '../components/auth/PasswordInput.js';
import AnnouncedError from '../components/auth/AnnouncedError.js';
import { useAnnouncedError } from '../hooks/auth/useAnnouncedError.js';

const ResetCompletePage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const email = searchParams.get('email');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const { error, errorCount, errorRef, setError, clearError } = useAnnouncedError();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!code || !email) {
      setError(t('reset.complete.invalid'));
    }
  }, [code, email, t]);

  const submit = async (e) => {
    e && e.preventDefault();
    setSuccessMessage('');
    clearError();
    if (!password || password.length < 8) {
      setError(t('reset.complete.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('reset.complete.passwordMismatch'));
      return;
    }
    setIsLoading(true);
    try {
      // TOTP-based password reset
      await AuthService.resetPassword({ email, code, password });
      setSuccessMessage(t('reset.complete.success'));
      setTimeout(() => navigate(getPath('signin', lang)), 2500);
    } catch (err) {
      const errorKeys = {
        RESET_LOCKED_OUT: 'reset.complete.lockedOut',
        RESET_INVALID_CODE: 'reset.complete.invalidCode',
      };
      const key = err.code && errorKeys[err.code];
      setError(key ? t(key) : t('reset.complete.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-login-container">
      <h1>{t('reset.complete.title')}</h1>
      {successMessage && (
        <p className="thank-you" role="status" aria-live="polite">
          <span className="gcds-icon fa fa-solid fa-check-circle" aria-hidden="true"></span>
          {successMessage}
        </p>
      )}
      {error && (
        <AnnouncedError id="reset-complete-error" message={error} errorCount={errorCount} inputRef={errorRef} />
      )}
      <form onSubmit={submit}>
        {/* No code/OTP field — link verification is sufficient to set a new password */}
        <PasswordInput
          id="password"
          name="password"
          label={t('reset.complete.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          autoComplete="new-password"
          lang={lang}
        />
        <PasswordInput
          id="confirm"
          name="confirm"
          label={t('reset.complete.confirm')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={isLoading}
          autoComplete="new-password"
          lang={lang}
        />

        <button type="submit" className="btn-primary-sm auth-submit-button" disabled={isLoading || !code || !email}>{isLoading ? t('reset.request.sending') : t('reset.complete.submit')}</button>
      </form>
      <div className="auth-links">
        <Link to={getPath('signin', lang)}>{t('login.form.signinLink')}</Link>
      </div>
    </div>
  );
};

export default ResetCompletePage;
