import React from 'react';
import { useAnswerNumberLabel } from '../../../hooks/useAnswerNumberLabel.js';

const UsedChatsPanel = ({ message, t, answerNumber }) => {
    const { withAnswerNumber } = useAnswerNumberLabel(t, answerNumber);
    const qaMatches = message?.interaction?.context?.qaMatches;

    if (!Array.isArray(qaMatches) || qaMatches.length === 0) return null;

    return (
        <details className="review-details">
            <summary>{withAnswerNumber(t('reviewPanels.usedQaChatsTitle'))}</summary>
            <div className="review-panel">
                <table className="review-table">
                    <thead>
                        <tr>
                            <th>{t('reviewPanels.chatId')}</th>
                            <th>{t('reviewPanels.interactionId')}</th>
                            <th>{t('reviewPanels.question')}</th>
                            <th>{t('reviewPanels.answer')}</th>
                            <th>{t('reviewPanels.similarity')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {qaMatches.map((match, index) => (
                            <tr key={match.interactionId || `${match.chatId}-${index}`}>
                                <td>{match.chatId || ''}</td>
                                <td>{match.interactionId || ''}</td>
                                <td>{match.questionText || ''}</td>
                                <td>{match.answerText || ''}</td>
                                <td>{match.similarity ?? ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </details>
    );
};

export default UsedChatsPanel;
