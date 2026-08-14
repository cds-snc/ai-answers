import React from 'react';
import { GcdsLink } from '@gcds-core/components-react';
import { useAnswerNumberLabel } from '../../../hooks/useAnswerNumberLabel.js';

const DownloadPanel = ({ message, t, lang = 'en', answerNumber }) => {
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

    // 'success' | 'partial' | 'fail' - matches the eval table's hasDownload status
    const succeededCount = downloads.filter(d => d.error === 'none').length;
    const downloadStatus = succeededCount === 0
        ? 'fail'
        : succeededCount === downloads.length ? 'success' : 'partial';
    // Text, not color alone, for WCAG 1.4.1 - reuses .label.correct/.error/.partial
    const statusPillClass = { success: 'correct', partial: 'partial', fail: 'error' }[downloadStatus];
    const titleStatus = {
        success: t('reviewPanels.downloadSuccess'),
        partial: t('reviewPanels.downloadPartial'),
        fail: t('reviewPanels.fail')
    }[downloadStatus];
    const title = withAnswerNumber(t('reviewPanels.downloadedPagesTitle') || 'Downloaded pages');

    return (
        <details className="review-details">
            <summary>
                {title}
                <span className={`label label--summary-status ${statusPillClass}`}>{titleStatus}</span>
            </summary>
            <div className="review-panel download-panel">
                {downloads.map((d, i) => {
                    const url = parseUrl(d.input);
                    const succeeded = d.error === 'none';
                    return (
                        <div key={i} style={{ marginBottom: '0.25rem' }}>
                            <span className={`label ${succeeded ? 'correct' : 'error'}`} style={{ marginRight: '0.4rem' }}>
                                {succeeded ? t('reviewPanels.downloadSuccess') : t('reviewPanels.fail')}
                            </span>
                            <GcdsLink href={url} target="_blank" lang={lang} className="url-break-all">
                                {url}
                            </GcdsLink>
                        </div>
                    );
                })}
            </div>
        </details>
    );
};

export default DownloadPanel;
