import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AuthService from '../services/AuthService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { getPath } from '../utils/routes.js';
import PasswordInput from '../components/auth/PasswordInput.js';
import AnnouncedError from '../components/auth/AnnouncedError.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import { useAuthFormValidation } from '../hooks/auth/useAuthFormValidation.js';
import { useAuthOutcomeMessages } from '../hooks/auth/useAuthOutcomeMessages.js';
import { normalizeEmail } from '../utils/auth/validateEmail.js';

const RegisterPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { successMessage, setSuccessMessage, systemError, setSystemError, clearMessages } = useAuthOutcomeMessages();
  const { error, errorCount, errorRef, setError, clearError, validate, isFieldInvalid } = useAuthFormValidation();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearMessages();
    clearError();

    const trimmedEmail = normalizeEmail(email);
    if (!validate({ email: trimmedEmail, password, confirmPassword }, t)) {
      return;
    }

    if (password !== confirmPassword) {
      setError(t('signup.passwordMismatch'), ['password', 'confirmPassword']);
      return;
    }

    if (password.length < 8) {
      setError(t('signup.passwordTooShort'), ['password']);
      return;
    }

    setIsLoading(true);
    try {
      const data = await AuthService.signup(trimmedEmail, password);
      if (data.user?.active) {
        navigate(getPath('admin', lang));
      } else {
        // Just a truthy flag here, not display text - the two sentences
        // below are rendered as separate <p>s via StatusMessage's
        // `children` escape hatch (one string can't become two paragraphs).
        setSuccessMessage(true);
      }
    } catch {
      // Never show err.message here — often just raw, always-English
      // browser/fetch error text (e.g. "Failed to fetch"), and showing the
      // specific reason (e.g. "email already exists") would double as an
      // account-enumeration oracle. Always the generic translated message.
      setSystemError(t('signup.errorOccurred'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-signup-container">
      <h1>{t('signup.title')}</h1>
      <StatusMessage variant="success">
        {successMessage && (
          <>
            <p>{t('signup.pendingReceived')}</p>
            <p>{t('signup.pendingActivation')}</p>
          </>
        )}
      </StatusMessage>
      <StatusMessage variant="error" message={systemError} />
      {error && (
        <AnnouncedError id="signup-error" message={error} errorCount={errorCount} inputRef={errorRef} />
      )}
      {!successMessage && (
        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-form-group">
            <label htmlFor="email">{t('signup.email')}</label>
            <input
              type="email"
              id="email"
              value={email}
              title={t('signup.email')}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              aria-describedby={error ? 'signup-error' : undefined}
              aria-invalid={isFieldInvalid('email')}
            />
          </div>
          <PasswordInput
            id="password"
            name="password"
            label={t('signup.password')}
            value={password}
            title={t('signup.password')}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="new-password"
            ariaDescribedBy={error ? 'signup-error' : undefined}
            ariaInvalid={isFieldInvalid('password')}
            lang={lang}
          />
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            label={t('signup.confirmPassword')}
            value={confirmPassword}
            title={t('signup.confirmPassword')}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="new-password"
            ariaDescribedBy={error ? 'signup-error' : undefined}
            ariaInvalid={isFieldInvalid('confirmPassword')}
            lang={lang}
          />
          <button type="submit" disabled={isLoading} className="btn-primary-sm auth-submit-button">
            {isLoading ? t('signup.submitting') : t('signup.submit')}
          </button>
        </form>
      )}
      {/* Only useful before submit (someone who landed here by mistake and
          already has an account). Once signup succeeds, the account is
          pending approval - there's nothing to sign into yet, an email is
          what tells them when that changes - so the link would just be a
          dead end here. */}
      {!successMessage && (
        <div className="auth-links">
          <Link to={getPath('signin', lang)}>{t('login.form.signinLink')}</Link>
        </div>
      )}
    </div>
  );
};

export default RegisterPage;