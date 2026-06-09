import { useState } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';

const EyeOpen = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeClosed = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const PasswordInput = ({ id, label, value, onChange, onInvalid, title, required, disabled, autoComplete, lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="auth-form-group">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-wrapper">
        <input
          type={showPassword ? 'text' : 'password'}
          id={id}
          value={value}
          title={title}
          onChange={onChange}
          onInvalid={onInvalid}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((prev) => !prev)}
          disabled={disabled}
        >
          {showPassword ? <EyeClosed /> : <EyeOpen />}
        </button>
      </div>
    </div>
  );
};

export default PasswordInput;
