import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslations } from '../hooks/useTranslations.js';
import { getPath } from '../utils/routes.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import { useFocusOnChange } from '../hooks/useFocusOnChange.js';


const ResetVerifyPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const email = searchParams.get('email');
  const [mode, setMode] = useState('unknown');
  // A broken link is a status, not a form error. Shown on mount with nothing
  // the user just did to anchor it, so focus moves here (as ResetCompletePage).
  const invalidLinkRef = useFocusOnChange(mode === 'invalid');
  const [isLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect directly to reset-complete with code and email
    if (!code || !email) {
      setMode('invalid');
      return;
    }
    setMode('ready');
  }, [code, email]);
  const gotoSetPassword = () => {
    // Navigate to set-password screen; pass code and email via query
    navigate(`${getPath('reset-complete', lang)}?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`);
  };

  return (
    <div className="auth-login-container">
      <h1>{t('reset.verify.title')}</h1>
      {/* announce={false}: focus landing on it already reads it. */}
      {mode === 'invalid' && (
        <StatusMessage
          variant="error"
          message={t('reset.verify.invalidLink')}
          ref={invalidLinkRef}
          tabIndex={-1}
          announce={false}
          announcedVia="focus"
        />
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
