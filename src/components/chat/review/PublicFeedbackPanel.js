import React, { useState, useCallback, useEffect } from 'react';
import FeedbackService from '../../../services/FeedbackService.js';
import { SCORE_TO_KEY } from '../../../constants/UserFeedbackOptions.js';
import { useAnswerNumberLabel } from '../../../hooks/useAnswerNumberLabel.js';

const PublicFeedbackPanel = ({ message, t, answerNumber }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);

    const { withAnswerNumber } = useAnswerNumberLabel(t, answerNumber);

    const handleToggle = useCallback(async () => {
        try {
            if (data) return;
            setLoading(true);
            setError(null);
            const interactionId = (message.interaction && (message.interaction._id || message.interaction.id)) || message.id;
            const result = await FeedbackService.getPublicFeedback({ interactionId });
            setData(result);
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    }, [data, message]);

    // Fetch eagerly on mount rather than waiting for the reviewer to expand
    // the panel — this component only ever mounts for messages that already
    // have public feedback (the render guard below), so this isn't fetching
    // for every message on the page, only the subset that will show a
    // pill regardless. Without this, the summary pill showed a vague
    // "Feedback" placeholder until the reviewer opened (and re-closed) the
    // panel once, which read as broken rather than as a real value.
    useEffect(() => {
        if (!message) return;
        const interactionForFetch = message.interaction || {};
        if (!interactionForFetch.publicFeedback && !message.publicFeedback) return;
        handleToggle();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [message]);

    if (!message) return null;

    const interaction = message.interaction || {};


    // If we fetched data, API returns { publicFeedback: pf, sentences } — normalize to use pf
    const fetchedPublicFeedback = data && (data.publicFeedback || data);
    const publicFeedback = fetchedPublicFeedback || interaction.publicFeedback || message.publicFeedback || {};

    if (!interaction.publicFeedback && !message.publicFeedback) return null;

    const baseTitle = t('reviewPanels.publicFeedbackTitle', 'Public feedback');
    const publicTitle = withAnswerNumber(baseTitle);

    // Text, not a bare glyph — a checkmark with no label isn't reliably
    // announced by screen readers (WCAG 1.4.1/4.1.2). Neutral grey (not
    // correct/error) since this is just naming which feedback panel this
    // is, not a pass/fail verdict. Before the panel is expanded/fetched,
    // publicFeedback.feedback isn't known yet (interaction.publicFeedback is
    // just an ObjectId reference), so the text falls back to a generic
    // "Feedback" label rather than guessing yes/no.
    const feedbackValue = fetchedPublicFeedback ? fetchedPublicFeedback.feedback : null;
    const feedbackPillText = feedbackValue === 'yes'
        ? t('reviewPanels.helpfulYes', 'Helpful - yes')
        : feedbackValue === 'no'
            ? t('reviewPanels.helpfulNo', 'Helpful - no')
            : t('reviewPanels.feedback', 'Feedback');

    return (
        <details className="review-details" onToggle={(e) => {
            try {
                // Call handleToggle when the details panel is opened (e.target.open === true)
                if (e && e.target && e.target.open) {
                    handleToggle(e);
                }
            } catch (err) {
                // Fallback: attempt to toggle fetch; handleToggle will early-return if closed
                handleToggle(e);
            }
        }}>
            <summary>
                {publicTitle}
                <span className="label label--summary-status normal">{feedbackPillText}</span>
            </summary>
            <div className="review-panel public-feedback-panel">
                {loading && <div>{t('common.loading', 'Loading...')}</div>}
                {error && <div className="error">{t('common.error', 'Error')}: {error}</div>}
                <div className="public-feedback-summary">
                    <div>{t('reviewPanels.score', 'Score')}: {(publicFeedback && typeof publicFeedback.publicFeedbackScore !== 'undefined' && publicFeedback.publicFeedbackScore !== null) ? publicFeedback.publicFeedbackScore : t('reviewPanels.notAvailable', 'N/A')}</div>
                    <div>{t('reviewPanels.reason', 'Reason')}: {(() => {
                        if (!publicFeedback) return '';
                        const score = publicFeedback.publicFeedbackScore;
                        const id = SCORE_TO_KEY[score];
                        const feedbackType = publicFeedback.feedback === 'yes' ? 'yes' : 'no';
                        if (id) return t(`homepage.publicFeedback.${feedbackType}.options.${id}`, publicFeedback.publicFeedbackReason || id);
                        return publicFeedback.publicFeedbackReason || '';
                    })()}</div>
                    <div>{t('reviewPanels.feedback', 'Feedback')}: {publicFeedback && (publicFeedback.feedback === 'yes' ? t('common.yes', 'Yes') : publicFeedback.feedback === 'no' ? t('common.no', 'No') : publicFeedback.feedback || '')}</div>
                </div>
                {/* Only show overall public feedback score and reason; sentence-level chart removed */}
            </div>
        </details>
    );
};

export default PublicFeedbackPanel;
