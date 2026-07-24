import React from 'react';
import { useAnswerNumberLabel } from '../../../hooks/useAnswerNumberLabel.js';
import { formatNumber } from '../../../utils/numberFormat.js';

const UsedChatsPanel = ({ message, t, lang = 'en', answerNumber }) => {
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
                            <th>{t('reviewPanels.totalScore')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {qaMatches.map((match, index) => (
                            <tr key={match.interactionId || `${match.chatId}-${index}`}>
                                <td>
                                    {match.chatId ? (
                                        <a
                                            href={`/${lang}?chat=${encodeURIComponent(match.chatId)}&review=1`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {match.chatId}
                                        </a>
                                    ) : ''}
                                </td>
                                <td>{match.totalScore === null || typeof match.totalScore === 'undefined' ? '' : formatNumber(match.totalScore, lang)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </details>
    );
};

export default UsedChatsPanel;
