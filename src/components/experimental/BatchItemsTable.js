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
export default function BatchItemsTable({ items, lang = 'en', onSelect }) {
    const { t } = useTranslations(lang);

    if (!items || items.length === 0) {
        return <GcdsText>{t('experimental.results.table.empty')}</GcdsText>;
    }

    return (
        <div className="overflow-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                        <th className="p-200">{t('experimental.results.table.row')}</th>
                        <th className="p-200">{t('experimental.results.table.question')}</th>
                        <th className="p-200">{t('experimental.results.table.verdict')}</th>
                        <th className="p-200">{t('experimental.results.table.explanation')}</th>
                        <th className="p-200">{t('experimental.results.table.actions')}</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, index) => {
                        const verdict = getItemVerdict(item);
                        return (
                            <tr
                                key={item._id || index}
                                style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                                onClick={() => onSelect(index)}
                            >
                                <td className="p-200">{formatNumber(item.rowIndex ?? (index + 1), lang)}</td>
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
                                            onSelect(index);
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
        </div>
    );
}
