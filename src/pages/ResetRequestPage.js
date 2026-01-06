import React, { useState } from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import AuthService from '../services/AuthService.js';
import styles from '../styles/auth.module.css';
import { Link, useNavigate } from 'react-router-dom';

const ResetRequestPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e && e.preventDefault();
    setIsLoading(true);
    setMessage('');
    try {
      await AuthService.sendReset(email, lang);
      setMessage(t('reset.request.sent') || 'If that account exists, we sent a reset email.');
      // Optionally redirect to signin after a short delay
      setTimeout(() => navigate(`/${lang}/signin`), 3000);
    } catch (err) {
      setMessage(t('reset.request.error') || 'Failed to request reset');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.login_container}>
      <h1>{t('reset.request.title') || 'Reset your password'}</h1>
      {message && <div className={styles.info_message}>{message}</div>}
      <form onSubmit={submit}>
        <div className={styles.form_group}>
          <label htmlFor="email">{t('login.email')}</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoading} />
        </div>
        <button type="submit" className={styles.submit_button} disabled={isLoading}>{isLoading ? t('reset.request.sending') || 'Sending...' : t('reset.request.send') || 'Send reset email'}</button>
      </form>
      <div className={styles['auth-links']}>
        <Link to={`/${lang}/signin`}>{t('login.form.signinLink') || 'Back to sign in'}</Link>
      </div>
    </div>
  );
};

export default ResetRequestPage;
