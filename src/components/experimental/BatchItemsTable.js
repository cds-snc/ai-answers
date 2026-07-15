import React from 'react';
import { GcdsButton, GcdsText } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { formatNumber } from '../../utils/numberFormat.js';
import { getItemVerdict, getItemExplanation, truncate } from '../../utils/experimental/batchItems.js';

const VERDICT_COLORS = {
    pass: '#2e8540',
    flagged: '#d30800',
    error: '#d30800'
};

/**
 * List of batch items for the results drill-down. Rows open the
 * side-by-side detail view.
 */
export default function BatchItemsTable({ items, groups, lang = 'en', onSelect, showTrials = false }) {
    const { t } = useTranslations(lang);
    const displayGroups = groups || (items || []).map(item => ({ chatId: item.chatId || null, items: [item] }));

    if (displayGroups.length === 0) {
        return <GcdsText>{t('experimental.results.table.empty')}</GcdsText>;
    }

    return (
        <div className="overflow-auto">
            {displayGroups.map((group, groupIndex) => {
                const offset = displayGroups.slice(0, groupIndex).reduce((count, entry) => count + entry.items.length, 0);
                return (
                    <section key={group.chatId || `group-${groupIndex}`} className="mb-500">
                        <h2 className="mb-200">
                            {t('experimental.results.table.chat')}: {group.chatId || t('experimental.results.table.noChatId')}
                        </h2>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                                    <th className="p-200">{t('experimental.results.table.row')}</th>
                                    {showTrials && <th className="p-200">{t('experimental.results.table.trial')}</th>}
                                    <th className="p-200">{t('experimental.results.table.question')}</th>
                                    <th className="p-200">{t('experimental.results.table.verdict')}</th>
                                    <th className="p-200">{t('experimental.results.table.explanation')}</th>
                                    <th className="p-200">{t('experimental.results.table.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.items.map((item, index) => {
                                    const verdict = getItemVerdict(item);
                                    const selectedIndex = offset + index;
                                    return (
                                        <tr
                                            key={item._id || selectedIndex}
                                            style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                                            onClick={() => onSelect(selectedIndex)}
                                        >
                                            <td className="p-200">{formatNumber(item.rowIndex ?? (selectedIndex + 1), lang)}</td>
                                            {showTrials && <td className="p-200">{formatNumber(item.trialIndex || 1, lang)}</td>}
                                            <td className="p-200">{truncate(item.question, 90)}</td>
                                            <td className="p-200">
                                                <span style={{ color: VERDICT_COLORS[verdict] || '#26374a', fontWeight: 'bold' }}>
                                                    {t(`experimental.results.verdict.${verdict}`)}
                                                </span>
                                            </td>
                                            <td className="p-200">{truncate(getItemExplanation(item), 140)}</td>
                                            <td className="p-200">
                                                <GcdsButton
                                                    size="small"
                                                    buttonRole="secondary"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelect(selectedIndex);
                                                    }}
                                                >
                                                    {t('experimental.results.table.view')}
                                                </GcdsButton>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </section>
                );
            })}
        </div>
    );
}
