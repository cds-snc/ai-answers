import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslations } from '../hooks/useTranslations.js';
import AuthService from '../services/AuthService.js';
import { getPath } from '../utils/routes.js';
import PasswordInput from '../components/auth/PasswordInput.js';
import AnnouncedError from '../components/auth/AnnouncedError.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import { useAuthFormValidation } from '../hooks/auth/useAuthFormValidation.js';
import { resolveErrorMessage } from '../utils/errorCodeMessage.js';
import { useAuthOutcomeMessages } from '../hooks/auth/useAuthOutcomeMessages.js';
import { useFocusOnChange } from '../hooks/useFocusOnChange.js';

const ResetCompletePage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const email = searchParams.get('email');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { successMessage, setSuccessMessage, systemError, setSystemError, clearMessages } = useAuthOutcomeMessages();
  const { error, errorCount, errorRef, setError, clearError, validate, isFieldInvalid } = useAuthFormValidation();
  const [isLoading, setIsLoading] = useState(false);

  // The invalid-link check fires once, on mount, before the user has done
  // anything — unlike the submit-driven system errors below (which sit right
  // next to the button the user just clicked), there's nothing nearby to
  // anchor a sighted or keyboard user's attention, and no interaction to
  // signal a screen reader was already paying attention to this part of the
  // page. So this one case gets an explicit focus-move, same mechanism
  // AnnouncedError uses (useFocusOnChange), just pointed at this
  // StatusMessage instead — a dedicated counter keeps it from also firing
  // for the unrelated submit-time errors sharing the same systemError state.
  const [invalidLinkCount, setInvalidLinkCount] = useState(0);
  const invalidLinkRef = useFocusOnChange(invalidLinkCount);

  useEffect(() => {
    if (!code || !email) {
      setSystemError(t('reset.complete.invalid'));
      setInvalidLinkCount((n) => n + 1);
    }
  }, [code, email, t]);

  const submit = async (e) => {
    e && e.preventDefault();
    clearMessages();
    clearError();
    if (!validate({ password, confirm }, t)) {
      return;
    }
    if (password.length < 8) {
      setError(t('reset.complete.passwordTooShort'), ['password']);
      return;
    }
    if (password !== confirm) {
      setError(t('reset.complete.passwordMismatch'), ['password', 'confirm']);
      return;
    }
    setIsLoading(true);
    try {
      // TOTP-based password reset
      await AuthService.resetPassword({ email, code, password });
      setSuccessMessage(t('reset.complete.success'));
    } catch (err) {
      // Rate-limiting and an invalid/expired reset link aren't things the
      // user can fix by editing password/confirm — system-level outcomes,
      // not field errors, so they go through StatusMessage, not AnnouncedError.
      setSystemError(resolveErrorMessage(err.code, {
        RESET_LOCKED_OUT: 'reset.complete.lockedOut',
        RESET_INVALID_CODE: 'reset.complete.invalidCode',
      }, 'reset.complete.error', t));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-login-container">
      <h1>{t('reset.complete.title')}</h1>
      <StatusMessage variant="success" message={successMessage} />
      {/* announce={false}: focus is moved here on mount (invalidLinkRef), and
          focus landing on it already reads it — a live announcement on top
          would be a double read. */}
      <StatusMessage variant="error" message={systemError} ref={invalidLinkRef} tabIndex={-1} announce={false} announcedVia="focus" />
      {error && (
        <AnnouncedError id="reset-complete-error" message={error} errorCount={errorCount} inputRef={errorRef} />
      )}
      {code && email && !successMessage && (
        <form onSubmit={submit} noValidate>
          {/* No code/OTP field — link verification is sufficient to set a new password */}
          <PasswordInput
            id="password"
            name="password"
            label={t('reset.complete.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="new-password"
            ariaDescribedBy={error ? 'reset-complete-error' : undefined}
            ariaInvalid={isFieldInvalid('password')}
            lang={lang}
          />
          <PasswordInput
            id="confirm"
            name="confirm"
            label={t('reset.complete.confirm')}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="new-password"
            ariaDescribedBy={error ? 'reset-complete-error' : undefined}
            ariaInvalid={isFieldInvalid('confirm')}
            lang={lang}
          />

          <button type="submit" className="btn-primary-sm auth-submit-button" disabled={isLoading}>{isLoading ? t('reset.request.sending') : t('reset.complete.submit')}</button>
        </form>
      )}
      <div className="auth-links">
        <Link to={getPath('signin', lang)}>{t('login.form.signinLink')}</Link>
      </div>
    </div>
  );
};

export default ResetCompletePage;
