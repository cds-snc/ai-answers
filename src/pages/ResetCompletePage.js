import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslations } from '../hooks/useTranslations.js';
import AuthService from '../services/AuthService.js';
import { getPath } from '../utils/routes.js';
import PasswordInput from '../components/auth/PasswordInput.js';
import AnnouncedError from '../components/auth/AnnouncedError.js';
import StatusMessage, { useRepeatableStatus } from '../components/admin/StatusMessage.js';
import { useAuthFormValidation } from '../hooks/auth/useAuthFormValidation.js';
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
  const { error, errorCount, errorRef, setError, clearError, validate, isFieldInvalid } = useAuthFormValidation();
  const [isLoading, setIsLoading] = useState(false);

  // Outcomes no field is at fault for (link missing parts, link refused,
  // failure, success). A status, not a form error. Every one moves focus to
  // the message, because none has a focused control left to stay on: a link
  // missing parts is caught on mount, before the user has done anything; and
  // a submit disables the button, which drops focus to <body>, then either
  // hides the form (success, refused link) or leaves it for a retry. Focus
  // reads the message, so announce={false}. Repeatable, so the same failure
  // twice in a row moves focus again. Same pattern as LoginPage.
  const { message: statusText, variant: statusVariant, nonce: statusNonce, announce: showStatus, clear: clearStatus } = useRepeatableStatus();
  const statusRef = useFocusOnChange(statusNonce);
  const succeeded = statusVariant === 'success';

  useEffect(() => {
    if (!code || !email) {
      showStatus(t('reset.complete.invalid'), { variant: 'error' });
    }
  }, [code, email, t, showStatus]);

  const submit = async (e) => {
    e && e.preventDefault();
    clearStatus();
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
      showStatus(t('reset.complete.success'), { variant: 'success' });
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
        showStatus(t('reset.complete.invalidCode'), { variant: 'error' });
        return;
      }
      showStatus(t('reset.complete.error'), { variant: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-login-container">
      <h1>{t('reset.complete.title')}</h1>
      <StatusMessage
        variant={statusVariant}
        message={statusText}
        ref={statusRef}
        tabIndex={-1}
        className="focus-target"
        announce={false}
        announcedVia="focus"
      />
      {error && (
        <AnnouncedError id="reset-complete-error" message={error} errorCount={errorCount} inputRef={errorRef} />
      )}
      {!linkDead && !succeeded && (
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
