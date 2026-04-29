import React, { useState } from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import AuthService from '../services/AuthService.js';
import styles from '../styles/auth.module.css';
import { Link, useNavigate } from 'react-router-dom';
import { getPath } from '../utils/routes.js';

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
      setMessage(t('reset.request.sent'));
      // Optionally redirect to signin after a short delay
      setTimeout(() => navigate(getPath('signin', lang)), 3000);
    } catch (err) {
      setMessage(t('reset.request.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.login_container}>
      <h1>{t('reset.request.title')}</h1>
      {message && <div className={styles.info_message}>{message}</div>}
      <form onSubmit={submit}>
        <div className={styles.form_group}>
          <label htmlFor="email">{t('login.email')}</label>
          <input
            id="email"
            type="email"
            value={email}
            title={t('login.email')}
            onChange={(e) => { e.target.setCustomValidity(''); setEmail(e.target.value); }}
            onInvalid={(e) => e.target.setCustomValidity(e.target.validity.typeMismatch ? t('validation.emailInvalid') : t('validation.required'))}
            required
            disabled={isLoading}
          />
        </div>
        <button type="submit" className={styles.submit_button} disabled={isLoading}>{isLoading ? t('reset.request.sending') : t('reset.request.send')}</button>
      </form>
      <div className={styles['auth-links']}>
        <Link to={getPath('signin', lang)}>{t('login.form.signinLink')}</Link>
      </div>
    </div>
  );
};

export default ResetRequestPage;
