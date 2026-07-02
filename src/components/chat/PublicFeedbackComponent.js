import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import FeedbackService from '../../services/FeedbackService.js';
import { FEEDBACK_OPTIONS } from '../../constants/UserFeedbackOptions.js';


const PublicFeedbackComponent = ({
  lang = 'en',
  isPositive = true,
  chatId,
  userMessageId,
  onSubmit = () => {},
  onClose,
}) => {
  const { t } = useTranslations(lang);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState(false);
  const errorRef = useRef(null);

  const options = (isPositive ? FEEDBACK_OPTIONS.YES : FEEDBACK_OPTIONS.NO).map(opt => ({
    ...opt,
    label: isPositive
      ? t(`homepage.publicFeedback.yes.options.${opt.id}`)
      : t(`homepage.publicFeedback.no.options.${opt.id}`)
  }));

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  const handleOptionChange = (id) => {
    setSelected(id);
    setError(false);
  };

  const handleSend = async () => {
    if (!selected) {
      setError(true);
      return;
    }

    const option = options.find((o) => o.id === selected);
    const feedbackPayload = {
      type: 'public',
      feedback: isPositive ? 'yes' : 'no', // Set 'yes' or 'no'
      publicFeedbackReason: option.label,   // Use the option's label
      publicFeedbackScore: option.score,    // Use the option's score
    };
    try {
      await FeedbackService.persistPublicFeedback({ chatId, interactionId: userMessageId, publicFeedback: feedbackPayload });
    } catch (err) {
      console.error('Failed to persist public feedback', err);
      // parent still shows its own thank-you message even if logging fails
    }
    onSubmit(feedbackPayload);
  };

  return (
    <form className="expert-rating-container" noValidate onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
      <span
        className="close-icon"
        role="button"
        tabIndex={0}
        aria-label="Close"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Enter' && onClose()}
      >
        <i className="fa-solid fa-close"></i>
      </span>
      <h2 className="feedback-followup-title">
        {isPositive ? t('homepage.publicFeedback.yes.title') : t('homepage.publicFeedback.no.title')}
      </h2>
      <div className="feedback-reason-card">
        <fieldset
          className={`gc-chckbxrdio feedback-reason-fieldset${error ? ' has-error' : ''}`}
          aria-labelledby="public-feedback-legend public-feedback-hint"
        >
          <legend id="public-feedback-legend">
            {isPositive ? t('homepage.publicFeedback.yes.shortQuestion') : t('homepage.publicFeedback.no.shortQuestion')}{' '}
            <span className="label--required">({t('homepage.publicFeedback.requiredLabel')})</span>
          </legend>
          <p className="feedback-reason-hint" id="public-feedback-hint">
            {isPositive ? t('homepage.publicFeedback.yes.hint') : t('homepage.publicFeedback.no.hint')}
          </p>
          {error && (
            <p
              className="feedback-inline-error"
              id="public-feedback-error"
              role="alert"
              ref={errorRef}
              tabIndex={-1}
            >
              {t('homepage.publicFeedback.selectionRequired')}
            </p>
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
          <button type="submit" className="btn-primary mt-150">
            {t('homepage.publicFeedback.send')}
          </button>
        </fieldset>
      </div>
    </form>
  );
};

export default PublicFeedbackComponent;
