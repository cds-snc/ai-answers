import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GcdsContainer, GcdsHeading, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { getPath } from '../../utils/routes.js';
import { useExperimentalSuiteGrid } from '../../hooks/experimental/useExperimentalSuiteGrid.js';
import SuiteGridTable, { VERDICT_CELL_CLASSES } from '../../components/experimental/SuiteGridTable.js';

// Same order/verdicts as SuiteGridTable's cells; colours come from its
// exported VERDICT_CELL_CLASSES so this legend can't drift from the grid.
const LEGEND_VERDICTS = ['pass', 'mixed', 'flagged', 'error', 'missing'];

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
        navigate(`${getPath('experimental-analysis', lang)}/${run._id}?open=${test.position}`);
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
                {/* TODO: assess whether the back-link here should be nav-wrapped with
                    an aria-label, matching the admin "back to admin" pattern — it's
                    mixed in with the "new run" action link, not a standalone nav. */}
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <GcdsLink href={getPath('experimental-datasets', lang)}>
                        {t('experimental.datasets.backToList')}
                    </GcdsLink>
                    <GcdsLink href={`${getPath('experimental-analysis', lang)}?datasetId=${datasetId}`}>
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
                            {LEGEND_VERDICTS.map((verdict) => (
                                <span
                                    key={verdict}
                                    className={VERDICT_CELL_CLASSES[verdict]}
                                    style={{ padding: '0.15rem 0.5rem', borderRadius: '3px' }}
                                >
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
