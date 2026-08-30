import React from 'react';
import { GcdsLink } from '@gcds-core/components-react';
import { useAnswerNumberLabel } from '../../../hooks/useAnswerNumberLabel.js';
import { formatNumber } from '../../../utils/numberFormat.js';
import { buildChatReviewHref } from '../../../utils/reviewLink.js';

const UsedChatsPanel = ({ message, t, lang = 'en', adminLang, answerNumber }) => {
    const { withAnswerNumber } = useAnswerNumberLabel(t, answerNumber);
    const qaMatches = message?.interaction?.context?.qaMatches;

    if (!Array.isArray(qaMatches) || qaMatches.length === 0) return null;

    return (
        <details className="review-details">
            <summary>{withAnswerNumber(t('reviewPanels.usedQaChatsTitle'))}</summary>
            <div className="review-panel">
                <table className="review-table">
                    <caption className="sr-only">{t('reviewPanels.usedQaChatsTitle')}</caption>
                    <thead>
                        <tr>
                            <th scope="col">{t('reviewPanels.chatId')}</th>
                            <th scope="col">{t('reviewPanels.totalScore')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {qaMatches.map((match, index) => (
                            <tr key={match.interactionId || `${match.chatId}-${index}`}>
                                <td>
                                    {match.chatId ? (
                                        // The matched chat's own pageLanguage isn't available here
                                        // (agents/graphs/GenericWithQAGraph.js's qaMatches carries no
                                        // language field), so `lang` (this - the CURRENT chat's own
                                        // language) is the best routing guess for the href. The visible
                                        // text is just the opaque chatId though, not real content - its
                                        // `lang` attribute (driving GcdsLink's own "opens in a new tab"
                                        // hint) is admin-facing chrome, so it follows the admin's own
                                        // language instead, same reasoning as ContentIssueChatsCard.js.
                                        <GcdsLink href={buildChatReviewHref(match.chatId, lang, null, adminLang)} target="_blank" lang={adminLang || lang}>
                                            {match.chatId}
                                        </GcdsLink>
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
