import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useExperimentalBatchItems } from '../../hooks/experimental/useExperimentalBatchItems.js';
import { formatNumber, formatPercent } from '../../utils/numberFormat.js';
import BatchItemsTable from '../../components/experimental/BatchItemsTable.js';
import BatchItemDetail from '../../components/experimental/BatchItemDetail.js';

const FILTERS = ['attention', 'all', 'errors'];

const STAT_STYLE = {
    border: '1px solid #ccc',
    borderRadius: '4px',
    padding: '0.75rem 1rem',
    minWidth: '8rem'
};

/**
 * Results drill-down for one experimental batch: read every answer that
 * deviated from the golden/expert answer without exporting to Excel.
 */
export default function ExperimentalBatchResultsPage({ lang = 'en' }) {
    const { t } = useTranslations(lang);
    const { batchId } = useParams();
    const [searchParams] = useSearchParams();
    const openParam = parseInt(searchParams.get('open'), 10);

    const {
        batch,
        items,
        counts,
        pagination,
        filter,
        setFilter,
        setPage,
        loading,
        error,
        selectedIndex,
        selectedItem,
        positionInFilter,
        selectItem,
        backToList,
        goNext,
        goPrev,
        hasNext,
        hasPrev
    } = useExperimentalBatchItems(batchId, Number.isInteger(openParam) && openParam > 0 ? { openRowIndex: openParam } : {});

    // Arrow-key navigation while reviewing an item.
    useEffect(() => {
        if (selectedIndex === null) return undefined;
        const onKeyDown = (e) => {
            const tag = String(e.target?.tagName || '').toLowerCase();
            if (['input', 'textarea', 'select'].includes(tag)) return;
            if (e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowLeft') goPrev();
            if (e.key === 'Escape') backToList();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    });

    const passCount = Math.max(counts.total - counts.attention, 0);
    const passRate = counts.total > 0 ? Math.round((passCount / counts.total) * 100) : 0;

    return (
        <GcdsContainer layout="page" tag="main" className="mb-600">
            <header className="mb-400">
                <GcdsHeading tag="h1">
                    {batch?.name || t('experimental.results.title')}
                </GcdsHeading>
                {batch?.description && <GcdsText className="mb-200">{batch.description}</GcdsText>}
                <GcdsLink href={`/${lang}/experimental/analysis`}>
                    {t('experimental.results.backToRuns')}
                </GcdsLink>
            </header>

            {error && (
                <GcdsText role="alert"><strong>{t('experimental.results.loadError')}</strong></GcdsText>
            )}

            {/* Summary strip */}
            <section className="mb-400" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={STAT_STYLE}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatNumber(counts.total, lang)}</div>
                    <div>{t('experimental.results.summary.total')}</div>
                </div>
                <div style={STAT_STYLE}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: counts.attention > 0 ? '#d30800' : '#2e8540' }}>
                        {formatNumber(counts.attention, lang)}
                    </div>
                    <div>{t('experimental.results.summary.attention')}</div>
                </div>
                <div style={STAT_STYLE}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatNumber(counts.errors, lang)}</div>
                    <div>{t('experimental.results.summary.errors')}</div>
                </div>
                <div style={STAT_STYLE}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatPercent(passRate, lang)}</div>
                    <div>{t('experimental.results.summary.passRate')}</div>
                </div>
            </section>

            {selectedIndex !== null ? (
                <BatchItemDetail
                    item={selectedItem}
                    lang={lang}
                    position={positionInFilter}
                    totalInFilter={pagination.total}
                    hasPrev={hasPrev}
                    hasNext={hasNext}
                    onPrev={goPrev}
                    onNext={goNext}
                    onBack={backToList}
                />
            ) : (
                <section>
                    <div className="mb-300">
                        <label htmlFor="results-filter" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                            {t('experimental.results.filter.label')}
                        </label>
                        <select
                            id="results-filter"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            style={{ padding: '8px', maxWidth: '20rem' }}
                        >
                            {FILTERS.map(value => (
                                <option key={value} value={value}>
                                    {t(`experimental.results.filter.${value}`)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {loading ? (
                        <GcdsText>{t('experimental.results.loading')}</GcdsText>
                    ) : (
                        <>
                            <BatchItemsTable items={items} lang={lang} onSelect={selectItem} />

                            {pagination.pages > 1 && (
                                <div className="mt-300" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <GcdsButton
                                        size="small"
                                        buttonRole="secondary"
                                        disabled={pagination.page <= 1}
                                        onClick={() => setPage(pagination.page - 1)}
                                    >
                                        {t('experimental.results.pagination.previous')}
                                    </GcdsButton>
                                    <span>
                                        {t('experimental.results.pagination.page')
                                            .replace('{page}', formatNumber(pagination.page, lang))
                                            .replace('{pages}', formatNumber(pagination.pages, lang))}
                                    </span>
                                    <GcdsButton
                                        size="small"
                                        buttonRole="secondary"
                                        disabled={pagination.page >= pagination.pages}
                                        onClick={() => setPage(pagination.page + 1)}
                                    >
                                        {t('experimental.results.pagination.next')}
                                    </GcdsButton>
                                </div>
                            )}
                        </>
                    )}
                </section>
            )}
        </GcdsContainer>
    );
}
