import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import { GcdsInput, GcdsSelect, GcdsFileUploader } from '@gcds-core/components-react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';
import { formatNumber } from '../../utils/numberFormat.js';
import { getPath } from '../../utils/routes.js';
import ExperimentalServerDataTable from '../../components/experimental/ExperimentalServerDataTable.js';
import CellRootLink from '../../components/admin/CellRootLink.js';
import { buildLabelPillHtml } from '../../utils/labelPill.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
}[character]));
import StatusMessage, { useRepeatableStatus } from '../../components/admin/StatusMessage.js';
import { useFocusOnChange } from '../../hooks/useFocusOnChange.js';

// Row buttons render in their own React roots, so a busy flag kept in page
// state only shows by rebuilding the table, which drops keyboard focus. This
// button keeps its own.
function BusyButton({ onClick, label, busyLabel }) {
    const [busy, setBusy] = useState(false);
    const handleClick = async () => {
        setBusy(true);
        try {
            await onClick();
        } finally {
            setBusy(false);
        }
    };
    return (
        <GcdsButton size="small" buttonRole="secondary" onClick={handleClick} disabled={busy}>
            {busy ? busyLabel : label}
        </GcdsButton>
    );
}

// creationStatus -> the shared .label colour tiers (admin.css): green done,
// blue working, grey waiting, red failed.
const STATUS_PILL_CLASSES = {
    complete: 'complete',
    processing: 'in_progress',
    queued: 'pending',
    failed: 'error'
};

// What the table shows per row; a change means it needs redrawing.
const tableSignature = (data = []) => data.map(ds => `${ds._id}:${ds.creationStatus || ''}:${ds.rowCount}`).join('|');

