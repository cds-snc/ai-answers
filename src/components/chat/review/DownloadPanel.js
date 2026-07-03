import React from 'react';
import { GcdsDetails } from '@gcds-core/components-react';

const DownloadPanel = ({ message, t, answerNumber }) => {
    if (!message) return null;

    const interaction = message.interaction || {};
    const tools = (interaction.answer && interaction.answer.tools) || [];

    const downloads = tools.filter(tool => tool.tool === 'downloadWebPage');

    if (downloads.length === 0) return null;

    const parseUrl = (input) => {
        try {
            const parsed = typeof input === 'string' ? JSON.parse(input) : input;
            return parsed && parsed.url ? parsed.url : String(input);
        } catch {
            return String(input);
        }
    };

    const hasSuccess = downloads.some(d => d.error === 'none');
    const indicator = hasSuccess ? ' \u2714' : ' \u2718';

    // Disambiguates this panel when several review panels are open at once
    // (one per message) — same pattern as ExpertFeedbackComponent's
    // answerNumber/withAnswerNumber, reusing the same locale key.
    const baseTitle = (t('reviewPanels.downloadedPagesTitle') || 'Downloaded pages') + indicator;
    const title = answerNumber
        ? `${baseTitle}: ${t('homepage.expertRating.answerNumberLabel').replace('{number}', answerNumber)}`
        : baseTitle;

    return (
        <GcdsDetails detailsTitle={title} className="review-details" tabIndex="0">
            <div className="review-panel download-panel">
                {downloads.map((d, i) => {
                    const url = parseUrl(d.input);
                    const succeeded = d.error === 'none';
                    return (
                        <div key={i} style={{ marginBottom: '0.25rem' }}>
                            <span style={{ color: succeeded ? 'green' : 'red', marginRight: '0.4rem' }}>
                                {succeeded ? '\u2714' : '\u2718'}
                            </span>
                            <a href={url} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>
                                {url}
                            </a>
                        </div>
                    );
                })}
            </div>
        </GcdsDetails>
    );
};

export default DownloadPanel;
