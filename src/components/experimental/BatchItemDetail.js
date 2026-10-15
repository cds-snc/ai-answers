import React from 'react';
import { GcdsButton, GcdsDetails, GcdsHeading } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { getPath } from '../../utils/routes.js';
import { getItemVerdict, humanizeFieldName, truncate, flattenAnalyzerValue } from '../../utils/experimental/batchItems.js';

const VERDICT_STYLES = {
    pass: { color: '#2e8540' },
    flagged: { color: '#d30800' },
    error: { color: '#d30800' }
};

const openChatViewer = (chatId, lang) => {
    try {
        localStorage.setItem('chatId', chatId);
    } catch (err) {
        console.error('Failed to store chatId for ChatViewer:', err);
    }
    window.open(getPath('chat-viewer', lang), '_blank', 'noopener');
};

const getAnalyzerColumns = (items) => {
    const fieldsByAnalyzer = new Map();

    items.forEach((item) => {
        Object.entries(item.analysisResults || {}).forEach(([analyzerId, result]) => {
            if (!fieldsByAnalyzer.has(analyzerId)) fieldsByAnalyzer.set(analyzerId, new Set());
            const fields = fieldsByAnalyzer.get(analyzerId);
            const flattened = flattenAnalyzerValue(result);
            Object.keys(flattened).forEach(field => fields.add(field));
        });
        Object.keys(item.analysisErrors || {}).forEach((analyzerId) => {
            if (!fieldsByAnalyzer.has(analyzerId)) fieldsByAnalyzer.set(analyzerId, new Set());
            fieldsByAnalyzer.get(analyzerId).add('error');
        });
    });

    return [...fieldsByAnalyzer.entries()].flatMap(([analyzerId, fields]) => (
        [...fields].map(field => ({ analyzerId, field }))
    ));
};

const formatAnalyzerValue = (value) => {
    if (value === undefined || value === null || value === '') return '—';
    if (typeof value === 'object') return truncate(JSON.stringify(value), 240);
    return truncate(String(value), 240);
};

const renderAnalyzerCell = (item, analyzerId, field) => {
    const error = item.analysisErrors?.[analyzerId];
    if (field === 'error') {
        return error ? formatAnalyzerValue(error) : '—';
    }

    const result = item.analysisResults?.[analyzerId];
    if (result === undefined || result === null) return '—';
    if (field === 'result') return formatAnalyzerValue(result);
    return formatAnalyzerValue(flattenAnalyzerValue(result)[field]);
};

const renderAnalyzerSummary = (item, analyzerId, comparisonMode = false) => {
    const error = item.analysisErrors?.[analyzerId];
    if (error) return formatAnalyzerValue(error);

    const result = item.analysisResults?.[analyzerId];
    if (result === undefined || result === null) return '—';
    if (typeof result !== 'object') return formatAnalyzerValue(result);

    const verdict = result.verdict || result.status || result.label;
    const explanation = comparisonMode
        ? result.comparisonExplanation || result.explanation || result.differenceExplanation
        : result.explanation || result.differenceExplanation;
    const summary = [verdict, explanation].filter(Boolean).join(': ');
    return summary ? truncate(summary, 240) : formatAnalyzerValue(result);
};

/**
 * Chat-level drill-down: one block per interaction - its fields as a labelled
 * list, the two answers side by side in a table (the one comparison here),
 * and each analyzer's full output in its own collapsible section.
 */
