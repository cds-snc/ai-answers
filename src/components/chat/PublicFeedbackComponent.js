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
}) => {
  const { t } = useTranslations(lang);
  const [selected, setSelected] = useState('');
  const { hasError, errorCount, errorRef, triggerError, clearError } = useInlineFormError();

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
        aria-label={t('common.close')}
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Enter' && onClose()}
      >
        <i className="fa-solid fa-close"></i>
      </span>
      <h2 className="feedback-followup-title">
        {isPositive ? t('homepage.publicFeedback.yes.title') : t('homepage.publicFeedback.no.title')}
      </h2>
      {/* TODO(a11y): what a screen reader reads here never identifies which chat/answer
          is being rated — in review mode, with several messages on the page, there's no
          way to be sure which one you're evaluating. Same gap as the EvalPanel buttons.
          (Unlike ExpertFeedbackComponent, this component's ids don't need instance
          namespacing: review mode's chat data fetch is gated to admin/partner roles
          server-side (api/db/db-chat.js), and admin/partner always take the expert
          feedback path, so PublicFeedbackComponent can never have two instances open
          at once — only identifying which question is being rated is the real fix.)
          Revisit as part of the planned eval/admin UI redesign. */}
      <div className="feedback-reason-card">
        <fieldset
          className={`gc-chckbxrdio feedback-reason-fieldset${hasError ? ' has-error' : ''}`}
          aria-labelledby="public-feedback-legend public-feedback-hint"
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
          <button type="submit" className="btn-primary mt-150">
            {t('homepage.publicFeedback.send')}
          </button>
        </fieldset>
      </div>
    </form>
  );
};

export default PublicFeedbackComponent;
