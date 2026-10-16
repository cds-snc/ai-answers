import React from 'react';
import { useParams } from 'react-router-dom';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { getPath } from '../../utils/routes.js';
import { useExperimentalSuiteGrid } from '../../hooks/experimental/useExperimentalSuiteGrid.js';
import SuiteGridTable, { VERDICT_CELL_CLASSES } from '../../components/experimental/SuiteGridTable.js';
import StatusMessage from '../../components/admin/StatusMessage.js';

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

    const { dataset, tests, runs, cells, loading, error } = useExperimentalSuiteGrid(datasetId);

    // TODO(design): the suite grid should hold its data itself rather than
    // linking each cell out to Batch results. Leaving loses the grid's
    // context, the run summary there belongs with the grid's own summary, and
    // symbol cells (✓ ⚑ ! ·) are confusing things to click.
    const cellHref = (run, test) => `${getPath('experimental-analysis', lang)}/${run._id}?open=${test.position}`;

    return (
        <GcdsContainer layout="page" className="mb-600">
            <header className="mb-400">
                {/* Stacked h1 (admin.css .canada-ca-h1-stacked__eyebrow): this page
                    is about one dataset, so its name is the title. */}
                <h1 className="mb-400">
                    {dataset ? (
                        <>
                            <span className="canada-ca-h1-stacked__eyebrow">{t('experimental.suite.title')}</span>
                            <span className="canada-ca-h1-stacked__title">{dataset.name}</span>
                        </>
                    ) : t('experimental.suite.title')}
                </h1>
                <nav aria-label={t('admin.navigation.ariaLabel')}>
                    <GcdsLink href={getPath('experimental-datasets', lang)}>
                        {t('experimental.datasets.backToList')}
                    </GcdsLink>
                </nav>
            </header>

            {dataset && (
                <div className="mb-400">
                    {(dataset.description || dataset.category) && (
                        <dl className="canada-ca-dl-inline">
                            {dataset.description && (
                                <div>
                                    <dt>{t('experimental.suite.descriptionLabel')}</dt>
                                    <dd>{dataset.description}</dd>
                                </div>
                            )}
                            {dataset.category && (
                                <div>
                                    <dt>{t('experimental.suite.categoryLabel')}</dt>
                                    <dd>{dataset.category}</dd>
                                </div>
                            )}
                        </dl>
                    )}
                    <GcdsText marginBottom="0">
                        <GcdsLink href={`${getPath('experimental-analysis', lang)}?datasetId=${datasetId}`}>
                            {t('experimental.suite.newRun')}
                        </GcdsLink>
                    </GcdsText>
                </div>
            )}

            {error && (
                <StatusMessage variant="error" message={t('experimental.suite.loadError')} />
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
                        cellHref={cellHref}
                    />

                    {runs.length > 0 && (
                        <div className="mt-300" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
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
