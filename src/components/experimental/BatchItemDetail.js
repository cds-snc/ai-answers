import React from 'react';
import { GcdsButton, GcdsText } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { getPath } from '../../utils/routes.js';
import { getItemVerdict } from '../../utils/experimental/batchItems.js';
import AnswerDiffView from './AnswerDiffView.js';
import AnalyzerResultDetails from './AnalyzerResultDetails.js';

const VERDICT_STYLES = {
    pass: { color: '#2e8540' },
    flagged: { color: '#d30800' },
    error: { color: '#d30800' }
};

// ChatViewer reads its chatId from localStorage on mount, so setting it
// before opening the page pre-fills the viewer without modifying it.
const openChatViewer = (chatId, lang) => {
    try {
        localStorage.setItem('chatId', chatId);
    } catch (err) {
        console.error('Failed to store chatId for ChatViewer:', err);
    }
    window.open(getPath('chat-viewer', lang), '_blank', 'noopener');
};

/**
 * Full drill-down for one batch item: question, golden vs generated answer
 * with diff highlighting, judge output, and chat log links.
 */
export default function BatchItemDetail({
    item,
    lang = 'en',
    position,
    totalInFilter,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    onBack
}) {
    const { t } = useTranslations(lang);

    if (!item) return null;

    const verdict = getItemVerdict(item);
    const verdictLabel = t(`experimental.results.verdict.${verdict}`);
    const analysisResults = Object.entries(item.analysisResults || {});
    const analysisErrors = Object.entries(item.analysisErrors || {});

    return (
        <section>
            <div className="mb-300" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <GcdsButton size="small" buttonRole="secondary" onClick={onBack}>
                    {t('experimental.results.detail.backToList')}
                </GcdsButton>
                <GcdsButton size="small" buttonRole="secondary" disabled={!hasPrev} onClick={onPrev}>
                    {t('experimental.results.detail.previous')}
                </GcdsButton>
                <GcdsButton size="small" buttonRole="secondary" disabled={!hasNext} onClick={onNext}>
                    {t('experimental.results.detail.next')}
                </GcdsButton>
                {position && (
                    <span>
                        {t('experimental.results.detail.position')
                            .replace('{current}', String(position))
                            .replace('{total}', String(totalInFilter))}
                    </span>
                )}
                <span style={{ ...VERDICT_STYLES[verdict], fontWeight: 'bold' }}>{verdictLabel}</span>
            </div>

            <div className="mb-300">
                <strong>{t('experimental.results.detail.question')}</strong>
                <GcdsText className="mt-100">{item.question || '—'}</GcdsText>
                {item.referringUrl && (
                    <div style={{ fontSize: '0.85rem' }}>
                        {t('experimental.results.detail.referringUrl')}: {item.referringUrl}
                    </div>
                )}
            </div>

            {item.status === 'failed' && item.error && (
                <div className="mb-300" style={{ border: '1px solid #d30800', borderRadius: '4px', padding: '0.75rem' }}>
                    <strong>{t('experimental.results.detail.itemError')}</strong>
                    <div>{item.error}</div>
                </div>
            )}

            {item.baselineAnswer ? (
                <AnswerDiffView baselineAnswer={item.baselineAnswer} answer={item.answer} lang={lang} />
            ) : (
                <div className="mb-300">
                    <strong>{t('experimental.results.detail.currentAnswer')}</strong>
                    <GcdsText className="mt-100">
                        {item.answer || t('experimental.results.detail.noAnswer')}
                    </GcdsText>
                </div>
            )}

            <div className="mt-300 mb-300" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {item.chatId && (
                    <GcdsButton size="small" buttonRole="secondary" onClick={() => openChatViewer(item.chatId, lang)}>
                        {t('experimental.results.detail.viewChatLogs')}
                    </GcdsButton>
                )}
                {item.baselineChatId && (
                    <GcdsButton size="small" buttonRole="secondary" onClick={() => openChatViewer(item.baselineChatId, lang)}>
                        {t('experimental.results.detail.viewBaselineChatLogs')}
                    </GcdsButton>
                )}
            </div>

            {analysisResults.length > 0 && (
                <div className="mt-400">
                    <h3>{t('experimental.results.detail.analyzerResults')}</h3>
                    {analysisResults.map(([analyzerId, result]) => (
                        <AnalyzerResultDetails key={analyzerId} analyzerId={analyzerId} result={result} />
                    ))}
                </div>
            )}

            {analysisErrors.length > 0 && (
                <div className="mt-400">
                    <h3>{t('experimental.results.detail.analyzerErrors')}</h3>
                    {analysisErrors.map(([analyzerId, error]) => (
                        <div key={analyzerId} className="mb-200">
                            <strong>{analyzerId}</strong>: {typeof error === 'string' ? error : JSON.stringify(error)}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
