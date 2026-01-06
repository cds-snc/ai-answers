import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslations } from '../hooks/useTranslations.js';
import AuthService from '../services/AuthService.js';
import styles from '../styles/auth.module.css';

const ResetVerifyPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const email = searchParams.get('email');
  const [mode, setMode] = useState('unknown');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect directly to reset-complete with code and email
    if (!code || !email) {
      setMessage(t('reset.verify.invalidLink') || 'Invalid or missing reset link');
      setMode('invalid');
      return;
    }
    setMode('ready');
  }, [code, email, t]);
  const gotoSetPassword = () => {
    // Navigate to set-password screen; pass code and email via query
    navigate(`/${lang}/reset-complete?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`);
  };

  return (
    <div className={styles.login_container}>
      <h1>{t('reset.verify.title') || 'Verify reset'}</h1>
      {message && <div className={styles.info_message}>{message}</div>}
      {mode === 'invalid' && <div>{t('reset.verify.invalidLink') || 'Invalid link'}</div>}
      {mode === 'ready' && (
        <>
          <p>{t('reset.verify.instructionsNoOtp') || 'Click continue to set a new password.'}</p>

          <div className={styles.twofa_actions}>
            <button className={styles.submit_button} onClick={gotoSetPassword} disabled={isLoading}>{t('reset.verify.continue') || 'Continue'}</button>
          </div>

          <div className={styles['auth-links']}>
            <Link to={`/${lang}/signin`}>{t('login.form.signinLink') || 'Back to sign in'}</Link>
          </div>
        </>
      )}
    </div>
  );
};

export default ResetVerifyPage;
