import React from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useAnswerNumberLabel } from '../../hooks/useAnswerNumberLabel.js';
import { resolveDisplayContent, toLangAttr } from '../../utils/answerLanguage.js';
import OriginalLanguagePill from './review/OriginalLanguagePill.js';

// Popout showing the AI's own English source/working text on the expert
// (admin/partner) "How was this answer?" prompt in FeedbackComponent.js,
// shown in place of direct Good/Needs improvement whenever the answer isn't
// already EN/FR - a reviewer who can't read the original can't meaningfully
// rate it without seeing what AI Answers actually worked from first. This is
// NOT a translation service and must never be framed as one - it's AI
// Answers' own English draft, the same text the model generated before
// producing the non-EN/FR answer. Reuses the same quoted-sentence markup and
// EN/FR-official-languages display rule (shown as-is; non-EN/FR collapses to
// English) (resolveDisplayContent, src/utils/answerLanguage.js) as
// ExpertFeedbackComponent's "Needs
// improvement" flow. The Good/Needs improvement choice itself lives at the
// bottom, once there's something to judge it against.
const SourceViewComponent = ({
  onClose,
  onFeedback,
  lang = 'en',
  sentenceCount = 1,
  sentences = [],
  questionLanguage = '',
  sentencesEnglish = [],
  englishQuestion = '',
  answerNumber,
  titleRef,
  noButtonRef,
}) => {
  const { t } = useTranslations(lang);
  const { withAnswerNumber } = useAnswerNumberLabel(t, answerNumber);

  const sentenceDisplays = sentences.map((sentence, index) =>
    resolveDisplayContent({ language: questionLanguage, original: sentence, english: sentencesEnglish[index] })
  );

  return (
    <div className="expert-rating-container" lang={lang}>
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
      <h4 className="feedback-followup-title" ref={titleRef} tabIndex={-1}>
        {withAnswerNumber(t('homepage.expertRating.sourceView.title'))}
      </h4>
      <div className="mb-100">
        <OriginalLanguagePill languageCode={toLangAttr(questionLanguage)} lang={lang} t={t} />
      </div>
      {/* The question the AI actually worked from too, not just the answer -
          without it a reviewer can't judge whether the answer is even
          relevant to what was asked, only whether the English reads well. */}
      {englishQuestion && (
        <div className="sentence-text mb-200">
          {/* englishQuestion is guaranteed-English text (this whole popout
              exists to show it) - the container above is tagged lang={lang}
              (the reviewer's own UI language), so without its own lang="en"
              here it would inherit that and get mispronounced for a French-
              interface reviewer, same as every sentence below already
              guards against via its own lang={sentenceDisplays[index].lang}. */}
          <strong>{t('reviewPanels.question')}</strong> "<span lang="en">{englishQuestion}</span>"
        </div>
      )}
      {[...Array(Math.min(4, sentenceCount))].map((_, index) => (
        sentences[index] && (
          <div key={index + 1} className="sentence-text mb-200">
            "<span lang={sentenceDisplays[index].lang}>{sentenceDisplays[index].text}</span>"
          </div>
        )
      ))}
      {onFeedback && (
        <div className="feedback-container mt-200">
          <span className="feedback-text" aria-hidden="true">{t("homepage.feedback.question")} </span>
          <button
            className="feedback-link button-as-link feedback-icon-up"
            onClick={() => onFeedback(true)}
            tabIndex="0"
            aria-label={`${t("homepage.feedback.question")} ${t("homepage.feedback.useful")}`}
          >
            {t("homepage.feedback.useful")}
          </button>
          <span className="feedback-separator">·</span>
          <span className="feedback-text">{t("homepage.feedback.or")}</span>
          <span className="feedback-separator">·</span>
          <button
            ref={noButtonRef}
            className="feedback-link button-as-link feedback-icon-down"
            onClick={() => onFeedback(false)}
            tabIndex="0"
            aria-label={`${t("homepage.feedback.question")} ${t("homepage.feedback.notUseful")}`}
          >
            {t("homepage.feedback.notUseful")}
          </button>
        </div>
      )}
    </div>
  );
};

export default SourceViewComponent;
