import React, { useState } from 'react';
import { GcdsButton } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { getPath } from '../../utils/routes.js';
import { getItemVerdict, humanizeFieldName, truncate } from '../../utils/experimental/batchItems.js';

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
            if (result && typeof result === 'object' && !Array.isArray(result)) {
                Object.keys(result).forEach(field => fields.add(field));
            } else {
                fields.add('result');
            }
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
    return formatAnalyzerValue(result?.[field]);
};

const renderAnalyzerSummary = (item, analyzerId) => {
    const error = item.analysisErrors?.[analyzerId];
    if (error) return formatAnalyzerValue(error);

    const result = item.analysisResults?.[analyzerId];
    if (result === undefined || result === null) return '—';
    if (typeof result !== 'object') return formatAnalyzerValue(result);

    const verdict = result.verdict || result.status || result.label;
    const explanation = result.explanation || result.differenceExplanation;
    const summary = [verdict, explanation].filter(Boolean).join(': ');
    return summary ? truncate(summary, 240) : formatAnalyzerValue(result);
};

/**
 * Chat-level drill-down: one row per interaction, with analyzer outputs in
 * dynamic columns so the conversation can be reviewed as a table.
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
    chatItems = []
}) {
    const { t } = useTranslations(lang);
    const [detailMode, setDetailMode] = useState(false);

    if (!item) return null;

    const interactions = chatItems.length > 0 ? chatItems : [item];
    const analyzerColumns = getAnalyzerColumns(interactions);
    const analyzerIds = [...new Set(analyzerColumns.map(column => column.analyzerId))];
    const visibleAnalyzerColumns = detailMode
        ? analyzerColumns
        : analyzerIds.map(analyzerId => ({ analyzerId, field: null }));
    const verdict = getItemVerdict(item);
    const verdictLabel = t(`experimental.results.verdict.${verdict}`);

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

            <div className="mb-300" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <GcdsButton
                    size="small"
                    buttonRole={detailMode ? 'secondary' : 'primary'}
                    onClick={() => setDetailMode(false)}
                >
                    {t('experimental.results.detail.simpleView')}
                </GcdsButton>
                <GcdsButton
                    size="small"
                    buttonRole={detailMode ? 'primary' : 'secondary'}
                    onClick={() => setDetailMode(true)}
                >
                    {t('experimental.results.detail.detailedView')}
                </GcdsButton>
            </div>

            <div className="overflow-auto experimental-results-table-container">
                <table className="experimental-results-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                            <th className="p-200">{t('experimental.results.detail.interaction')}</th>
                            <th className="p-200">{t('experimental.results.table.question')}</th>
                            {detailMode && <th className="p-200">{t('experimental.results.detail.referenceAnswer')}</th>}
                            <th className="p-200">{t('experimental.results.detail.currentAnswer')}</th>
                            <th className="p-200">{t('experimental.results.table.verdict')}</th>
                            {visibleAnalyzerColumns.map(({ analyzerId, field }) => (
                                <th key={`${analyzerId}-${field || 'summary'}`} className="p-200">
                                    {humanizeFieldName(analyzerId)}{field ? `: ${humanizeFieldName(field)}` : ''}
                                </th>
                            ))}
                            <th className="p-200">{t('experimental.results.table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {interactions.map((interaction, index) => {
                            const interactionVerdict = getItemVerdict(interaction);
                            return (
                                <tr key={interaction._id || index} style={{ borderBottom: '1px solid #eee', verticalAlign: 'top' }}>
                                    <td className="p-200">{index + 1}</td>
                                    <td className="p-200">{interaction.question || '—'}</td>
                                    {detailMode && (
                                        <td className="p-200">
                                            {truncate(interaction.referenceAnswer || t('experimental.results.detail.noReferenceAnswer'), 180)}
                                        </td>
                                    )}
                                    <td className="p-200">{truncate(interaction.answer || t('experimental.results.detail.noAnswer'), 180)}</td>
                                    <td className="p-200">{t(`experimental.results.verdict.${interactionVerdict}`)}</td>
                                    {visibleAnalyzerColumns.map(({ analyzerId, field }) => (
                                        <td key={`${analyzerId}-${field || 'summary'}`} className="p-200">
                                            {field
                                                ? renderAnalyzerCell(interaction, analyzerId, field)
                                                : renderAnalyzerSummary(interaction, analyzerId)}
                                        </td>
                                    ))}
                                    <td className="p-200">
                                        {interaction.chatId && (
                                            <GcdsButton size="small" buttonRole="secondary" onClick={() => openChatViewer(interaction.chatId, lang)}>
                                                {t('experimental.results.detail.viewChatLogs')}
                                            </GcdsButton>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
