import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsInput, GcdsLink } from '@cdssnc/gcds-components-react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';
import { formatNumber } from '../../utils/numberFormat.js';
import { getPath } from '../../utils/routes.js';
import ExperimentalServerDataTable from '../../components/experimental/ExperimentalServerDataTable.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
}[character]));
import StatusMessage from '../../components/admin/StatusMessage.js';

export default function ExperimentalDatasetsPage({ lang = 'en' }) {
    const { t } = useTranslations(lang);
    const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
    const [datasets, setDatasets] = useState([]);
    const [datasetListResult, setDatasetListResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [exportingDatasetId, setExportingDatasetId] = useState(null);
    const [message, setMessage] = useState(null);
    const [processingDatasetId, setProcessingDatasetId] = useState(null);
    const processingDatasetRef = useRef(null);

    // Upload form state
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newType, setNewType] = useState('question-only');
    const [newCategory, setNewCategory] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);

    const [showUpload, setShowUpload] = useState(false);

    // WCAG 2.2.2 (Pause, Stop, Hide) intentionally NOT applied here, unlike
    // the equivalent polls on BatchList/SessionPage/ExperimentalAnalysisPage.
    // fetchDatasets() below isn't a pure display refresh: in lambda/no-Redis
    // executionMode, it's also the only code path that detects a queued/
    // processing dataset and drives its creation forward one batch at a time
    // (see handleProcessDataset call below and
    // ExperimentalBatchClientService.processDataset / queueInstantAnswerDataset
    // in services/experimental/ExperimentalDatasetService.js). A pause button
    // here would silently stall an in-flight dataset-creation job, and the
    // manual "Start again" button is disabled for exactly the
    // queued/processing statuses that pausing would strand it in — so there'd
    // be no way to resume short of unpausing.
    // TODO: before this page can get a compliant pause control, split the
    // "redraw the table" concern from the "advance lambda-mode processing"
    // concern (e.g. poll display state on its own timer, and drive
    // processing via a mechanism a pause toggle can't touch).
    useEffect(() => {
        fetchDatasets(true);
        const refreshTimer = window.setInterval(() => {
            fetchDatasets(false);
        }, 5000);
        return () => window.clearInterval(refreshTimer);
    }, []);

    const fetchDatasets = async (showLoading = false) => {
        if (showLoading) setLoading(true);
        try {
            const result = await ExperimentalBatchClientService.listDatasets(1, 10);
            setDatasets(result.data);
            setDatasetListResult(result);
            if (result.executionMode === 'lambda') {
                const active = (result.data || []).find(ds => ['queued', 'processing'].includes(ds.creationStatus));
                if (active && !processingDatasetRef.current) {
                    await handleProcessDataset(active, false, false);
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            if (!newName) setNewName(file.name.split('.')[0]);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile || !newName) return;

        setUploading(true);
        setMessage(null);

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target.result.split(',')[1];
                try {
                    await ExperimentalBatchClientService.uploadDataset(
                        base64,
                        selectedFile.type,
                        selectedFile.name,
                        { name: newName, description: newDesc, type: newType, category: newCategory.trim() }
                    );
                    setMessage({ type: 'success', text: t('experimental.datasets.uploadSuccess') });
                    fetchDatasets();
                    setNewName('');
                    setNewDesc('');
                    setNewCategory('');
                    setSelectedFile(null);
                    setShowUpload(false);
                } catch (err) {
                    setMessage({
                        type: 'error',
                        text: err.response?.data?.error || t('experimental.datasets.uploadFailed'),
                        details: err.response?.data?.details
                    });
                } finally {
                    setUploading(false);
                }
            };
            reader.readAsDataURL(selectedFile);
        } catch (err) {
            console.error(err);
            setUploading(false);
            setMessage({ type: 'error', text: t('experimental.datasets.readFailed') });
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm(t('experimental.datasets.confirmDelete'))) return;

        try {
            await ExperimentalBatchClientService.deleteDataset(id);
            fetchDatasets();
        } catch (err) {
            if (err.response?.data?.code === 'IN_USE') {
                alert(t('experimental.datasets.inUse'));
            } else {
                alert(err.response?.data?.error || err.message);
            }
        }
    };

    const handleViewDataset = (id) => {
        // Navigate to analysis page with pre-selected dataset
        window.location.href = `${getPath('experimental-analysis', lang)}?datasetId=${id}`;
    };

    const handleExportDataset = async (dataset) => {
        setExportingDatasetId(dataset._id);
        try {
            const blob = await ExperimentalBatchClientService.exportDataset(dataset._id);
            const fileName = `dataset-${dataset.name || dataset._id}.csv`
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9._-]+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '') || `dataset-${dataset._id}.csv`;

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export dataset error:', err);
            alert(t('experimental.datasets.exportFailed'));
        } finally {
            setExportingDatasetId(null);
        }
    };

    const handleProcessDataset = async (dataset, showMessage = true, refresh = true) => {
        if (processingDatasetRef.current === dataset._id) return;
        processingDatasetRef.current = dataset._id;
        setProcessingDatasetId(dataset._id);
        try {
            await ExperimentalBatchClientService.processDataset(dataset._id, dataset.creationStatus === 'processing');
            if (refresh) await fetchDatasets(false);
        } catch (err) {
            const alreadyProcessing = err.code === 'stillProcessing' || err.status === 409;
            if (!alreadyProcessing) {
                console.error('Process dataset error:', err);
                if (showMessage) setMessage({ type: 'error', text: err.message || t('experimental.datasets.processFailed') });
            }
        } finally {
            processingDatasetRef.current = null;
            setProcessingDatasetId(null);
        }
    };

    const typeInfo = newType === 'qa-pair'
        ? {
            description: t('experimental.datasets.uploadDescriptions.qaPair'),
            columns: t('experimental.datasets.uploadColumns.qaPair')
        }
        : {
            description: t('experimental.datasets.uploadDescriptions.questionOnly'),
            columns: t('experimental.datasets.uploadColumns.questionOnly')
        };

    const columnVariants = [
        { field: t('experimental.datasets.columnVariants.question.field'), variants: t('experimental.datasets.columnVariants.question.variants') },
        ...(newType === 'qa-pair' ? [{ field: t('experimental.datasets.columnVariants.answer.field'), variants: t('experimental.datasets.columnVariants.answer.variants') }] : []),
        ...(newType === 'qa-pair' ? [{ field: t('experimental.datasets.columnVariants.referenceAnswer.field'), variants: t('experimental.datasets.columnVariants.referenceAnswer.variants') }] : []),
        { field: t('experimental.datasets.columnVariants.referringUrl.field'), variants: t('experimental.datasets.columnVariants.referringUrl.variants') },
        { field: t('experimental.datasets.columnVariants.chatId.field'), variants: t('experimental.datasets.columnVariants.chatId.variants') }
    ];

    const datasetColumns = [
        {
            title: t('experimental.datasets.nameLabel'),
            data: 'name',
            width: '24%',
            render: (data, type, row) => type === 'display'
                ? `<div class="experimental-dataset-name"><strong>${escapeHtml(data)}</strong>${row.description ? `<span>${escapeHtml(row.description)}</span>` : ''}</div>`
                : data
        },
        {
            title: t('experimental.datasets.typeLabel'),
            data: 'type',
            width: '10%',
            render: (data, type) => type !== 'display' ? data : data === 'question-only'
                ? t('experimental.datasets.type.questionOnly')
                : data === 'qa-pair'
                    ? t('experimental.datasets.type.qaPair')
                    : data === 'batch-output'
                        ? t('experimental.datasets.type.batchOutput')
                        : data
        },
        { title: t('experimental.datasets.uploadedBy'), data: null, width: '16%', render: (_data, _type, row) => row.createdBy?.email || t('common.na') },
        { title: t('experimental.datasets.rowCount'), data: 'rowCount', width: '4%', render: (data, type) => type === 'display' ? formatNumber(data, lang) : data },
        {
            title: t('experimental.datasets.creationStatus.title'),
            data: 'creationStatus',
            width: '11%',
            render: (data, _type, row) => {
                const status = (!data || data === 'complete') ? t('experimental.datasets.creationStatus.complete') : t(`experimental.datasets.creationStatus.${data}`);
                if (data === 'complete' && row.creationSkippedSourceRows > 0) {
                    return `<span>${status}</span><div class="font-size-text-xsm-nr">${t('experimental.datasets.creationStatus.skippedSourceRows').replace('{count}', formatNumber(row.creationSkippedSourceRows, lang))}</div>`;
                }
                return status;
            }
        },
        { title: t('experimental.datasets.runCountLabel'), data: 'runCount', width: '4%', render: (data, type) => type === 'display' ? formatNumber(data, lang) : data },
        { title: t('experimental.datasets.created'), data: 'createdAt', width: '8%', render: (data, type) => type === 'display' ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(data)) : data }
    ];

    const fetchDatasetTableData = useCallback((query) => (
        ExperimentalBatchClientService.listDatasets(1, 10, query)
    ), []);

    const renderDatasetActions = (ds) => (
        <div className="experimental-table-actions experimental-table-actions--group" role="group" aria-label={t('experimental.datasets.actions')}>
            {ds.creationStatus && ds.creationStatus !== 'complete' && <GcdsButton size="small" buttonRole="secondary" onClick={() => handleProcessDataset(ds)} disabled={['queued', 'processing'].includes(ds.creationStatus) || processingDatasetId === ds._id}>{processingDatasetId === ds._id || ['queued', 'processing'].includes(ds.creationStatus) ? t('experimental.datasets.processing') : t('experimental.datasets.startAgain')}</GcdsButton>}
            <GcdsButton size="small" buttonRole="secondary" onClick={() => handleViewDataset(ds._id)} disabled={ds.creationStatus && ds.creationStatus !== 'complete'}>{t('experimental.datasets.analyze')}</GcdsButton>
            <GcdsButton size="small" buttonRole="secondary" onClick={() => { window.location.href = `${getPath('experimental-suites', lang)}/${ds._id}`; }} disabled={ds.creationStatus && ds.creationStatus !== 'complete'}>{t('experimental.datasets.suiteView')}</GcdsButton>
            <GcdsButton size="small" buttonRole="secondary" onClick={() => handleExportDataset(ds)} disabled={exportingDatasetId === ds._id || (ds.creationStatus && ds.creationStatus !== 'complete')}>{exportingDatasetId === ds._id ? t('experimental.datasets.exporting') : t('experimental.datasets.export')}</GcdsButton>
            <GcdsButton size="small" buttonRole="danger" onClick={() => handleDelete(ds._id)}>{t('experimental.datasets.delete')}</GcdsButton>
        </div>
    );

    return (
        <GcdsContainer layout="page" className="mb-600">
            <GcdsHeading tag="h1">{t('experimental.datasets.title')}</GcdsHeading>
            <div className="mb-400">
                <GcdsLink href={`/${lang}/admin`}>
                    {t('common.backToAdmin')}
                </GcdsLink>
            </div>

            <div className="my-400">
                <GcdsButton onClick={() => setShowUpload(!showUpload)} buttonRole="secondary">
                    {showUpload ? t('experimental.datasets.hideUpload') : t('experimental.datasets.uploadButton')}
                </GcdsButton>
                <GcdsButton
                    buttonRole="secondary"
                    onClick={() => { window.location.href = getPath('experimental-create-dataset', lang); }}
                >
                    {t('experimental.datasets.createButton')}
                </GcdsButton>

                {showUpload && (
                    <div className="mt-400 p-400 border rounded bg-light">
                        <GcdsHeading tag="h2">{t('experimental.datasets.uploadNew')}</GcdsHeading>
                        <div style={{ display: 'grid', gap: '1rem', maxWidth: '600px' }}>
                            <GcdsInput
                                label={t('experimental.datasets.nameLabel')}
                                id="ds-name"
                                value={newName}
                                onGcdsInput={(e) => setNewName(e.target.value)}
                                required
                            />
                            <GcdsInput
                                label={t('experimental.datasets.descLabel')}
                                id="ds-desc"
                                value={newDesc}
                                onGcdsInput={(e) => setNewDesc(e.target.value)}
                            />
                            <div>
                                <label htmlFor="ds-type" style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                                    {t('experimental.datasets.typeLabel')}
                                </label>
                                <select
                                    id="ds-type"
                                    value={newType}
                                    onChange={(e) => setNewType(e.target.value)}
                                    style={{ padding: '8px', width: '100%', marginBottom: '10px' }}
                                >
                                    <option value="question-only">{t('experimental.datasets.type.questionOnly')}</option>
                                    <option value="qa-pair">{t('experimental.datasets.type.qaPair')}</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="ds-category" style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                                    {t('experimental.datasets.categoryLabel')}
                                </label>
                                <input
                                    id="ds-category"
                                    type="text"
                                    value={newCategory}
                                    maxLength={100}
                                    onChange={(e) => setNewCategory(e.target.value)}
                                    placeholder={t('experimental.datasets.categoryPlaceholder')}
                                    style={{ padding: '8px', width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>
                            <GcdsText className="mb-200">
                                {typeInfo.description}
                            </GcdsText>
                            <GcdsText className="mb-200">
                                <strong>{t('experimental.datasets.requiredColumns')}: </strong>
                                {typeInfo.columns}
                            </GcdsText>
                            <GcdsText className="mb-200">
                                {t('experimental.datasets.columnAliasHint')}
                            </GcdsText>
                            <table className="review-table">
                                <caption>{t('experimental.datasets.columnVariants.title')}</caption>
                                <thead>
                                    <tr>
                                        <th>{t('experimental.datasets.columnVariants.fieldHeader')}</th>
                                        <th>{t('experimental.datasets.columnVariants.variantsHeader')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {columnVariants.map(({ field, variants }) => (
                                        <tr key={field}>
                                            <td>{field}</td>
                                            <td>{variants}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div>
                                <label htmlFor="experimental-dataset-file" style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                                    {t('experimental.datasets.fileLabel')}
                                </label>
                                <input id="experimental-dataset-file" type="file" accept=".xlsx, .csv" onChange={handleFileChange} />
                            </div>
                            <div>
                                <GcdsButton onClick={handleUpload} disabled={uploading || !selectedFile || !newName}>
                                    {uploading ? t('experimental.datasets.uploading') : t('experimental.datasets.upload')}
                                </GcdsButton>
                            </div>
                            <StatusMessage
                                message={message?.text}
                                isError={message?.type !== 'success'}
                                tag="div"
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '4px',
                                    backgroundColor: message?.type === 'success' ? '#d4edda' : '#f8d7da',
                                    color: message?.type === 'success' ? '#155724' : '#721c24',
                                }}
                            >
                                {message && (
                                    <>
                                        <GcdsText>{message.text}</GcdsText>
                                        {message.details && Array.isArray(message.details) && message.details.length > 0 && (
                                            <ul style={{ marginTop: '0.5rem', marginBottom: 0, paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                                                {message.details.map((detail, i) => (
                                                    <li key={i}>{detail}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </>
                                )}
                            </StatusMessage>
                        </div>
                    </div>
                )}
            </div>

            <GcdsHeading tag="h2" className="mt-600">{t('experimental.datasets.existing')}</GcdsHeading>
            {loading ? (
                <GcdsText>{t('experimental.datasets.loading')}</GcdsText>
            ) : (
                    <ExperimentalServerDataTable
                        columns={datasetColumns}
                        fetchData={fetchDatasetTableData}
                        actionsTitle={t('experimental.datasets.actions')}
                        renderActions={renderDatasetActions}
                        lang={lang}
                        initialResult={datasetListResult}
                        emptyTableText={t('experimental.datasets.empty')}
                        actionsWidth="23%"
                        autoWidth={false}
                        containerClassName="experimental-table-container experimental-dataset-table-container"
                        tableKey={`datasets-${processingDatasetId || ''}-${exportingDatasetId || ''}`}
                    order={[[6, 'desc']]}
                />
            )}
        </GcdsContainer>
    );
}
