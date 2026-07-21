import React, { useEffect, useState } from 'react';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsInput, GcdsLink } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';
import { formatNumber } from '../../utils/numberFormat.js';
import { getPath } from '../../utils/routes.js';

export default function ExperimentalCreateDatasetPage({ lang = 'en' }) {
    const { t } = useTranslations(lang);
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
            setMessage({
                type: 'error',
                text: method === 'instant-answer'
                    ? t('experimental.datasets.instantAnswerFailed')
                    : err.response?.data?.error || t('experimental.datasets.goldenAnswerFailed')
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
            <div className="mb-400">
                <GcdsLink href={getPath('experimental-datasets', lang)}>
                    {t('experimental.datasets.backToList')}
                </GcdsLink>
            </div>
            <GcdsText className="mb-400">
                {method === 'instant-answer'
                    ? t('experimental.datasets.instantAnswerDescription')
                    : t('experimental.datasets.goldenAnswerDescription')}
            </GcdsText>
            <div className="d-grid gap-300">
                <GcdsInput label={t('experimental.datasets.nameLabel')} id="dataset-name" value={name} onGcdsInput={(e) => setName(e.target.value)} required />
                <GcdsInput label={t('experimental.datasets.descLabel')} id="dataset-description" value={description} onGcdsInput={(e) => setDescription(e.target.value)} />
                <div>
                    <label className="mb-200 display-block" htmlFor="dataset-method">{t('experimental.datasets.creationMethodLabel')}</label>
                    <select id="dataset-method" value={method} onChange={(e) => setMethod(e.target.value)} required>
                        <option value="golden-answer">{t('experimental.datasets.goldenAnswerMethod')}</option>
                        <option value="instant-answer">{t('experimental.datasets.instantAnswerMethod')}</option>
                    </select>
                </div>
                <div>
                    <label className="mb-200 display-block" htmlFor="dataset-type">{t('experimental.datasets.typeLabel')}</label>
                    <select id="dataset-type" value={type} onChange={(e) => setType(e.target.value)} required>
                        <option value="qa-pair">{t('experimental.datasets.type.qaPair')}</option>
                    </select>
                </div>
                {method === 'instant-answer' && (
                    <GcdsInput
                        label={t('experimental.datasets.occurrencesPerQuestion')}
                        hint={t('experimental.datasets.occurrencesPerQuestionHint')}
                        id="dataset-occurrences"
                        type="number"
                        min="1"
                        max="10"
                        value={String(occurrencesPerQuestion)}
                        onGcdsInput={(e) => setOccurrencesPerQuestion(e.target.value)}
                        required
                    />
                )}
                <div>
                    <label className="mb-200 display-block" htmlFor="dataset-category">{t('experimental.datasets.categoryLabel')}</label>
                    <input id="dataset-category" type="text" value={category} maxLength={100} onChange={(e) => setCategory(e.target.value)} placeholder={t('experimental.datasets.categoryPlaceholder')} />
                </div>
                <div>
                    <label className="mb-200 display-block" htmlFor="dataset-start-date">{t('experimental.datasets.startDate')}</label>
                    <input id="dataset-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                </div>
                <div>
                    <label className="mb-200 display-block" htmlFor="dataset-end-date">{t('experimental.datasets.endDate')}</label>
                    <input id="dataset-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                </div>
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
                {message && <GcdsText>{message.text}</GcdsText>}
            </div>
        </GcdsContainer>
    );
}
