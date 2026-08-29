import React, { useState } from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import AuthService from '../services/AuthService.js';
import { Link } from 'react-router-dom';
import { getPath } from '../utils/routes.js';
import AnnouncedError from '../components/auth/AnnouncedError.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import { useAuthFormValidation } from '../hooks/auth/useAuthFormValidation.js';
import { useAuthOutcomeMessages } from '../hooks/auth/useAuthOutcomeMessages.js';
import { normalizeEmail } from '../utils/auth/validateEmail.js';

const ResetRequestPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [email, setEmail] = useState('');
  const { successMessage, setSuccessMessage, systemError, setSystemError, clearMessages } = useAuthOutcomeMessages();
  const { error, errorCount, errorRef, setError, clearError, validate, isFieldInvalid } = useAuthFormValidation();
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (e) => {
    e && e.preventDefault();
    clearMessages();
    clearError();
    const trimmedEmail = normalizeEmail(email);
    if (!validate({ email: trimmedEmail }, t)) {
      return;
    }
    setIsLoading(true);
    try {
      await AuthService.sendReset(trimmedEmail, lang);
      setSuccessMessage(t('reset.request.sent'));
    } catch {
      setSystemError(t('reset.request.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-login-container">
      <h1>{t('reset.request.title')}</h1>
      <StatusMessage variant="success" message={successMessage} />
      <StatusMessage variant="error" message={systemError} />
      {error && (
        <AnnouncedError id="reset-request-error" message={error} errorCount={errorCount} inputRef={errorRef} />
      )}
      {!successMessage && (
        <form onSubmit={submit} noValidate>
          <div className="auth-form-group">
            <label htmlFor="email">{t('login.email')}</label>
            <input
              id="email"
              type="email"
              value={email}
              title={t('login.email')}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              aria-describedby={error ? 'reset-request-error' : undefined}
              aria-invalid={isFieldInvalid('email')}
            />
          </div>
          <button type="submit" className="btn-primary-sm auth-submit-button" disabled={isLoading}>{isLoading ? t('reset.request.sending') : t('reset.request.send')}</button>
        </form>
      )}
      <div className="auth-links">
        <Link to={getPath('signin', lang)}>{t('login.form.signinLink')}</Link>
      </div>
    </div>
  );
};

export default ResetRequestPage;
