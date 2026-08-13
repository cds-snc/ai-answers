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

    // TODO: review and confirm \u2014 .some() means the Success pill shows if
    // even one of several downloads succeeded, e.g. 1-of-3 still reads
    // "Success" overall. Pre-existing logic (unchanged by this PR), but the
    // pill treatment makes that reading more prominent than the checkmark
    // it replaced. Confirm this is the intended meaning of "Success" here
    // before changing it \u2014 not fixing without that confirmation.
    const hasSuccess = downloads.some(d => d.error === 'none');
    // Text, not a bare glyph or color alone \u2014 a checkmark/x-mark with no
    // label isn't reliably announced by screen readers, and green/red alone
    // fails WCAG 1.4.1 (use of color). Reuses the same .label.correct/
    // .label.error pill pair already used for eval verdicts elsewhere
    // (DatabasePage.js, SuiteGridTable.js) \u2014 but "Success"/"Failed" wording
    // here specifically, not the "Pass"/"Fail" used for those verdicts,
    // since this is a download outcome, not a scored evaluation.
    const titleStatus = hasSuccess ? t('reviewPanels.downloadSuccess') : t('reviewPanels.fail');
    const title = withAnswerNumber(t('reviewPanels.downloadedPagesTitle') || 'Downloaded pages');

    return (
        <details className="review-details">
            <summary>
                {title}
                <span className={`label label--summary-status ${hasSuccess ? 'correct' : 'error'}`}>{titleStatus}</span>
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
