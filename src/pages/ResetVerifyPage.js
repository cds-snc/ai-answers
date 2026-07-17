import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslations } from '../hooks/useTranslations.js';
import { getPath } from '../utils/routes.js';
import AnnouncedError from '../components/auth/AnnouncedError.js';
import { useAnnouncedError } from '../hooks/auth/useAnnouncedError.js';


const ResetVerifyPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const email = searchParams.get('email');
  const [mode, setMode] = useState('unknown');
  const { error, errorCount, errorRef, setError } = useAnnouncedError();
  const [isLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect directly to reset-complete with code and email
    if (!code || !email) {
      setError(t('reset.verify.invalidLink'));
      setMode('invalid');
      return;
    }
    setMode('ready');
  }, [code, email, t]);
  const gotoSetPassword = () => {
    // Navigate to set-password screen; pass code and email via query
    navigate(`${getPath('reset-complete', lang)}?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`);
  };

  return (
    <div className="auth-login-container">
      <h1>{t('reset.verify.title')}</h1>
      {mode === 'invalid' && (
        <AnnouncedError id="reset-verify-error" message={error} errorCount={errorCount} inputRef={errorRef} />
      )}
      {mode === 'ready' && (
        <>
          <p>{t('reset.verify.instructionsNoOtp')}</p>

          <div>
            <button className="btn-primary-sm auth-submit-button" onClick={gotoSetPassword} disabled={isLoading}>{t('reset.verify.continue')}</button>
          </div>

          <div className="auth-links">
            <Link to={getPath('signin', lang)}>{t('login.form.signinLink')}</Link>
          </div>
        </>
      )}
    </div>
  );
};

export default ResetVerifyPage;
