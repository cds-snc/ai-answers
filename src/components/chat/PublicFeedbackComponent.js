import React, { useState } from 'react';
import '../../styles/App.css';
import { useTranslations } from '../../hooks/useTranslations.js';
import DataStoreService from '../../services/DataStoreService.js';

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
  const [submitted, setSubmitted] = useState(false);

  const options = isPositive
    ? [
        { id: 'noCall', score: 1, label: t('homepage.publicFeedback.yes.options.noCall') },
        { id: 'noVisit', score: 2, label: t('homepage.publicFeedback.yes.options.noVisit') },
        { id: 'savedTime', score: 3, label: t('homepage.publicFeedback.yes.options.savedTime') },
        { id: 'other', score: 4, label: t('homepage.publicFeedback.yes.options.other') },
      ]
    : [
        { id: 'irrelevant', score: 9, label: t('homepage.publicFeedback.no.options.irrelevant') },
        { id: 'confusing', score: 8, label: t('homepage.publicFeedback.no.options.confusing') },
        { id: 'notDetailed', score: 7, label: t('homepage.publicFeedback.no.options.notDetailed') },
        { id: 'notWanted', score: 5, label: t('homepage.publicFeedback.no.options.notWanted') },
        { id: 'other', score: 6, label: t('homepage.publicFeedback.no.options.other') },
      ];

  const surveyUrl = isPositive
    ? t('homepage.publicFeedback.yes.surveyUrl')
    : t('homepage.publicFeedback.no.surveyUrl');

  const handleSend = () => {
    if (!selected) return;

    const option = options.find((o) => o.id === selected);
    const feedbackPayload = {
      type: 'public',
      feedback: isPositive ? 'yes' : 'no', // Set 'yes' or 'no'
      publicFeedbackReason: option.label,   // Use the option's label
      publicFeedbackScore: option.score,    // Use the option's score
    };
    DataStoreService.persistFeedback(feedbackPayload, chatId, userMessageId);
    setSubmitted(true);
    onSubmit(feedbackPayload);
  };

  if (submitted) {
    return (
      <p className="thank-you">
        <span className="gcds-icon fa fa-solid fa-check-circle"></span>
        {t('homepage.feedback.thankYou')}
      </p>
    );
  }

  return (
    <form className="expert-rating-container" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
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
      <fieldset className="gc-chckbxrdio sm-v">
        <h2>{isPositive ? t('homepage.publicFeedback.yes.question') : t('homepage.publicFeedback.no.question')}</h2>
        <details className="answer-details" open>
          <summary>{isPositive ? t('homepage.publicFeedback.yes.shortQuestion') : t('homepage.publicFeedback.no.shortQuestion')}</summary>
          <ul className="list-unstyled lst-spcd-2">
            {options.map((opt) => (
              <li className="radio" key={opt.id}>
                <input
                  type="radio"
                  id={opt.id}
                  value={opt.id}
                  checked={selected === opt.id}
                  onChange={() => setSelected(opt.id)}
                />
                <label htmlFor={opt.id}>{opt.label}</label>
              </li>
            ))}
          </ul>
          <a
              href={surveyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="feedback-survey-link"
              style={{ display: 'block', marginTop: '1em' }}
            >
              {t('homepage.publicFeedback.surveyLink')}
            </a>
        </details>
      </fieldset>
      <button type="submit" className="btn-primary mrgn-lft-sm">
        {t('homepage.publicFeedback.send')}
      </button>
    </form>
  );
};

export default PublicFeedbackComponent;
