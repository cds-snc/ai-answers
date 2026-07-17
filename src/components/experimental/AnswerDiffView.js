import React, { useMemo } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { wordDiff } from '../../utils/experimental/wordDiff.js';

const REMOVED_STYLE = {
    backgroundColor: '#fdd7d9',
    textDecoration: 'line-through',
    borderRadius: '2px',
    padding: '0 2px'
};
const ADDED_STYLE = {
    backgroundColor: '#d8eeca',
    borderRadius: '2px',
    padding: '0 2px'
};
const PANE_STYLE = {
    flex: '1 1 0',
    minWidth: 0,
    border: '1px solid #ccc',
    borderRadius: '4px',
    padding: '1rem',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    maxHeight: '32rem',
    overflowY: 'auto'
};

const renderSegments = (segments, paneType) => segments.map((segment, idx) => {
    if (segment.type === 'same') {
        return <span key={idx}>{segment.text} </span>;
    }
    if (paneType === 'baseline' && segment.type === 'removed') {
        return <mark key={idx} style={REMOVED_STYLE}>{segment.text} </mark>;
    }
    if (paneType === 'current' && segment.type === 'added') {
        return <mark key={idx} style={ADDED_STYLE}>{segment.text} </mark>;
    }
    return null;
});

/**
 * Side-by-side view of the reference answer and the generated answer,
 * with word-level differences highlighted in each pane.
 */
export default function AnswerDiffView({ referenceAnswer, answer, lang = 'en' }) {
    const { t } = useTranslations(lang);
    const segments = useMemo(() => wordDiff(referenceAnswer, answer), [referenceAnswer, answer]);

    return (
        <div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={PANE_STYLE}>
                    <div className="mb-200"><strong>{t('experimental.results.detail.referenceAnswer')}</strong></div>
                    <div>{renderSegments(segments, 'baseline')}</div>
                </div>
                <div style={PANE_STYLE}>
                    <div className="mb-200"><strong>{t('experimental.results.detail.currentAnswer')}</strong></div>
                    <div>{renderSegments(segments, 'current')}</div>
                </div>
            </div>
            <div className="mt-200" style={{ fontSize: '0.85rem' }}>
                <mark style={REMOVED_STYLE}>{t('experimental.results.detail.legendRemoved')}</mark>
                {' '}
                <mark style={ADDED_STYLE}>{t('experimental.results.detail.legendAdded')}</mark>
            </div>
        </div>
    );
}
