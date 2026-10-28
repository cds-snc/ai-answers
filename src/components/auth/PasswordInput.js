import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from '../../hooks/useTranslations.js';

// `hint`: optional text shown under the label (e.g. the password rule) and
// read with the field, before any error id the page passes in.
const PasswordInput = ({ id, name, label, hint, value, onChange, required, disabled, autoComplete, ariaDescribedBy, ariaInvalid, lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [showPassword, setShowPassword] = useState(false);
  const hintId = hint ? `${id}-hint` : null;
  const describedBy = [hintId, ariaDescribedBy].filter(Boolean).join(' ') || undefined;

  return (
    <div className="auth-form-group">
      <label htmlFor={id}>{label}</label>
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      <div className="auth-password-wrapper">
        <input
          type={showPassword ? 'text' : 'password'}
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          aria-invalid={ariaInvalid || undefined}
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
