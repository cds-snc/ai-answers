import React, { useState, useEffect } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsInput, GcdsLink } from '@cdssnc/gcds-components-react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';
import { formatNumber } from '../../utils/numberFormat.js';
import { getPath } from '../../utils/routes.js';

export default function ExperimentalDatasetsPage({ lang = 'en' }) {
    const { t } = useTranslations(lang);
    const [datasets, setDatasets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [exportingDatasetId, setExportingDatasetId] = useState(null);
    const [message, setMessage] = useState(null);
    const [processingDatasetId, setProcessingDatasetId] = useState(null);

    // Upload form state
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newType, setNewType] = useState('question-only');
    const [newCategory, setNewCategory] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);

    const [showUpload, setShowUpload] = useState(false);

    useEffect(() => {
        fetchDatasets();
        const refreshTimer = window.setInterval(fetchDatasets, 5000);
        return () => window.clearInterval(refreshTimer);
    }, []);

    const fetchDatasets = async () => {
        setLoading(true);
        try {
            const result = await ExperimentalBatchClientService.listDatasets();
            setDatasets(result.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
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
        window.location.href = `/${lang}/experimental/analysis?datasetId=${id}`;
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

    const handleProcessDataset = async (dataset) => {
        setProcessingDatasetId(dataset._id);
        try {
            await ExperimentalBatchClientService.processDataset(dataset._id, dataset.creationStatus === 'processing');
            await fetchDatasets();
        } catch (err) {
            console.error('Process dataset error:', err);
            setMessage({ type: 'error', text: err.message || t('experimental.datasets.processFailed') });
        } finally {
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
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                                    {t('experimental.datasets.fileLabel')}
                                </label>
                                <input type="file" accept=".xlsx, .csv" onChange={handleFileChange} />
                            </div>
                            <div>
                                <GcdsButton onClick={handleUpload} disabled={uploading || !selectedFile || !newName}>
                                    {uploading ? t('experimental.datasets.uploading') : t('experimental.datasets.upload')}
                                </GcdsButton>
                            </div>
                            {message && (
                                <div style={{
                                    padding: '10px 14px',
                                    borderRadius: '4px',
                                    backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
                                    color: message.type === 'success' ? '#155724' : '#721c24',
                                }}>
                                    <GcdsText>{message.text}</GcdsText>
                                    {message.details && Array.isArray(message.details) && message.details.length > 0 && (
                                        <ul style={{ marginTop: '0.5rem', marginBottom: 0, paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                                            {message.details.map((detail, i) => (
                                                <li key={i}>{detail}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <GcdsHeading tag="h2" className="mt-600">{t('experimental.datasets.existing')}</GcdsHeading>
            {loading ? (
                <GcdsText>{t('experimental.datasets.loading')}</GcdsText>
            ) : (
                <div className="overflow-auto">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
                                <th className="p-200">{t('experimental.datasets.nameLabel')}</th>
                                <th className="p-200">{t('experimental.datasets.typeLabel')}</th>
                                <th className="p-200">{t('experimental.datasets.uploadedBy')}</th>
                                <th className="p-200">{t('experimental.datasets.rowCount')}</th>
                                <th className="p-200">{t('experimental.datasets.creationStatus.title')}</th>
                                <th className="p-200">{t('experimental.datasets.runCountLabel')}</th>
                                <th className="p-200">{t('experimental.datasets.created')}</th>
                                <th className="p-200">{t('experimental.datasets.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {datasets.map(ds => (
                                <tr key={ds._id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td className="p-200">
                                        <strong>{ds.name}</strong>
                                        <div style={{ fontSize: '0.8rem', color: '#666' }}>{ds.description}</div>
                                    </td>
                                    <td className="p-200">
                                        {ds.type === 'question-only'
                                            ? t('experimental.datasets.type.questionOnly')
                                            : ds.type === 'qa-pair'
                                                ? t('experimental.datasets.type.qaPair')
                                                : ds.type === 'batch-output'
                                                ? t('experimental.datasets.type.batchOutput')
                                                : ds.type}
                                    </td>
                                    <td className="p-200">{ds.createdBy?.email || t('common.na')}</td>
                                    <td className="p-200">{formatNumber(ds.rowCount, lang)}</td>
                                    <td className="p-200">
                                        {ds.creationStatus === 'queued' && t('experimental.datasets.creationStatus.queued')}
                                        {ds.creationStatus === 'processing' && t('experimental.datasets.creationStatus.processing')}
                                        {ds.creationStatus === 'failed' && t('experimental.datasets.creationStatus.failed')}
                                        {(!ds.creationStatus || ds.creationStatus === 'complete') && t('experimental.datasets.creationStatus.complete')}
                                        {ds.creationStatus === 'failed' && ds.creationError && (
                                            <div className="font-size-text-xsm-nr">{ds.creationError}</div>
                                        )}
                                    </td>
                                    <td className="p-200">
                                        {ds.runCount > 0
                                            ? <strong>{formatNumber(ds.runCount, lang)}</strong>
                                            : formatNumber(0, lang)}
                                    </td>
                                    <td className="p-200">{new Date(ds.createdAt).toLocaleDateString()}</td>
                                    <td className="p-200">
                                        {ds.creationStatus && ds.creationStatus !== 'complete' && (
                                            <GcdsButton
                                                size="small"
                                                buttonRole="secondary"
                                                onClick={() => handleProcessDataset(ds)}
                                                disabled={processingDatasetId === ds._id}
                                            >
                                                {processingDatasetId === ds._id
                                                    ? t('experimental.datasets.processing')
                                                    : t('experimental.datasets.startAgain')}
                                            </GcdsButton>
                                        )}
                                        <div className="d-flex gap-200">
                                            <GcdsButton
                                                size="small"
                                                buttonRole="secondary"
                                                onClick={() => handleViewDataset(ds._id)}
                                                disabled={ds.creationStatus && ds.creationStatus !== 'complete'}
                                            >
                                            {t('experimental.datasets.analyze')}
                                            </GcdsButton>
                                            <GcdsButton
                                                size="small"
                                                buttonRole="secondary"
                                                onClick={() => { window.location.href = `/${lang}/experimental/suites/${ds._id}`; }}
                                                disabled={ds.creationStatus && ds.creationStatus !== 'complete'}
                                            >
                                                {t('experimental.datasets.suiteView')}
                                            </GcdsButton>
                                            <GcdsButton
                                                size="small"
                                                buttonRole="secondary"
                                                onClick={() => handleExportDataset(ds)}
                                                disabled={exportingDatasetId === ds._id || (ds.creationStatus && ds.creationStatus !== 'complete')}
                                            >
                                                {exportingDatasetId === ds._id
                                                    ? t('experimental.datasets.exporting')
                                                    : t('experimental.datasets.export')}
                                            </GcdsButton>
                                            <GcdsButton size="small" buttonRole="danger" onClick={() => handleDelete(ds._id)}>
                                                {t('experimental.datasets.delete')}
                                            </GcdsButton>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {datasets.length === 0 && (
                                <tr>
                                    <td colSpan="8" className="p-400 text-center">{t('experimental.datasets.empty')}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </GcdsContainer>
    );
}
