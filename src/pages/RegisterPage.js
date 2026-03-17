import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthService from '../services/AuthService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { getPath } from '../utils/routes.js';
import styles from '../styles/auth.module.css';

const RegisterPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('signup.passwordMismatch'));
      return;
    }

    if (password.length < 8) {
      setError(t('signup.passwordTooShort'));
      return;
    }

    setIsLoading(true);
    try {
      await AuthService.signup(email, password);
      navigate(getPath('admin', lang));
    } catch (err) {
      setError(err.message || t('signup.errorOccurred'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.signup_container}>
      <h1>{t('signup.title')}</h1>
      {error && <div className={styles.error_message}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className={styles.form_group}>
          <label htmlFor="email">{t('signup.email')}</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => { e.target.setCustomValidity(''); setEmail(e.target.value); }}
            onInvalid={(e) => e.target.setCustomValidity(e.target.validity.typeMismatch ? t('validation.emailInvalid') : t('validation.required'))}
            required
            disabled={isLoading}
          />
        </div>
        <div className={styles.form_group}>
          <label htmlFor="password">{t('signup.password')}</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => { e.target.setCustomValidity(''); setPassword(e.target.value); }}
            onInvalid={(e) => e.target.setCustomValidity(t('validation.required'))}
            required
            disabled={isLoading}
          />
        </div>
        <div className={styles.form_group}>
          <label htmlFor="confirmPassword">{t('signup.confirmPassword')}</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => { e.target.setCustomValidity(''); setConfirmPassword(e.target.value); }}
            onInvalid={(e) => e.target.setCustomValidity(t('validation.required'))}
            required
            disabled={isLoading}
          />
        </div>
        <button type="submit" disabled={isLoading} className={styles.submit_button}>
          {isLoading ? t('signup.form.submitting') : t('signup.submit')}
        </button>
      </form>
    </div>
  );
};

export default RegisterPage;