export default function ExperimentalDatasetsPage({ lang = 'en' }) {
    const { t } = useTranslations(lang);
    const navigate = useNavigate();
    const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
    const [datasets, setDatasets] = useState([]);
    const [datasetListResult, setDatasetListResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    // Upload errors only; they show inside the upload panel.
    const [message, setMessage] = useState(null);
    const processingDatasetRef = useRef(null);
    const [tableRefreshKey, setTableRefreshKey] = useState(0);
    const tableSignatureRef = useRef(null);
    const fileUploaderRef = useRef(null);
    const [fileUploaderKey, setFileUploaderKey] = useState(0);
    // Outcomes of table actions and uploads, shown above the table.
    const tableStatus = useRepeatableStatus();
    const [tableStatusMovesFocus, setTableStatusMovesFocus] = useState(false);
    const [tableStatusFocusCount, setTableStatusFocusCount] = useState(0);
    const tableStatusRef = useFocusOnChange(tableStatusFocusCount);
    // focus: the button that caused it is gone (deleted row, closed panel).
    const reportTableStatus = (text, { isError = false, focus = false } = {}) => {
        setTableStatusMovesFocus(focus);
        tableStatus.announce(text, { isError });
        if (focus) setTableStatusFocusCount(n => n + 1);
    };

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
            // Redraw only when a row was added, removed or changed status, so
            // the 5s poll doesn't rebuild the table (and drop focus) for nothing.
            const signature = tableSignature(result.data);
            if (tableSignatureRef.current !== null && tableSignatureRef.current !== signature) {
                setTableRefreshKey(k => k + 1);
            }
            tableSignatureRef.current = signature;
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

    const handleFileChange = () => {
        const file = fileUploaderRef.current?.files?.[0];
        if (file) {
            setSelectedFile(file);
            if (!newName) setNewName(file.name.split('.')[0]);
        }
    };

    // An outcome names its dataset: the message shows above the table, away
    // from the row, and a deleted row is gone.
    const withDatasetName = (key, name) => t(key).replace('{name}', () => name);

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
                    setMessage(null);
                    await fetchDatasets();
                    setNewName('');
                    setNewDesc('');
                    setNewCategory('');
                    setSelectedFile(null);
                    setFileUploaderKey(k => k + 1);
                    setShowUpload(false);
                    reportTableStatus(withDatasetName('experimental.datasets.uploadSuccess', newName), { focus: true });
                } catch (err) {
                    // Always the translated message here, not
                    // err.response?.data?.error directly - same as the
                    // sibling handleDelete below, never raw backend text.
                    // `details` (below, rendered per-item) is kept raw on
                    // purpose - specific per-field validation feedback from
                    // the backend, genuinely useful for diagnosing a
                    // rejected upload, wrapped in <code lang="en"> instead
                    // of dropped.
                    setMessage({
                        type: 'error',
                        text: t('experimental.datasets.uploadFailed'),
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

    const handleDelete = async (dataset) => {
        if (!window.confirm(t('experimental.datasets.confirmDelete'))) return;

        try {
            await ExperimentalBatchClientService.deleteDataset(dataset._id);
            await fetchDatasets();
            reportTableStatus(withDatasetName('experimental.datasets.deleteSuccess', dataset.name), { focus: true });
        } catch (err) {
            // Translated text only, never the raw err.message.
            if (err.response?.data?.code === 'IN_USE') {
                reportTableStatus(withDatasetName('experimental.datasets.inUse', dataset.name), { isError: true });
            } else {
                reportTableStatus(withDatasetName('experimental.datasets.deleteFailed', dataset.name), { isError: true });
            }
        }
    };

    const handleExportDataset = async (dataset) => {
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
            reportTableStatus(withDatasetName('experimental.datasets.exportFailed', dataset.name), { isError: true });
        }
    };

    const handleProcessDataset = async (dataset, showMessage = true, refresh = true) => {
        if (processingDatasetRef.current === dataset._id) return;
        processingDatasetRef.current = dataset._id;
        try {
            await ExperimentalBatchClientService.processDataset(dataset._id, dataset.creationStatus === 'processing');
            if (refresh) await fetchDatasets(false);
        } catch (err) {
            const alreadyProcessing = err.code === 'stillProcessing' || err.status === 409;
            if (!alreadyProcessing) {
                console.error('Process dataset error:', err);
                // Translated text only, never the raw err.message.
                if (showMessage) reportTableStatus(withDatasetName('experimental.datasets.processFailed', dataset.name), { isError: true });
            }
        } finally {
            processingDatasetRef.current = null;
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
            width: '21%',
            render: (data, type, row) => type === 'display'
                ? `<div class="experimental-dataset-name"><span class="font-bold">${escapeHtml(data)}</span>${row.description ? `<span>${escapeHtml(row.description)}</span>` : ''}</div>`
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
        { title: t('experimental.datasets.uploadedBy'), data: null, width: '14%', render: (_data, _type, row) => row.createdBy?.email || t('common.na') },
        { title: t('experimental.datasets.rowCount'), data: 'rowCount', width: '6%', render: (data, type) => type === 'display' ? formatNumber(data, lang) : data },
        {
            title: t('experimental.datasets.creationStatus.title'),
            data: 'creationStatus',
            width: '14%',
            render: (data, _type, row) => {
                const key = data || 'complete';
                const pill = buildLabelPillHtml(STATUS_PILL_CLASSES[key] || 'unknown', t(`experimental.datasets.creationStatus.${key}`));
                if (key === 'complete' && row.creationSkippedSourceRows > 0) {
                    return `${pill}<div class="font-size-text-xxs-nr">${escapeHtml(t('experimental.datasets.creationStatus.skippedSourceRows').replace('{count}', formatNumber(row.creationSkippedSourceRows, lang)))}</div>`;
                }
                return pill;
            }
        },
        { title: t('experimental.datasets.runCountLabel'), data: 'runCount', width: '6%', render: (data, type) => type === 'display' ? formatNumber(data, lang) : data },
        { title: t('experimental.datasets.created'), data: 'createdAt', width: '10%', render: (data, type) => type === 'display' ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(data)) : data }
    ];

    const fetchDatasetTableData = useCallback((query) => (
        ExperimentalBatchClientService.listDatasets(1, 10, query)
    ), []);

    const renderDatasetActions = (ds) => {
        const isComplete = !ds.creationStatus || ds.creationStatus === 'complete';
        // Navigation is a real link drawn as a button. A link can't be
        // disabled, so an unfinished dataset gets a disabled button instead -
        // same look, and there is nowhere to go yet.
        const navButton = (href, label) => (isComplete
            ? <CellRootLink className="filter-button filter-button-outline" navigate={navigate} href={href}>{label}</CellRootLink>
            : <GcdsButton size="small" buttonRole="secondary" disabled>{label}</GcdsButton>
        );
        return (
            <div className="experimental-table-actions experimental-table-actions--group experimental-table-actions--stacked" role="group" aria-label={t('experimental.datasets.actions')}>
                {!isComplete && (['queued', 'processing'].includes(ds.creationStatus)
                    ? <GcdsButton size="small" buttonRole="secondary" disabled>{t('experimental.datasets.processing')}</GcdsButton>
                    : <BusyButton onClick={() => handleProcessDataset(ds)} label={t('experimental.datasets.resume')} busyLabel={t('experimental.datasets.processing')} />)}
                {navButton(`${getPath('experimental-analysis', lang)}?datasetId=${ds._id}`, t('experimental.datasets.analyze'))}
                {navButton(`${getPath('experimental-suites', lang)}/${ds._id}`, t('experimental.datasets.suiteView'))}
                {isComplete
                    ? <BusyButton onClick={() => handleExportDataset(ds)} label={t('experimental.datasets.export')} busyLabel={t('experimental.datasets.exporting')} />
                    : <GcdsButton size="small" buttonRole="secondary" disabled>{t('experimental.datasets.export')}</GcdsButton>}
                <GcdsButton size="small" buttonRole="danger" onClick={() => handleDelete(ds)}>{t('experimental.datasets.delete')}</GcdsButton>
            </div>
        );
    };

    return (
        <GcdsContainer layout="page" className="mb-600">
            <GcdsHeading tag="h1">{t('experimental.datasets.title')}</GcdsHeading>
            <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
                <GcdsLink href={`/${lang}/admin`}>
                    {t('common.backToAdmin')}
                </GcdsLink>
            </nav>

            <div className="my-400">
                {/* TODO(design): needs design review. Native <button> (not
                    <GcdsButton>), same rationale as PauseToggleButton.js: GcdsButton
                    only copies aria-* attributes from its host onto its shadow-DOM
                    button on mount and inside its own click handler. That handler
                    runs on the inner button before React's root-delegated onClick,
                    so it reads the host's aria-expanded before setState commits the
                    new value, and nothing re-reads it afterwards - screen readers
                    would hear the value one click behind. Styled with the same
                    .filter-button classes as "Create dataset" beside it, to
                    reproduce GcdsButton's regular-size buttonRole secondary look
                    for now; a designer hasn't signed off on this specific
                    treatment. */}
                <button
                    type="button"
                    className="filter-button filter-button--regular filter-button-outline"
                    onClick={() => setShowUpload(!showUpload)}
                    aria-expanded={showUpload}
                    aria-controls="experimental-dataset-upload-panel"
                >
                    {showUpload ? t('experimental.datasets.hideUpload') : t('experimental.datasets.uploadButton')}
                </button>
                <Link className="filter-button filter-button--regular filter-button-outline" to={getPath('experimental-create-dataset', lang)}>
                    {t('experimental.datasets.createButton')}
                </Link>

                {/* Always in the DOM so the toggle's aria-controls resolves. */}
                <div id="experimental-dataset-upload-panel" hidden={!showUpload}>
                {showUpload && (
                    <div className="mt-400">
                        <GcdsHeading tag="h2">{t('experimental.datasets.uploadNew')}</GcdsHeading>
                        <div className="text-measure">
                            <GcdsInput
                                inputId="ds-name"
                                name="ds-name"
                                label={t('experimental.datasets.nameLabel')}
                                value={newName}
                                onGcdsInput={(e) => setNewName(e.target.value)}
                                required
                            />
                            <GcdsInput
                                inputId="ds-desc"
                                name="ds-desc"
                                label={t('experimental.datasets.descLabel')}
                                value={newDesc}
                                onGcdsInput={(e) => setNewDesc(e.target.value)}
                            />
                            <GcdsSelect
                                selectId="ds-type"
                                name="ds-type"
                                label={t('experimental.datasets.typeLabel')}
                                value={newType}
                                onGcdsChange={(e) => setNewType(e.detail)}
                            >
                                <option value="question-only">{t('experimental.datasets.type.questionOnly')}</option>
                                <option value="qa-pair">{t('experimental.datasets.type.qaPair')}</option>
                            </GcdsSelect>
                            <GcdsInput
                                inputId="ds-category"
                                name="ds-category"
                                label={t('experimental.datasets.categoryLabel')}
                                hint={t('experimental.datasets.categoryPlaceholder')}
                                value={newCategory}
                                onGcdsInput={(e) => setNewCategory(e.target.value)}
                            />
                            <GcdsText className="mb-200">
                                {typeInfo.description}
                            </GcdsText>
                            <GcdsText className="mb-200">
                                <span className="font-bold">{t('experimental.datasets.requiredColumns')}</span> {typeInfo.columns}
                            </GcdsText>
                            <GcdsText className="mb-200">
                                {t('experimental.datasets.columnAliasHint')}
                            </GcdsText>
                            <table className="review-table mb-400">
                                <caption>{t('experimental.datasets.columnVariants.title')}</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">{t('experimental.datasets.columnVariants.fieldHeader')}</th>
                                        <th scope="col">{t('experimental.datasets.columnVariants.variantsHeader')}</th>
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
                            <GcdsFileUploader
                                key={fileUploaderKey}
                                ref={fileUploaderRef}
                                className="csv-file-uploader"
                                uploaderId="experimental-dataset-file"
                                name="experimental-dataset-file"
                                label={t('experimental.datasets.fileLabel')}
                                accept=".xlsx,.csv"
                                required
                                onGcdsChange={handleFileChange}
                            />
                            <GcdsButton onClick={handleUpload} disabled={uploading || !selectedFile || !newName}>
                                {uploading ? t('experimental.datasets.uploading') : t('experimental.datasets.upload')}
                            </GcdsButton>
                            <StatusMessage
                                variant={message?.type}
                            >
                                {message && (
                                    <>
                                        <GcdsText>{message.text}</GcdsText>
                                        {message.details && Array.isArray(message.details) && message.details.length > 0 && (
                                            <ul style={{ marginTop: '0.5rem', marginBottom: 0, paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                                                {message.details.map((detail, i) => (
                                                    <li key={i}><code lang="en">{detail}</code></li>
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
            </div>

            <GcdsHeading tag="h2" className="mt-600">{t('experimental.datasets.existing')}</GcdsHeading>
            <StatusMessage
                ref={tableStatusRef}
                tabIndex={-1}
                className="focus-target"
                announce={!tableStatusMovesFocus}
                announcedVia={tableStatusMovesFocus ? 'focus' : undefined}
                variant={tableStatus.message ? (tableStatus.isError ? 'error' : 'success') : undefined}
                message={tableStatus.message}
                nonce={tableStatus.nonce}
            />
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
                        actionsWidth="17%"
                        autoWidth={false}
                        containerClassName="metrics-table-container experimental-dataset-table-container table-scroll"
                        searchLabelSrOnly={t('experimental.datasets.filterLabel')}
                        searchPlaceholder={t('admin.common.filterPlaceholder')}
                        tableKey={`datasets-${tableRefreshKey}`}
                    order={[[6, 'desc']]}
                />
            )}
        </GcdsContainer>
    );
}
