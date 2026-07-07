import React, { useState } from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import AuthService from '../services/AuthService.js';
import { Link, useNavigate } from 'react-router-dom';
import { getPath } from '../utils/routes.js';
import AnnouncedError from '../components/auth/AnnouncedError.js';
import { useAnnouncedError } from '../hooks/auth/useAnnouncedError.js';

const ResetRequestPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [email, setEmail] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const { error, errorCount, errorRef, setError, clearError } = useAnnouncedError();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e && e.preventDefault();
    setIsLoading(true);
    setSuccessMessage('');
    clearError();
    try {
      await AuthService.sendReset(email, lang);
      setSuccessMessage(t('reset.request.sent'));
      // Optionally redirect to signin after a short delay
      setTimeout(() => navigate(getPath('signin', lang)), 3000);
    } catch (err) {
      setError(t('reset.request.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-login-container">
      <h1>{t('reset.request.title')}</h1>
      {successMessage && (
        <p className="thank-you" role="status" aria-live="polite">
          <span className="gcds-icon fa fa-solid fa-check-circle" aria-hidden="true"></span>
          {successMessage}
        </p>
      )}
      {error && (
        <AnnouncedError id="reset-request-error" message={error} errorCount={errorCount} inputRef={errorRef} />
      )}
      <form onSubmit={submit}>
        <div className="auth-form-group">
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
        <button type="submit" className="btn-primary-sm auth-submit-button" disabled={isLoading}>{isLoading ? t('reset.request.sending') : t('reset.request.send')}</button>
      </form>
      <div className="auth-links">
        <Link to={getPath('signin', lang)}>{t('login.form.signinLink')}</Link>
      </div>
    </div>
  );
};

export default ResetRequestPage;
