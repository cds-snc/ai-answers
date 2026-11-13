import React, { useEffect, useState } from 'react';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import { GcdsInput, GcdsSelect, GcdsFieldset } from '@gcds-core/components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';
import { formatNumber } from '../../utils/numberFormat.js';
import { getPath } from '../../utils/routes.js';
import StatusMessage from '../../components/admin/StatusMessage.js';
import { useErrorStatus } from '../../hooks/useErrorStatus.js';

export default function ExperimentalCreateDatasetPage({ lang = 'en' }) {
    const { t } = useTranslations(lang);
    const { wrapErrorDetail } = useErrorStatus(t);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [method, setMethod] = useState('golden-answer');
    const [type, setType] = useState('qa-pair');
    const [category, setCategory] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [rowCount, setRowCount] = useState(null);
    const [sourceRowCount, setSourceRowCount] = useState(null);
    const [occurrencesPerQuestion, setOccurrencesPerQuestion] = useState(2);
    const [loadingCount, setLoadingCount] = useState(false);
    const [creating, setCreating] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        const validOccurrences = Number.isInteger(Number(occurrencesPerQuestion))
            && Number(occurrencesPerQuestion) >= 1
            && Number(occurrencesPerQuestion) <= 10;
        if (!startDate || !endDate || startDate > endDate || (method === 'instant-answer' && !validOccurrences)) {
            setRowCount(null);
            setSourceRowCount(null);
            return undefined;
        }

        let cancelled = false;
        setLoadingCount(true);
        const preview = method === 'instant-answer'
            ? ExperimentalBatchClientService.previewInstantAnswerDataset(startDate, endDate, occurrencesPerQuestion)
            : ExperimentalBatchClientService.previewGoldenAnswerDataset(startDate, endDate);
        preview
            .then((result) => {
                if (!cancelled) {
                    setRowCount(result.rowCount);
                    setSourceRowCount(result.sourceRowCount ?? result.rowCount);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setRowCount(null);
                    setSourceRowCount(null);
                }
            })
            .finally(() => { if (!cancelled) setLoadingCount(false); });

        return () => { cancelled = true; };
    }, [startDate, endDate, method, occurrencesPerQuestion]);

    const handleCreate = async () => {
        setCreating(true);
        setMessage(null);
        try {
            const request = { startDate, endDate, name, description, method, type, category };
            let created;
            if (method === 'instant-answer') {
                created = await ExperimentalBatchClientService.createInstantAnswerDataset({
                    ...request,
                    occurrencesPerQuestion: Number(occurrencesPerQuestion)
                });
            } else {
                created = await ExperimentalBatchClientService.createGoldenAnswerDataset(request);
            }
            setMessage({
                type: 'success',
                text: method === 'instant-answer'
                    ? created?.dataset?.creationStatus === 'queued'
                        ? t('experimental.datasets.instantAnswerQueued')
                        : t('experimental.datasets.instantAnswerSuccess')
                    : t('experimental.datasets.goldenAnswerSuccess')
            });
        } catch (err) {
            // The server occasionally returns a specific, genuinely useful
            // validation reason (data.error) — kept, but wrapped in
            // <code lang="en"> behind a translated prefix rather than shown
            // raw, via wrapErrorDetail (useErrorStatus.js).
            const detail = err.response?.data?.error;
            let goldenAnswerText = t('experimental.datasets.goldenAnswerFailed');
            if (detail) {
                const wrapped = wrapErrorDetail('experimental.datasets.goldenAnswerFailedDetail', { message: detail });
                goldenAnswerText = <>{wrapped.prefix}{wrapped.detail}{wrapped.suffix}</>;
            }
            setMessage({
                type: 'error',
                text: method === 'instant-answer'
                    ? t('experimental.datasets.instantAnswerFailed')
                    : goldenAnswerText
            });
        } finally {
            setCreating(false);
        }
    };

    const canCreate = Boolean(
        name.trim() && startDate && endDate && startDate <= endDate &&
        rowCount !== null && rowCount > 0 && !creating
    );

    return (
        <GcdsContainer layout="page" className="mb-600">
            <GcdsHeading tag="h1">{t('experimental.datasets.createDatasetTitle')}</GcdsHeading>
            <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
                <GcdsLink href={getPath('experimental-datasets', lang)}>
                    {t('experimental.datasets.backToList')}
                </GcdsLink>
            </nav>
            <GcdsText className="mb-400">
                {method === 'instant-answer'
                    ? t('experimental.datasets.instantAnswerDescription')
                    : t('experimental.datasets.goldenAnswerDescription')}
            </GcdsText>
            {/* Same field treatment as the Database and Eval pages: GC DS
                inputs and selects, and native date fields grouped in a
                fieldset with the shared field style. */}
            <div className="text-measure filter-fields-full-size">
                <GcdsInput
                    inputId="dataset-name"
                    name="dataset-name"
                    label={t('experimental.datasets.nameLabel')}
                    value={name}
                    onGcdsInput={(e) => setName(e.target.value)}
                    required
                />
                <GcdsInput
                    inputId="dataset-description"
                    name="dataset-description"
                    label={t('experimental.datasets.descLabel')}
                    value={description}
                    onGcdsInput={(e) => setDescription(e.target.value)}
                />
                <GcdsSelect
                    selectId="dataset-method"
                    name="dataset-method"
                    label={t('experimental.datasets.creationMethodLabel')}
                    value={method}
                    onGcdsChange={(e) => setMethod(e.detail)}
                    required
                >
                    <option value="golden-answer">{t('experimental.datasets.goldenAnswerMethod')}</option>
                    <option value="instant-answer">{t('experimental.datasets.instantAnswerMethod')}</option>
                </GcdsSelect>
                <GcdsSelect
                    selectId="dataset-type"
                    name="dataset-type"
                    label={t('experimental.datasets.typeLabel')}
                    value={type}
                    onGcdsChange={(e) => setType(e.detail)}
                    required
                >
                    <option value="qa-pair">{t('experimental.datasets.type.qaPair')}</option>
                </GcdsSelect>
                {method === 'instant-answer' && (
                    <GcdsInput
                        inputId="dataset-occurrences"
                        name="dataset-occurrences"
                        label={t('experimental.datasets.occurrencesPerQuestion')}
                        hint={t('experimental.datasets.occurrencesPerQuestionHint')}
                        type="number"
                        min="1"
                        max="10"
                        value={String(occurrencesPerQuestion)}
                        onGcdsInput={(e) => setOccurrencesPerQuestion(e.target.value)}
                        required
                    />
                )}
                <GcdsInput
                    inputId="dataset-category"
                    name="dataset-category"
                    label={t('experimental.datasets.categoryLabel')}
                    hint={t('experimental.datasets.categoryPlaceholder')}
                    maxlength={100}
                    value={category}
                    onGcdsInput={(e) => setCategory(e.target.value)}
                />
                <GcdsFieldset className="mb-300" legend={t('experimental.datasets.dateRangeLegend')} legendSize="h6">
                    <div className="mb-300">
                        <label htmlFor="dataset-start-date" className="filter-label display-block">
                            {t('experimental.datasets.startDate')}
                        </label>
                        <input
                            id="dataset-start-date"
                            type="date"
                            className="filter-input filter-input--narrow"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="dataset-end-date" className="filter-label display-block">
                            {t('experimental.datasets.endDate')}
                        </label>
                        <input
                            id="dataset-end-date"
                            type="date"
                            className="filter-input filter-input--narrow"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            required
                        />
                    </div>
                </GcdsFieldset>
                <GcdsText aria-live="polite">
                    {loadingCount
                        ? t('experimental.datasets.loadingGoldenCount')
                        : method === 'instant-answer'
                            ? t('experimental.datasets.instantAnswerRowCount')
                                .replace('{sources}', formatNumber(sourceRowCount || 0, lang))
                                .replace('{rows}', formatNumber(rowCount || 0, lang))
                            : t('experimental.datasets.goldenRowCount').replace('{count}', formatNumber(rowCount || 0, lang))}
                </GcdsText>
                <GcdsButton onClick={handleCreate} disabled={!canCreate}>
                    {creating
                        ? method === 'instant-answer'
                            ? t('experimental.datasets.creatingInstantAnswer')
                            : t('experimental.datasets.creatingGoldenAnswer')
                        : t('experimental.datasets.createButton')}
                </GcdsButton>
                <StatusMessage variant={message?.type}>
                    {message && <GcdsText>{message.text}</GcdsText>}
                </StatusMessage>
            </div>
        </GcdsContainer>
    );
}
