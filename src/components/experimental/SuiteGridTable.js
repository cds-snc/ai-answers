import React from 'react';
import { GcdsText } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { formatNumber } from '../../utils/numberFormat.js';
import { truncate } from '../../utils/experimental/batchItems.js';

const VERDICT_CELL_STYLES = {
    pass: { backgroundColor: '#d8eeca', color: '#1d4d27' },
    mixed: { backgroundColor: '#fbe9c6', color: '#7a5a00' },
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
    if (['pass', 'mixed', 'flagged', 'error'].includes(cell.verdict)) {
        return cell.verdict;
    }
    return 'missing';
};

// Cell body: single trial keeps the plain ✓/✗ symbol; multiple trials show
// k/n with a per-trial mini strip underneath.
const renderCellContent = (cell, verdict) => {
    if (!cell || cell.total <= 1) {
        return VERDICT_SYMBOLS[verdict] || VERDICT_SYMBOLS.missing;
    }
    return (
        <div>
            <div>{cell.passCount}/{cell.total}</div>
            <div style={{ fontSize: '0.7rem', letterSpacing: '2px' }}>
                {cell.trials.map(t => VERDICT_SYMBOLS[t] || VERDICT_SYMBOLS.missing).join('')}
            </div>
        </div>
    );
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

    // pass^n: every trial passed. pass@n: at least one trial passed.
    const runScores = (run) => tests.reduce((scores, test) => {
        const cell = cells[run._id]?.[test.position];
        if (displayVerdict(cell) === 'pass') scores.all += 1;
        if (cell?.passCount > 0) scores.any += 1;
        if (cell?.total > 1) scores.hasTrials = true;
        return scores;
    }, { all: 0, any: 0, hasTrials: false });

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
                                title={`${test.testName} — ${test.question}`}
                            >
                                <div style={{ whiteSpace: 'nowrap' }}>{truncate(test.testName, 14)}</div>
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
                                {(() => {
                                    const scores = runScores(run);
                                    if (!scores.hasTrials) {
                                        return `${formatNumber(scores.all, lang)}/${formatNumber(tests.length, lang)}`;
                                    }
                                    return (
                                        <div style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>
                                            <div><strong>{formatNumber(scores.all, lang)}/{formatNumber(tests.length, lang)}</strong> {t('experimental.suite.scoreAll')}</div>
                                            <div>{formatNumber(scores.any, lang)}/{formatNumber(tests.length, lang)} {t('experimental.suite.scoreAny')}</div>
                                        </div>
                                    );
                                })()}
                            </td>
                            {tests.map(test => {
                                const cell = cells[run._id]?.[test.position];
                                const verdict = displayVerdict(cell);
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
                                        {renderCellContent(cell, verdict)}
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
