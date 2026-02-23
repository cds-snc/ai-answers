import React, { useState, useEffect } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsInput } from '@cdssnc/gcds-components-react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';

export default function ExperimentalDatasetsPage({ lang = 'en' }) {
    const { t } = useTranslations(lang);
    const [datasets, setDatasets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState(null);

    // Upload form state
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newType, setNewType] = useState('question-only');
    const [selectedFile, setSelectedFile] = useState(null);

    useEffect(() => {
        fetchDatasets();
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
                        { name: newName, description: newDesc, type: newType }
                    );
                    setMessage({ type: 'success', text: t('experimental.datasets.uploadSuccess') });
                    fetchDatasets();
                    setNewName('');
                    setNewDesc('');
                    setSelectedFile(null);
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

    const [selectedDataset, setSelectedDataset] = useState(null);
    const [rows, setRows] = useState([]);
    const [rowsLoading, setRowsLoading] = useState(false);
    const [rowsPage, setRowsPage] = useState(1);
    const [rowsTotal, setRowsTotal] = useState(0);

    const fetchRows = async (dataset, page = 1) => {
        setRowsLoading(true);
        try {
            const result = await ExperimentalBatchClientService.getDatasetRows(dataset._id, page);
            setRows(result.rows);
            setRowsTotal(result.total);
            setRowsPage(page);
            setSelectedDataset(dataset);
        } catch (err) {
            console.error(err);
            alert(t('experimental.datasets.errorLoadingRows') || 'Failed to load rows');
        } finally {
            setRowsLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm(t('experimental.datasets.confirmDelete'))) return;

        try {
            await ExperimentalBatchClientService.deleteDataset(id);
            if (selectedDataset?._id === id) setSelectedDataset(null);
            fetchDatasets();
        } catch (err) {
            if (err.response?.data?.code === 'IN_USE') {
                alert(t('experimental.datasets.inUse'));
            } else {
                alert(err.response?.data?.error || err.message);
            }
        }
    };

    const typeInfo = t(`experimental.datasets.typeInfo.${newType}`) || {};

    if (selectedDataset) {
        return (
            <GcdsContainer size="xl" centered className="my-400">
                <div className="mb-400">
                    <GcdsButton buttonRole="secondary" size="small" onClick={() => setSelectedDataset(null)}>
                        &larr; {t('experimental.datasets.backToList')}
                    </GcdsButton>
                </div>

                <GcdsHeading tag="h1">
                    {t('experimental.datasets.viewing', { name: selectedDataset.name }).replace('{name}', selectedDataset.name)}
                </GcdsHeading>
                <GcdsText className="mb-400">{selectedDataset.description}</GcdsText>

                <div className="overflow-auto border rounded p-200 bg-light">
                    {rowsLoading ? (
                        <GcdsText>{t('experimental.datasets.loading')}</GcdsText>
                    ) : (
                        <>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
                                        <th className="p-100">#</th>
                                        {selectedDataset.columns?.map(col => (
                                            <th key={col.name} className="p-100">{col.name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(row => (
                                        <tr key={row._id} style={{ borderBottom: '1px solid #eee' }}>
                                            <td className="p-100" style={{ color: '#666' }}>{row.rowIndex}</td>
                                            {selectedDataset.columns?.map(col => {
                                                const val = row.data[col.name];
                                                return (
                                                    <td key={col.name} className="p-100">
                                                        {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="mt-400 d-flex justify-content-between align-items-center">
                                <GcdsText>
                                    Showing {rows.length} of {rowsTotal} rows
                                </GcdsText>
                                <div className="d-flex gap-200">
                                    <GcdsButton
                                        size="small"
                                        buttonRole="secondary"
                                        disabled={rowsPage === 1}
                                        onClick={() => fetchRows(selectedDataset, rowsPage - 1)}
                                    >
                                        &larr; Prev
                                    </GcdsButton>
                                    <GcdsButton
                                        size="small"
                                        buttonRole="secondary"
                                        disabled={rowsPage * 50 >= rowsTotal}
                                        onClick={() => fetchRows(selectedDataset, rowsPage + 1)}
                                    >
                                        Next &rarr;
                                    </GcdsButton>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </GcdsContainer>
        );
    }

    return (
        <GcdsContainer size="xl" centered className="my-400">
            <GcdsHeading tag="h1">{t('experimental.datasets.title')}</GcdsHeading>

            <div className="my-400 p-400 border rounded">
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
                            <option value="question-only">{t('experimental.datasets.typeInfo.question-only.label')}</option>
                            <option value="qa-pair">{t('experimental.datasets.typeInfo.qa-pair.label')}</option>
                            <option value="evaluation-set">{t('experimental.datasets.typeInfo.evaluation-set.label')}</option>
                        </select>

                        {typeInfo && (
                            <div style={{
                                padding: '12px 16px',
                                backgroundColor: '#f0f4f9',
                                borderLeft: '4px solid #2B4380',
                                borderRadius: '0 4px 4px 0',
                                fontSize: '0.875rem',
                            }}>
                                <p style={{ margin: '0 0 8px', color: '#333' }}>{typeInfo.description}</p>
                                <p style={{ margin: 0, color: '#555' }}>
                                    <strong>{t('experimental.datasets.requiredColumns')}: </strong>
                                    <code style={{ backgroundColor: '#e8edf5', padding: '2px 6px', borderRadius: '3px' }}>
                                        {typeInfo.columns}
                                    </code>
                                </p>
                            </div>
                        )}
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                            {t('experimental.datasets.fileLabel')}
                        </label>
                        <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileChange} />
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
                                <th className="p-200">{t('experimental.datasets.rowCount')}</th>
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
                                    <td className="p-200">{t(`experimental.datasets.typeInfo.${ds.type}.label`) || ds.type}</td>
                                    <td className="p-200">{ds.rowCount}</td>
                                    <td className="p-200">{new Date(ds.createdAt).toLocaleDateString()}</td>
                                    <td className="p-200">
                                        <div className="d-flex gap-200">
                                            <GcdsButton size="small" onClick={() => fetchRows(ds)}>
                                                {t('experimental.datasets.view')}
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
                                    <td colSpan="5" className="p-400 text-center">{t('experimental.datasets.empty')}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </GcdsContainer>
    );
}
