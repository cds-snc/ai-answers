import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthService from '../services/AuthService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { getPath } from '../utils/routes.js';
import PasswordInput from '../components/auth/PasswordInput.js';

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
    <div className="auth-signup-container">
      <h1>{t('signup.title')}</h1>
      {error && <div className="auth-error-message">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="auth-form-group">
          <label htmlFor="email">{t('signup.email')}</label>
          <input
            type="email"
            id="email"
            value={email}
            title={t('signup.email')}
            onChange={(e) => { e.target.setCustomValidity(''); setEmail(e.target.value); }}
            onInvalid={(e) => e.target.setCustomValidity(e.target.validity.typeMismatch ? t('validation.emailInvalid') : t('validation.required'))}
            required
            disabled={isLoading}
          />
        </div>
        <PasswordInput
          id="password"
          name="password"
          label={t('signup.password')}
          value={password}
          title={t('signup.password')}
          onChange={(e) => { e.target.setCustomValidity(''); setPassword(e.target.value); }}
          onInvalid={(e) => e.target.setCustomValidity(t('validation.required'))}
          required
          disabled={isLoading}
          autoComplete="new-password"
          lang={lang}
        />
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          label={t('signup.confirmPassword')}
          value={confirmPassword}
          title={t('signup.confirmPassword')}
          onChange={(e) => { e.target.setCustomValidity(''); setConfirmPassword(e.target.value); }}
          onInvalid={(e) => e.target.setCustomValidity(t('validation.required'))}
          required
          disabled={isLoading}
          autoComplete="new-password"
          lang={lang}
        />
        <button type="submit" disabled={isLoading} className="btn-primary-sm auth-submit-button">
          {isLoading ? t('signup.submitting') : t('signup.submit')}
        </button>
      </form>
    </div>
  );
};

export default RegisterPage;