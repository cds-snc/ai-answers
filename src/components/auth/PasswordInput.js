import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from '../../hooks/useTranslations.js';

const PasswordInput = ({ id, name, label, value, onChange, onInvalid, title, required, disabled, autoComplete, lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="auth-form-group">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-wrapper">
        <input
          type={showPassword ? 'text' : 'password'}
          id={id}
          name={name}
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
          {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
};

export default PasswordInput;
