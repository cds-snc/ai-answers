import React, { useState, useCallback } from 'react';
import { GcdsDetails } from '@cdssnc/gcds-components-react';
import FeedbackService from '../../../services/FeedbackService.js';

const PublicFeedbackPanel = ({ message, t }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);

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

    if (!message) return null;

    const interaction = message.interaction || {};
    

    // If we fetched data, API returns { publicFeedback: pf, sentences } — normalize to use pf
    const fetchedPublicFeedback = data && (data.publicFeedback || data);
    const publicFeedback = fetchedPublicFeedback || interaction.publicFeedback || message.publicFeedback || {};

    return (
        <GcdsDetails detailsTitle={t('reviewPanels.publicFeedbackTitle') || 'Public feedback'} className="review-details" tabIndex="0" onGcdsClick={(e) => {
            try {
                // Call handleToggle when the details panel is opened (e.target.open === true)
                if (e && e.target && !e.target.open) {
                    handleToggle(e);
                }
            } catch (err) {
                // Fallback: attempt to toggle fetch; handleToggle will early-return if closed
                handleToggle(e);
            }
        }}>
            <div className="review-panel public-feedback-panel">
                {loading && <div>{t('common.loading') || 'Loading...'}</div>}
                {error && <div className="error">{t('common.error') || 'Error'}: {error}</div>}
                <div className="public-feedback-summary">
                    <div>{t('reviewPanels.score') || 'Score'}: {(publicFeedback && typeof publicFeedback.publicFeedbackScore !== 'undefined' && publicFeedback.publicFeedbackScore !== null) ? publicFeedback.publicFeedbackScore : (t('reviewPanels.notAvailable') || 'N/A')}</div>
                    <div>{t('reviewPanels.reason') || 'Reason'}: {publicFeedback && (publicFeedback.publicFeedbackReason || '')}</div>
                    <div>{t('reviewPanels.feedback') || 'Feedback'}: {publicFeedback && (publicFeedback.feedback || '')}</div>
                </div>
                {/* Only show overall public feedback score and reason; sentence-level chart removed */}
            </div>
        </GcdsDetails>
    );
};

export default PublicFeedbackPanel;
