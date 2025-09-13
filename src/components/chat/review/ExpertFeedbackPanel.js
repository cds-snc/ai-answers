import React, { useState, useCallback } from 'react';
import { GcdsDetails } from '@cdssnc/gcds-components-react';
import FeedbackService from '../../../services/FeedbackService.js';
import ClientLoggingService from '../../../services/ClientLoggingService.js';

const ExpertFeedbackPanel = ({ message, extractSentences, t }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const handleToggle = useCallback(async (e) => {
        try {
            if (data) return; // already loaded
            setLoading(true);
            setError(null);
            const interactionId = (message.interaction && (message.interaction._id || message.interaction.id)) || message.id;
            const result = await FeedbackService.getExpertFeedback({ interactionId });
            setData(result);
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    }, [data, message]);

    const handleDelete = useCallback(async () => {
        try {
            setDeleting(true);
            setError(null);
            const interactionId = (message.interaction && (message.interaction._id || message.interaction.id)) || message.id;
            await FeedbackService.deleteExpertFeedback({ interactionId });
            // Clear local expert feedback references so UI updates
            setData(null);
            // If message has expertFeedback attached, clear it
            if (message.interaction) {
                message.interaction.expertFeedback = undefined;
            } else {
                message.expertFeedback = undefined;
            }
            await ClientLoggingService.info(interactionId, 'Expert feedback deleted', {});
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setDeleting(false);
        }
    }, [message]);

    if (!message) return null;

    const interaction = message.interaction || {};
    const answer = interaction.answer || {};

    // Build sentences array
    let sentences = [];
    if (Array.isArray(answer.paragraphs) && answer.paragraphs.length > 0) {
        sentences = answer.paragraphs.flatMap(p => extractSentences(p));
    } else if (Array.isArray(answer.sentences) && answer.sentences.length > 0) {
        sentences = answer.sentences;
    }

    // Expert feedback may be attached in a few places
    const expert = interaction.expertFeedback || message.expertFeedback || {};

    const getExpertScore = (idx) => {
        // expert schema stores sentence scores as sentence1Score, sentence2Score...
        const key = `sentence${idx + 1}Score`;
        return (expert && typeof expert[key] !== 'undefined' && expert[key] !== null) ? expert[key] : 'N/A';
    };

    if (sentences.length === 0) return null;

    return (
        <GcdsDetails detailsTitle={t('reviewPanels.expertFeedbackTitle') || t('homepage.expertRating.title') || 'Expert feedback'} className="review-details" tabIndex="0" onGcdsClick={(e) => {
                // e.target should be the gcds-details web component; check its open property
                try {
                    // call load when panel is being opened
                    if (e && e.target && !e.target.open) {
                        handleToggle(e);
                    }
                } catch (err) {
                    // fallback: call handler anyway
                    handleToggle(e);
                }
            }}>
            <div className="review-panel expert-feedback-panel">
                {loading && <div>{t('common.loading') || 'Loading...'}</div>}
                {error && <div className="error">{t('common.error') || 'Error'}: {error}</div>}
                {/* Summary: citation and total score */}
                <div className="expert-feedback-summary">
                    {(() => {
                        const efSource = (data && data.expertFeedback) || expert || {};
                        const sentenceCount = Math.min(4, sentences.length || 0);
                        const computeTotal = (ef, count) => {
                            if (!ef) return null;
                            const hasAnyRating = [ef.sentence1Score, ef.sentence2Score, ef.sentence3Score, ef.sentence4Score, ef.citationScore].some(s => typeof s !== 'undefined' && s !== null);
                            if (!hasAnyRating) return null;
                            const scores = [ef.sentence1Score, ef.sentence2Score, ef.sentence3Score, ef.sentence4Score]
                                .slice(0, count)
                                .map(s => (s === null || typeof s === 'undefined' ? 100 : s));
                            const sentenceComponent = (scores.reduce((sum, v) => sum + v, 0) / (scores.length || 1)) * 0.75;
                            const citationComponent = (typeof ef.citationScore !== 'undefined' && ef.citationScore !== null) ? ef.citationScore : 25;
                            const total = sentenceComponent + citationComponent;
                            return Math.round(total * 100) / 100;
                        };
                        const citationVal = (efSource && typeof efSource.citationScore !== 'undefined' && efSource.citationScore !== null) ? efSource.citationScore : null;
                        const totalVal = (efSource && typeof efSource.totalScore !== 'undefined' && efSource.totalScore !== null) ? efSource.totalScore : computeTotal(efSource, sentenceCount);
                        return (
                            <div>
                                <div><strong>{t('reviewPanels.totalScore') || 'Total score'}:</strong> {totalVal !== null ? totalVal : (t('reviewPanels.notAvailable') || 'N/A')}</div>
                            </div>
                        );
                    })()}
                </div>
                <table className="review-table">
                    <thead>
                        <tr>
                            <th>{t('reviewPanels.sentence') || 'Sentence'}</th>
                            <th>{t('reviewPanels.expertScore') || 'Expert score'}</th>
                            <th>{t('reviewPanels.explanation') || 'Explanation'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sentences.map((s, i) => {
                            const row = (data && data.sentences && data.sentences[i]) || {};
                            const scoreVal = (typeof row.score !== 'undefined' && row.score !== null) ? row.score : getExpertScore(i);
                            const explVal = (row.explanation || (expert && expert[`sentence${i + 1}Explanation`])) || (t('reviewPanels.notAvailable') || 'N/A');
                            return (
                                <tr key={`s-${i}`}>
                                    <td>{s || (t('reviewPanels.notAvailable') || 'N/A')}</td>
                                    <td>{typeof scoreVal !== 'undefined' && scoreVal !== null ? scoreVal : (t('reviewPanels.notAvailable') || 'N/A')}</td>
                                    <td>{explVal}</td>
                                </tr>
                            );
                        })}
                        {/* Citation row - map citationScore -> expert score column, suggested URL -> explanation column */}
                        {(() => {
                            const efSource = (data && data.expertFeedback) || expert || {};
                            const citationScore = (typeof efSource.citationScore !== 'undefined' && efSource.citationScore !== null) ? efSource.citationScore : null;
                            const suggestedUrl = efSource.expertCitationUrl || efSource.citationExplanation || null;
                            const scoreCell = citationScore !== null ? citationScore : (t('reviewPanels.notAvailable') || 'N/A');
                            const explCell = suggestedUrl ? (
                                <a href={suggestedUrl} target="_blank" rel="noopener noreferrer">{suggestedUrl}</a>
                            ) : (t('reviewPanels.notAvailable') || 'N/A');
                            return (
                                <tr key="citation-row" className="citation-row">
                                    <td>{t('reviewPanels.citation') || 'Citation'}</td>
                                    <td>{scoreCell}</td>
                                    <td>{explCell}</td>
                                </tr>
                            );
                        })()}
                    </tbody>
                </table>
                <div className="mt-200">
                    <button className="btn btn-danger" disabled={deleting} onClick={handleDelete}>
                        {deleting ? (t('common.deleting') || 'Deleting...') : (t('reviewPanels.deleteExpertFeedback') || 'Delete Expert Feedback')}
                    </button>
                </div>
            </div>
        </GcdsDetails>
    );
};

export default ExpertFeedbackPanel;
