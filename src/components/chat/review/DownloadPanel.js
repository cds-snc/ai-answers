import React from 'react';
import { GcdsDetails } from '@cdssnc/gcds-components-react';

const DownloadPanel = ({ message, t }) => {
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

    const title = (t('reviewPanels.downloadedPagesTitle') || 'Downloaded pages') + indicator;

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
