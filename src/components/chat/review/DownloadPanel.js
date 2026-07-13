import React from 'react';
import { useAnswerNumberLabel } from '../../../hooks/useAnswerNumberLabel.js';

const DownloadPanel = ({ message, t, answerNumber }) => {
    const { withAnswerNumber } = useAnswerNumberLabel(t, answerNumber);

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

    const title = withAnswerNumber((t('reviewPanels.downloadedPagesTitle') || 'Downloaded pages') + indicator);

    return (
        <details className="review-details">
            <summary>{title}</summary>
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
        </details>
    );
};

export default DownloadPanel;
