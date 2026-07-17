import React from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { humanizeFieldName } from '../../utils/experimental/batchItems.js';

const CELL_STYLE = { border: '1px solid #ddd', padding: '0.5rem', verticalAlign: 'top', textAlign: 'left' };

const VERDICT_COLORS = {
    pass: '#2e8540',
    fail: '#d30800',
    flagged: '#d30800',
    'needs-review': '#b07a00'
};

const isScalar = (value) => value === null
    || ['string', 'number', 'boolean'].includes(typeof value);

const renderScalar = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
};

const renderObjectTable = (rows) => {
    // Union of keys across all rows so ragged arrays still render.
    const keys = [...new Set(rows.flatMap(row => Object.keys(row || {})))];
    return (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '0.25rem' }}>
            <thead>
                <tr>
                    {keys.map(key => <th key={key} style={CELL_STYLE}>{humanizeFieldName(key)}</th>)}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, idx) => (
                    <tr key={idx}>
                        {keys.map(key => (
                            <td key={key} style={CELL_STYLE}>
                                {isScalar(row?.[key]) ? renderScalar(row?.[key]) : JSON.stringify(row?.[key])}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const renderValue = (value) => {
    if (isScalar(value)) {
        return <span>{renderScalar(value)}</span>;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return <span>—</span>;
        if (value.every(isScalar)) {
            return (
                <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
                    {value.map((entry, idx) => <li key={idx}>{renderScalar(entry)}</li>)}
                </ul>
            );
        }
        return renderObjectTable(value);
    }
    return (
        <pre style={{ margin: '0.25rem 0 0', whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
            {JSON.stringify(value, null, 2)}
        </pre>
    );
};

/**
 * Structured rendering of one analyzer's output for a batch item.
 * Field names come from analyzer output (internal identifiers); values are
 * judge-generated content. Works for any analyzer shape: scalars, string
 * lists (keyIdeasMissing), and object arrays (changedFacts) all render.
 */
export default function AnalyzerResultDetails({ analyzerId, result, lang = 'en' }) {
    const { t } = useTranslations(lang);

    if (!result || typeof result !== 'object') {
        return <div>{renderScalar(result)}</div>;
    }

    const entries = Object.entries(result)
        .filter(([key, value]) => key !== 'explanation' && value !== undefined);

    const verdict = result.verdict || result.status || result.label;
    const verdictColor = VERDICT_COLORS[String(verdict || '').toLowerCase()] || '#26374a';

    return (
        <div className="mb-400" data-analyzer={analyzerId}>
            <div className="mb-200">
                <strong>{humanizeFieldName(analyzerId)}</strong>
                {verdict !== undefined && (
                    <span style={{ color: verdictColor, fontWeight: 'bold', marginLeft: '0.5rem' }}>
                        {String(verdict)}
                    </span>
                )}
            </div>
            <dl style={{ margin: 0 }}>
                {result.explanation && (
                    <div style={{ marginBottom: '0.5rem' }}>
                        <dt style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                            {t('experimental.results.table.explanation')}
                        </dt>
                        <dd style={{ margin: 0 }}>{renderValue(result.explanation)}</dd>
                    </div>
                )}
                {entries.map(([key, value]) => (
                    <div key={key} style={{ marginBottom: '0.5rem' }}>
                        <dt style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{humanizeFieldName(key)}</dt>
                        <dd style={{ margin: 0 }}>{renderValue(value)}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}
