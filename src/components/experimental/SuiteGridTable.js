import React from 'react';
import { GcdsText } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { formatNumber } from '../../utils/numberFormat.js';
import { truncate } from '../../utils/experimental/batchItems.js';

const VERDICT_CELL_STYLES = {
    pass: { backgroundColor: '#d8eeca', color: '#1d4d27' },
    flagged: { backgroundColor: '#fdd7d9', color: '#a12622' },
    error: { backgroundColor: '#f3c4c6', color: '#7a1b16' },
    missing: { backgroundColor: '#f1f1f1', color: '#666' }
};

const VERDICT_SYMBOLS = {
    pass: '✓',
    flagged: '✗',
    error: '!',
    missing: '·'
};

const CELL_BASE = {
    border: '1px solid #ddd',
    padding: '0.5rem 0.75rem',
    textAlign: 'center',
    fontWeight: 'bold',
    cursor: 'pointer',
    minWidth: '3.5rem'
};

const displayVerdict = (cell) => {
    if (!cell) return 'missing';
    if (cell.verdict === 'pass' || cell.verdict === 'flagged' || cell.verdict === 'error') {
        return cell.verdict;
    }
    return 'missing';
};

/**
 * The runs x tests grid: one row per analysis run (oldest first), one
 * column per test. Cells are click-through to the item drill-down.
 */
export default function SuiteGridTable({ tests, runs, cells, lang = 'en', onCellClick }) {
    const { t } = useTranslations(lang);
    const locale = String(lang || 'en').toLowerCase().startsWith('fr') ? 'fr-CA' : 'en-CA';

    if (!runs || runs.length === 0) {
        return <GcdsText>{t('experimental.suite.noRuns')}</GcdsText>;
    }

    const runLabel = (run, index) => run.runLabel || run.name || `v${index}`;

    const passCount = (run) => tests.reduce((count, test) => {
        const cell = cells[run._id]?.[test.position];
        return count + (displayVerdict(cell) === 'pass' ? 1 : 0);
    }, 0);

    return (
        <div className="overflow-auto">
            <table style={{ borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th style={{ ...CELL_BASE, cursor: 'default', textAlign: 'left' }}>
                            {t('experimental.suite.runColumn')}
                        </th>
                        <th style={{ ...CELL_BASE, cursor: 'default' }}>
                            {t('experimental.suite.scoreColumn')}
                        </th>
                        {tests.map(test => (
                            <th
                                key={test.position}
                                style={{ ...CELL_BASE, cursor: 'default', verticalAlign: 'bottom' }}
                                title={test.question}
                            >
                                <div>{test.testName}</div>
                                {test.caseType && (
                                    <div style={{ fontWeight: 'normal', fontSize: '0.75rem', color: '#555' }}>
                                        {t(`experimental.suite.caseType.${test.caseType}`)}
                                    </div>
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {runs.map((run, index) => (
                        <tr key={run._id}>
                            <td style={{ ...CELL_BASE, cursor: 'default', textAlign: 'left', fontWeight: 'normal' }}>
                                <div><strong>{truncate(runLabel(run, index), 60)}</strong></div>
                                <div style={{ fontSize: '0.75rem', color: '#555' }}>
                                    {[
                                        run.appVersion ? String(run.appVersion).slice(-10) : '',
                                        new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(run.createdAt))
                                    ].filter(Boolean).join(' · ')}
                                </div>
                            </td>
                            <td style={{ ...CELL_BASE, cursor: 'default' }}>
                                {formatNumber(passCount(run), lang)}/{formatNumber(tests.length, lang)}
                            </td>
                            {tests.map(test => {
                                const verdict = displayVerdict(cells[run._id]?.[test.position]);
                                const clickable = verdict !== 'missing';
                                return (
                                    <td
                                        key={test.position}
                                        style={{ ...CELL_BASE, ...VERDICT_CELL_STYLES[verdict], cursor: clickable ? 'pointer' : 'default' }}
                                        title={`${test.testName} — ${t(`experimental.suite.verdict.${verdict}`)}`}
                                        role={clickable ? 'button' : undefined}
                                        tabIndex={clickable ? 0 : undefined}
                                        aria-label={`${test.testName} — ${t(`experimental.suite.verdict.${verdict}`)}`}
                                        onClick={() => clickable && onCellClick(run, test)}
                                        onKeyDown={(e) => {
                                            if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                                                e.preventDefault();
                                                onCellClick(run, test);
                                            }
                                        }}
                                    >
                                        {VERDICT_SYMBOLS[verdict]}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
