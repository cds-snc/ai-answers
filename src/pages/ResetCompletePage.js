import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslations } from '../hooks/useTranslations.js';
import AuthService from '../services/AuthService.js';
import styles from '../styles/auth.module.css';

const ResetCompletePage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const initialCode = searchParams.get('code') || '';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token || !email) {
      setMessage(t('reset.complete.invalid') || 'Invalid reset link');
    }
  }, [token, email, t]);

  const submit = async (e) => {
    e && e.preventDefault();
    setMessage('');
    if (!password || password.length < 8) {
      setMessage(t('reset.complete.passwordTooShort') || 'Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setMessage(t('reset.complete.passwordMismatch') || 'Passwords do not match');
      return;
    }
    setIsLoading(true);
    try {
      // No OTP fallback: submit only email, token and new password. If the account has TOTP enabled
      // the server will return an error indicating 2FA is required.
      await AuthService.resetPassword({ email, token, password });
      setMessage(t('reset.complete.success') || 'Password updated. Redirecting to sign in...');
      setTimeout(() => navigate(`/${lang}/signin`), 2500);
    } catch (err) {
      setMessage(err.message || t('reset.complete.error') || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.login_container}>
      <h1>{t('reset.complete.title') || 'Set a new password'}</h1>
      {message && <div className={styles.info_message}>{message}</div>}
      <form onSubmit={submit}>
        {/* No code/OTP field — link verification is sufficient to set a new password */}
        <div className={styles.form_group}>
          <label htmlFor="password">{t('reset.complete.password') || 'New password'}</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
        </div>

        <div className={styles.form_group}>
          <label htmlFor="confirm">{t('reset.complete.confirm') || 'Confirm new password'}</label>
          <input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={isLoading} />
        </div>

        <button type="submit" className={styles.submit_button} disabled={isLoading || !token || !email}>{isLoading ? t('reset.request.sending') || 'Sending...' : t('reset.complete.submit') || 'Set password'}</button>
      </form>
      <div className={styles['auth-links']}>
        <Link to={`/${lang}/signin`}>{t('login.form.signinLink') || 'Back to sign in'}</Link>
      </div>
    </div>
  );
};

export default ResetCompletePage;
