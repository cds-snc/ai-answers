import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslations } from '../hooks/useTranslations.js';
import AuthService from '../services/AuthService.js';
import { getPath } from '../utils/routes.js';
import PasswordInput from '../components/auth/PasswordInput.js';
import AnnouncedError from '../components/auth/AnnouncedError.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import { useAuthFormValidation } from '../hooks/auth/useAuthFormValidation.js';
import { useAuthOutcomeMessages } from '../hooks/auth/useAuthOutcomeMessages.js';
import { useFocusOnChange } from '../hooks/useFocusOnChange.js';
import { meetsPasswordRule } from '../utils/auth/passwordRule.js';

const ResetCompletePage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const email = searchParams.get('email');
  const linkMissing = !code || !email;
  // The server refused the link (expired, used, replaced, or mangled). It
  // will never work again, so the form goes away and the page points to a
  // new link instead.
  const [linkRefused, setLinkRefused] = useState(false);
  const linkDead = linkMissing || linkRefused;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { successMessage, setSuccessMessage, systemError, setSystemError, clearMessages } = useAuthOutcomeMessages();
  const { error, errorCount, errorRef, setError, clearError, validate, isFieldInvalid } = useAuthFormValidation();
  const [isLoading, setIsLoading] = useState(false);

  // Every outcome here moves focus to its message (useFocusOnChange, the
  // mechanism AnnouncedError uses), because none has a focused control left
  // to stay on: a link missing parts is caught on mount, before the user has
  // done anything; and a submit disables the button (native disabled drops
  // focus to <body>), then either hides the form (success, refused link) or
  // leaves the user to start again. Focus reads the message, so neither box
  // is announced too. Counters, not booleans, so a repeat failure with the
  // same text moves focus again.
  const [errorFocusCount, setErrorFocusCount] = useState(0);
  const systemErrorRef = useFocusOnChange(errorFocusCount);
  const [successFocusCount, setSuccessFocusCount] = useState(0);
  const successRef = useFocusOnChange(successFocusCount);
  const showSystemError = (message) => {
    setSystemError(message);
    setErrorFocusCount((n) => n + 1);
  };

  useEffect(() => {
    if (!code || !email) {
      showSystemError(t('reset.complete.invalid'));
    }
  }, [code, email, t]);

  const submit = async (e) => {
    e && e.preventDefault();
    clearMessages();
    clearError();
    if (!validate({ password, confirm }, t)) {
      return;
    }
    if (!meetsPasswordRule(password)) {
      setError(t('reset.complete.passwordTooShort'), ['password']);
      return;
    }
    if (password !== confirm) {
      setError(t('reset.complete.passwordMismatch'), ['password', 'confirm']);
      return;
    }
    setIsLoading(true);
    try {
      await AuthService.resetPassword({ email, code, password });
      setSuccessMessage(t('reset.complete.success'));
      setSuccessFocusCount((n) => n + 1);
    } catch (err) {
      // The server refused the password. The page checks the same rule first,
      // so this only happens with a stale page bundle; it's still the
      // password's fault, so it's a field error like the page's own check.
      if (err.code === 'PASSWORD_RULE') {
        setError(t('reset.complete.passwordTooShort'), ['password']);
        return;
      }
      // An invalid/expired reset link isn't something the user can fix by
      // editing password/confirm — a system-level outcome, not a field error,
      // so it goes through StatusMessage, not AnnouncedError.
      if (err.code === 'RESET_INVALID_CODE') {
        setLinkRefused(true);
        showSystemError(t('reset.complete.invalidCode'));
        return;
      }
      showSystemError(t('reset.complete.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-login-container">
      <h1>{t('reset.complete.title')}</h1>
      {/* Both boxes are focused when they appear (see errorFocusCount), which
          reads them, so neither is announced too. */}
      <StatusMessage
        variant="success"
        message={successMessage}
        ref={successRef}
        tabIndex={-1}
        className="focus-target"
        announce={false}
        announcedVia="focus"
      />
      <StatusMessage
        variant="error"
        message={systemError}
        ref={systemErrorRef}
        tabIndex={-1}
        className="focus-target"
        announce={false}
        announcedVia="focus"
      />
      {error && (
        <AnnouncedError id="reset-complete-error" message={error} errorCount={errorCount} inputRef={errorRef} />
      )}
      {!linkDead && !successMessage && (
        <form onSubmit={submit} noValidate>
          {/* No code/OTP field — link verification is sufficient to set a new password */}
          <PasswordInput
            id="password"
            name="password"
            label={t('reset.complete.password')}
            hint={t('auth.passwordHint')}
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
        {linkDead && (
          <>
            <Link to={getPath('reset-request', lang)}>{t('reset.complete.requestNewLink')}</Link>
            &nbsp;|&nbsp;
          </>
        )}
        <Link to={getPath('signin', lang)}>{t('login.form.signinLink')}</Link>
      </div>
    </div>
  );
};

export default ResetCompletePage;