export default function BatchItemDetail({
    item,
    lang = 'en',
    position,
    totalInFilter,
    trialsCount = 1,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    onBack,
    chatItems = [],
    comparisonMode = false,
    backButtonRef
}) {
    const { t } = useTranslations(lang);
    if (!item) return null;

    const interactions = chatItems.length > 0 ? chatItems : [item];
    const analyzerColumns = getAnalyzerColumns(interactions);
    const analyzerIds = [...new Set(analyzerColumns.map(column => column.analyzerId))];
    // Translated analyzer name; an analyzer with no locale entry falls back to
    // its id, as on the Analysis page.
    const analyzerName = (analyzerId) => {
        const key = `experimental.analysis.analyzers.${analyzerId}.name`;
        const name = t(key);
        return name === key ? humanizeFieldName(analyzerId) : name;
    };
    const verdict = getItemVerdict(item);
    const verdictLabel = t(`experimental.results.verdict.${verdict}`);
    const referenceAnswerLabel = comparisonMode
        ? t('experimental.results.detail.baselineAnswer')
        : t('experimental.results.detail.referenceAnswer');
    const currentAnswerLabel = comparisonMode
        ? t('experimental.results.detail.comparedAnswer')
        : t('experimental.results.detail.currentAnswer');
    const noReferenceAnswerLabel = comparisonMode
        ? t('experimental.results.detail.noBaselineAnswer')
        : t('experimental.results.detail.noReferenceAnswer');
    const noAnswerLabel = comparisonMode
        ? t('experimental.results.detail.noComparedAnswer')
        : t('experimental.results.detail.noAnswer');

    return (
        <section>
            <div className="mb-300" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <GcdsButton ref={backButtonRef} size="small" buttonRole="secondary" onClick={onBack}>
                    {t('experimental.results.detail.backToList')}
                </GcdsButton>
                <GcdsButton size="small" buttonRole="secondary" disabled={!hasPrev} onClick={onPrev}>
                    {t('experimental.results.detail.previous')}
                </GcdsButton>
                <GcdsButton size="small" buttonRole="secondary" disabled={!hasNext} onClick={onNext}>
                    {t('experimental.results.detail.next')}
                </GcdsButton>
                {position && (
                    <span>{t('experimental.results.detail.position')
                        .replace('{current}', String(position))
                        .replace('{total}', String(totalInFilter))}</span>
                )}
                <span style={{ ...VERDICT_STYLES[verdict], fontWeight: 'bold' }}>{verdictLabel}</span>
                {trialsCount > 1 && (
                    <span>{t('experimental.results.detail.trial')
                        .replace('{n}', String(item.trialIndex || 1))
                        .replace('{total}', String(trialsCount))}</span>
                )}
            </div>

            <div className="mb-300">
                <strong>{t('experimental.results.detail.chat')}</strong>: {item.chatId || t('experimental.results.table.noChatId')}
            </div>

            {interactions.map((interaction, index) => {
                const headingId = `interaction-${interaction._id || index}-heading`;
                const interactionVerdict = getItemVerdict(interaction);
                return (
                    <section key={interaction._id || index} aria-labelledby={headingId} className="mb-500">
                        <GcdsHeading tag="h2" id={headingId}>
                            {t('experimental.results.detail.interactionNumber').replace('{n}', String(index + 1))}
                        </GcdsHeading>
                        <dl className="experimental-interaction-dl">
                            <div>
                                <dt>{t('experimental.results.detail.question')}</dt>
                                <dd>{interaction.question || '—'}</dd>
                            </div>
                        </dl>
                        {/* The two answers are the one comparison here, so they get a table. */}
                        <table className="experimental-answer-table" aria-labelledby={headingId}>
                            <thead>
                                <tr>
                                    <th scope="col">{referenceAnswerLabel}</th>
                                    <th scope="col">{currentAnswerLabel}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>{interaction.goldenReferenceAnswer || interaction.referenceAnswer || noReferenceAnswerLabel}</td>
                                    <td>{interaction.answer || noAnswerLabel}</td>
                                </tr>
                            </tbody>
                        </table>
                        <dl className="experimental-interaction-dl">
                            <div>
                                <dt>{t('experimental.results.table.verdict')}</dt>
                                <dd>{t(`experimental.results.verdict.${interactionVerdict}`)}</dd>
                            </div>
                            {analyzerIds.map(analyzerId => (
                                <div key={analyzerId}>
                                    <dt>
                                        {analyzerName(analyzerId)}
                                        {comparisonMode ? `: ${humanizeFieldName('comparisonExplanation')}` : ''}
                                    </dt>
                                    <dd>{renderAnalyzerSummary(interaction, analyzerId, comparisonMode)}</dd>
                                </div>
                            ))}
                        </dl>
                        {analyzerIds.map(analyzerId => (
                            <GcdsDetails
                                key={analyzerId}
                                detailsTitle={t('experimental.results.detail.analyzerDetails').replace('{analyzer}', () => analyzerName(analyzerId))}
                                className="mb-300"
                            >
                                <dl className="experimental-interaction-dl">
                                    {analyzerColumns.filter(column => column.analyzerId === analyzerId).map(({ field }) => (
                                        <div key={field}>
                                            <dt>{humanizeFieldName(field)}</dt>
                                            <dd>{renderAnalyzerCell(interaction, analyzerId, field)}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </GcdsDetails>
                        ))}
                        {interaction.chatId && (
                            <GcdsButton size="small" buttonRole="secondary" onClick={() => openChatViewer(interaction.chatId, lang)}>
                                {t('experimental.results.detail.viewChatLogs')}
                            </GcdsButton>
                        )}
                    </section>
                );
            })}
        </section>
    );
}
