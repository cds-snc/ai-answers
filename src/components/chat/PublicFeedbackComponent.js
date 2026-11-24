import React, { useState } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useInlineFormError } from '../../hooks/useInlineFormError.js';
import FeedbackInlineError from './FeedbackInlineError.js';
import FeedbackService from '../../services/FeedbackService.js';
import { FEEDBACK_OPTIONS } from '../../constants/UserFeedbackOptions.js';


const PublicFeedbackComponent = ({
  lang = 'en',
  isPositive = true,
  chatId,
  userMessageId,
  onSubmit = () => {},
  onClose,
  titleRef,
}) => {
  const { t } = useTranslations(lang);
  const [selected, setSelected] = useState('');
  const { hasError, errorCount, errorRef, triggerError, clearError } = useInlineFormError();

  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const options = (isPositive ? FEEDBACK_OPTIONS.YES : FEEDBACK_OPTIONS.NO).map(opt => ({
    ...opt,
    label: isPositive
      ? t(`homepage.publicFeedback.yes.options.${opt.id}`)
      : t(`homepage.publicFeedback.no.options.${opt.id}`)
  }));

  const handleOptionChange = (id) => {
    setSelected(id);
    clearError();
  };

  const handleSend = async () => {
    if (saving) return;
    if (!selected) {
      triggerError();
      return;
    }

    const option = options.find((o) => o.id === selected);
    const feedbackPayload = {
      type: 'public',
      feedback: isPositive ? 'yes' : 'no', // Set 'yes' or 'no'
      publicFeedbackReason: option.label,   // Use the option's label
      publicFeedbackScore: option.score,    // Use the option's score
    };
    setSaving(true);
    setSaveFailed(false);
    try {
      await FeedbackService.persistPublicFeedback({ chatId, interactionId: userMessageId, publicFeedback: feedbackPayload });
    } catch (err) {
      console.error('Failed to persist public feedback', err);
      setSaving(false);
      setSaveFailed(true);
      return;
    }
    onSubmit();
  };

  return (
    <form className="expert-rating-container" noValidate onSubmit={(e) => { e.preventDefault(); handleSend(); }} lang={lang}>
      <span
        className="close-icon"
        role="button"
        tabIndex={0}
        aria-label={t('common.close')}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <i className="fa-solid fa-close"></i>
      </span>
      <h4 className="feedback-followup-title" id="public-feedback-title">
        {isPositive ? t('homepage.publicFeedback.yes.title') : t('homepage.publicFeedback.no.title')}
      </h4>
      <div className="feedback-reason-card">
        <fieldset
          className={`gc-chckbxrdio feedback-reason-fieldset${hasError ? ' has-error' : ''}`}
          aria-labelledby="public-feedback-title public-feedback-legend public-feedback-hint"
          disabled={saving}
          ref={titleRef}
          tabIndex={-1}
        >
          <legend id="public-feedback-legend">
            {isPositive ? t('homepage.publicFeedback.yes.shortQuestion') : t('homepage.publicFeedback.no.shortQuestion')}{' '}
            <span className="label--required">({t('homepage.publicFeedback.requiredLabel')})</span>
          </legend>
          <p className="feedback-reason-hint" id="public-feedback-hint">
            {isPositive ? t('homepage.publicFeedback.yes.hint') : t('homepage.publicFeedback.no.hint')}
          </p>
          {hasError && (
            <FeedbackInlineError
              id="public-feedback-error"
              message={t('homepage.publicFeedback.selectionRequired')}
              errorCount={errorCount}
              inputRef={errorRef}
            />
          )}
          <ul className="list-unstyled lst-spcd-2">
            {options.map((opt) => (
              <li className="radio" key={opt.id}>
                <input
                  type="radio"
                  name="publicFeedbackReason"
                  id={opt.id}
                  value={opt.id}
                  checked={selected === opt.id}
                  onChange={() => handleOptionChange(opt.id)}
                  required
                />
                <label htmlFor={opt.id}>{opt.label}</label>
              </li>
            ))}
          </ul>
          {saveFailed && (
            <p role="alert" className="form-error-message">{t('homepage.publicFeedback.saveFailed')}</p>
          )}
          <button type="submit" className="btn-primary mt-150">
            {t('homepage.publicFeedback.send')}
          </button>
        </fieldset>
      </div>
    </form>
  );
};

export default PublicFeedbackComponent;
