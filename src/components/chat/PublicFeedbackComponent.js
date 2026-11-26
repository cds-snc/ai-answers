import React, { useRef, useState } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useInlineFormError } from '../../hooks/useInlineFormError.js';
import { useFocusOnChange } from '../../hooks/useFocusOnChange.js';
import FeedbackInlineError from './FeedbackInlineError.js';
import FeedbackService from '../../services/FeedbackService.js';
import { FEEDBACK_OPTIONS } from '../../constants/UserFeedbackOptions.js';

// 409 means this interaction already has feedback. 403 means the session
// that opened the chat is gone (it expires after inactivity, and signing
// in replaces it); reloading starts a new session that does not own this
// chat, so the feedback cannot be saved. Other 4xx responses are final
// too. Only a 5xx, or a request that never got a status, is worth retrying.
function saveFailureFor(err) {
  if (err?.status === 403) {
    return { key: 'homepage.publicFeedback.sessionEnded', retryable: false };
  }
  if (typeof err?.status === 'number' && err.status < 500) {
    return { key: 'homepage.publicFeedback.saveFailed', retryable: false };
  }
  return { key: 'homepage.publicFeedback.saveError', retryable: true };
}


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
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState(null);
  const [saveErrorNonce, setSaveErrorNonce] = useState(0);
  const savingRef = useRef(false);
  const saveErrorRef = useFocusOnChange(saveErrorNonce);
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
    if (saveFailure?.retryable) setSaveFailure(null);
  };

  const handleSend = async () => {
    if (savingRef.current || saveFailure?.retryable === false) return;
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
    savingRef.current = true;
    setSaving(true);
    if (saveFailure?.retryable) setSaveFailure(null);
    try {
      await FeedbackService.persistPublicFeedback({ chatId, interactionId: userMessageId, publicFeedback: feedbackPayload });
    } catch (err) {
      // 409 means a public feedback document is already stored (the earlier
      // request saved it and this response was lost). Show the thank-you.
      // It does not name the reason. After a retryable error the radios stay
      // editable, so the selection on screen can be a later one than the
      // reason that was stored, and a second write is refused. Leave the
      // thank-you as it is. Confirming the selection on screen would claim
      // a reason that was not recorded.
      if (err.status === 409) {
        onSubmit(feedbackPayload);
        return;
      }
      console.error('Failed to persist public feedback', err);
      setSaveFailure(saveFailureFor(err));
      setSaveErrorNonce((n) => n + 1);
      return;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    onSubmit(feedbackPayload);
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
          <button type="submit" className="btn-primary mt-150" disabled={saving || saveFailure?.retryable === false}>
            {t('homepage.publicFeedback.send')}
          </button>
        </fieldset>
        {saveFailure && (
          <FeedbackInlineError
            id="public-feedback-save-error"
            message={t(saveFailure.key)}
            errorCount={saveErrorNonce}
            inputRef={saveErrorRef}
          />
        )}
      </div>
    </form>
  );
};

export default PublicFeedbackComponent;
