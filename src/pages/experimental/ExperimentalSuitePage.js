import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GcdsContainer, GcdsHeading, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useExperimentalSuiteGrid } from '../../hooks/experimental/useExperimentalSuiteGrid.js';
import SuiteGridTable from '../../components/experimental/SuiteGridTable.js';

const LEGEND = [
    { verdict: 'pass', style: { backgroundColor: '#d8eeca', color: '#1d4d27' } },
    { verdict: 'mixed', style: { backgroundColor: '#fbe9c6', color: '#7a5a00' } },
    { verdict: 'flagged', style: { backgroundColor: '#fdd7d9', color: '#a12622' } },
    { verdict: 'error', style: { backgroundColor: '#f3c4c6', color: '#7a1b16' } },
    { verdict: 'missing', style: { backgroundColor: '#f1f1f1', color: '#666' } }
];

/**
 * Suite view: every analysis run of a dataset as a row, every test as a
 * column — which prompt/app version fixed which failure, at a glance.
 */
export default function ExperimentalSuitePage({ lang = 'en' }) {
    const { t } = useTranslations(lang);
    const { datasetId } = useParams();
    const navigate = useNavigate();

    const { dataset, tests, runs, cells, loading, error } = useExperimentalSuiteGrid(datasetId);

    const handleCellClick = (run, test) => {
        navigate(`/${lang}/experimental/analysis/${run._id}?open=${test.position}`);
    };

    return (
        <GcdsContainer layout="page" className="mb-600">
            <header className="mb-400">
                <GcdsHeading tag="h1">
                    {dataset?.name || t('experimental.suite.title')}
                </GcdsHeading>
                {dataset?.description && <GcdsText className="mb-200">{dataset.description}</GcdsText>}
                <div className="mb-200">
                    {dataset?.category && (
                        <span className="mr-300">
                            <strong>{t('experimental.suite.categoryLabel')}:</strong> {dataset.category}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <GcdsLink href={`/${lang}/experimental/datasets`}>
                        {t('experimental.datasets.backToList')}
                    </GcdsLink>
                    <GcdsLink href={`/${lang}/experimental/analysis?datasetId=${datasetId}`}>
                        {t('experimental.suite.newRun')}
                    </GcdsLink>
                </div>
            </header>

            {error && (
                <GcdsText role="alert"><strong>{t('experimental.suite.loadError')}</strong></GcdsText>
            )}

            {loading ? (
                <GcdsText>{t('experimental.suite.loading')}</GcdsText>
            ) : (
                <>
                    <SuiteGridTable
                        tests={tests}
                        runs={runs}
                        cells={cells}
                        lang={lang}
                        onCellClick={handleCellClick}
                    />

                    {runs.length > 0 && (
                        <div className="mt-300" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                            {LEGEND.map(({ verdict, style }) => (
                                <span key={verdict} style={{ ...style, padding: '0.15rem 0.5rem', borderRadius: '3px' }}>
                                    {t(`experimental.suite.verdict.${verdict}`)}
                                </span>
                            ))}
                        </div>
                    )}

                    <GcdsText className="mt-400">
                        {t('experimental.suite.columnsHint')}
                    </GcdsText>
                </>
            )}
        </GcdsContainer>
    );
}
