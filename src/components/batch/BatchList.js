import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client'; // Import createRoot
import DataTable from 'datatables.net-react';
import 'datatables.net-dt/css/dataTables.dataTables.css';
import DT from 'datatables.net-dt';
import { GcdsButton } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import BatchService from '../../services/BatchService.js';

DataTable.use(DT);

const BatchList = ({ onProcess, onCancel, onDelete, onExport, batchStatus, lang, processingBatches = [] }) => {
  const [batches, setBatches] = useState([]);
  const [searchText] = useState('');
  // refreshKey forces the DataTable to remount when batches or language change
  const [refreshKey, setRefreshKey] = useState(0);
  const { t } = useTranslations(lang); // TODO: Pass actual language from props/context

  // Fetch all statuses
  const fetchStatuses = useCallback(async (batches) => {
    try {
      return await BatchService.getBatchStatuses(batches);
    } catch (error) {
      console.error('Error fetching statuses:', error);
      // Return the original batches fallback so caller can proceed with array
      return batches || [];
    }
  }, []); // No dependencies needed as it doesn't use any external values

  // Normalize status values from server to the canonical values the UI expects
  const normalizeStatus = (s) => {
    if (!s && s !== 0) return 'unknown';
    const st = String(s).toLowerCase();
    // map server-side names to client expected names
    if (st === 'processing') return 'in_progress';
    if (st === 'inprogress') return 'in_progress';
    if (st === 'in_progress') return 'in_progress';
    if (st === 'processed') return 'processed';
    if (st === 'completed') return 'completed';
    if (st === 'finalizing') return 'finalizing';
    if (st === 'validating') return 'validating';
    if (st === 'failed') return 'failed';
    if (st === 'expired' || st === 'not_found') return 'expired';
    if (st === 'cancelled' || st === 'canceled') return 'canceled';
    return st;
  };

  // Memoize the columns configuration to prevent unnecessary re-renders
  const columns = useMemo(
    () => [
  { title: t('batch.list.columns.batchName'), data: 'name' },
      {
        title: t('batch.list.columns.batchId'),
        data: null,
        render: (data, type, row) => {
          // Display the Mongo document _id for clarity; do not display the legacy batchId here.
          return row && (row._id || row.id) ? String(row._id || row.id) : '';
        },
      },
      { title: t('batch.list.columns.createdDate'), data: 'createdAt' },
  { title: t('batch.list.columns.provider'), data: 'aiProvider' },
  { title: t('batch.list.columns.workflow') || 'Workflow', data: 'workflow' },
  { title: t('batch.list.columns.type'), data: 'type' },
      { title: t('batch.list.columns.status'), data: 'status' },
      { title: t('batch.list.columns.totals') || 'Totals', data: null },
      {
        title: t('batch.list.columns.action'),
        data: null,
        defaultContent: '',
      },
    ],
    [t]
  );

  // Fetch batches
  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const batches = await BatchService.getBatchList();
        const updatedBatches = await fetchStatuses(batches) || batches || [];
        setBatches(Array.isArray(updatedBatches) ? updatedBatches : []);
      } catch (error) {
        console.error('Error fetching batches:', error);
      }
    };

    fetchBatches();

    const intervalId = setInterval(fetchBatches, 10000); // Poll every 10 seconds
    return () => clearInterval(intervalId); // Cleanup on unmount
  }, [lang, fetchStatuses]); // Add lang as a dependency

  // Whenever batches, language, or local processing markers change, bump the
  // refresh key so DataTable remounts. This ensures the action buttons that
  // are rendered into table cells (via createRoot) see the latest
  // `processingBatches` value and update immediately when the user clicks
  // Process instead of waiting for the next polling cycle.
  useEffect(() => {
    setRefreshKey((r) => r + 1);
  }, [batches, lang, processingBatches]);

  // Handle button actions mapped to explicit handlers
  const handleExport = (batchId, type) => onExport && onExport(batchId, type);
  const handleDelete = (batchId) => onDelete && onDelete(batchId);
  // Pass workflow through when invoking onProcess so restarts can reuse the saved workflow
  const handleProcess = (batchId, provider, workflow) => onProcess && onProcess(batchId, provider, workflow);
  const handleCancel = (batchId, provider) => onCancel && onCancel(batchId, provider);

  // Filter batches based on batchStatus and search text (use normalized status)
  const filteredBatches = (batches || []).filter((batch) => {
    const norm = normalizeStatus(batch.status);
    const desired = (batchStatus || '').split(',').map((s) => s.trim()).filter(Boolean);
    // If caller asked for the umbrella "incomplete" group, include unknown statuses
    const matchesStatus = desired.includes(norm) ||
      (desired.includes('incomplete') && ['in_progress', 'processing', 'inprogress', 'unknown'].includes(norm));

    return (
      matchesStatus &&
      Object.values(batch).some((value) =>
        value?.toString().toLowerCase().includes(searchText.toLowerCase())
      )
    );
  });

  return (
    <div>
      <DataTable
        data={filteredBatches}
        columns={columns} // Use memoized columns
        options={{
          paging: true,
          searching: true,
          ordering: true,
          order: [[2, 'desc']], // Order by Created Date (createdAt column) descending
          createdRow: (row, data) => {
            const { _id, status: rawStatus, aiProvider } = data;
            const status = normalizeStatus(rawStatus);
            const cells = row.querySelectorAll('td');
            // Totals column is after status - find it as the cell before the actions cell
            const actionsCell = row.querySelector('td:last-child');
            const totalsCell = actionsCell ? actionsCell.previousElementSibling : cells[cells.length - 2];
            actionsCell.innerHTML = '';
            // Populate totals: prefer stats from service, fallback to 0/0
            try {
              const stats = data.stats || {};
              const total = Number(stats.total || 0);
              const processed = Number(stats.processed || 0);
              const failed = Number(stats.failed || 0);
              const finished = Number(stats.finished ?? processed + failed);
              if (totalsCell) {
                totalsCell.innerText = `${finished}/${total} completed`;
              }
            } catch (e) {
              // ignore totals rendering errors
            }
            // Unmount any previous root mounted on this cell to avoid memory leaks
            try {
              if (actionsCell._batchRoot) {
                actionsCell._batchRoot.unmount();
              }
            } catch (e) {
              // ignore unmount errors
            }
            const root = createRoot(actionsCell);
            // Store the root so we can unmount later when the row is re-rendered/removed
            actionsCell._batchRoot = root;

            // If processed >= total show download/delete actions
            const stats = data.stats || {};
            const total = Number(stats.total || 0);
            const processedCount = Number(stats.processed || 0);
            const failedCount = Number(stats.failed || 0);
            const finishedCount = Number(stats.finished ?? processedCount + failedCount);
            // Show both Process and Delete buttons for running batches
            const isLocallyProcessing = processingBatches.includes(String(_id));

            if (
              (finishedCount >= total && status === 'processed') ||
              ['in_progress', 'processing', 'inprogress'].includes(status)
            ) {
              const ActionButtons = () => {
                const [clicked, setClicked] = useState(false);
                if (clicked) return null;
                return (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {finishedCount >= total && status === 'processed' && (
                      <>
                        <GcdsButton
                          size="small"
                          onClick={() => {
                              handleExport(_id, 'csv');
                              setClicked(true);
                            }}
                        >
                          {t('batch.list.actions.csv')}
                        </GcdsButton>
                        <GcdsButton
                          size="small"
                          onClick={() => {
                            handleExport(_id, 'excel');
                            setClicked(true);
                          }}
                        >
                          {t('batch.list.actions.excel')}
                        </GcdsButton>
                      </>
                    )}
                    {(['in_progress', 'processing', 'inprogress'].includes(status) || finishedCount < total) && (
                      <GcdsButton
                        size="small"
                        onClick={() => {
                          // Don't allow pressing Process if this batch is marked locally processing
                          if (isLocallyProcessing) return;
                          // Immediately mark clicked so the button disables in the UI before any async work
                          setClicked(true);
                          handleProcess(_id, aiProvider, data.workflow || data?.workflow || 'Default');
                        }}
                        disabled={isLocallyProcessing || clicked}
                      >
                        {t('batch.list.actions.process')}
                      </GcdsButton>
                    )}
                    <GcdsButton
                      size="small"
                      onClick={() => {
                        handleDelete(_id);
                        setClicked(true);
                      }}
                    >
                      {t('batch.list.actions.delete') || 'Delete'}
                    </GcdsButton>
                  </div>
                );
              };
              root.render(<ActionButtons />);
            } else if (finishedCount < total || total === 0) {
              // Offer a Process button which triggers provider-side processing
              const ProcessButton = () => {
                const [clicked, setClicked] = useState(false);
                if (clicked) return null;
                return (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <GcdsButton
                      size="small"
                        onClick={() => {
                        if (processingBatches.includes(String(_id))) return;
                        // Immediately set clicked so button disables without waiting for parent state
                        setClicked(true);
                          handleProcess(_id, aiProvider, data.workflow || data?.workflow || 'Default');
                      }}
                      disabled={processingBatches.includes(String(_id)) || clicked}
                    >
                      {t('batch.list.actions.process')}
                    </GcdsButton>
                    <GcdsButton
                      size="small"
                      onClick={() => {
                        handleDelete(_id);
                        setClicked(true);
                      }}
                    >
                      {t('batch.list.actions.delete') || 'Delete'}
                    </GcdsButton>
                  </div>
                );
              };
              root.render(<ProcessButton />);
            } else if (status === 'completed') {
              const ActionButtonComplete = () => {
                const [clicked, setClicked] = useState(false);
                if (clicked) return null;
                return (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <GcdsButton
                      size="small"
                      onClick={() => {
                        handleProcess(_id, aiProvider, data.workflow || data?.workflow || 'Default');
                        setClicked(true);
                      }}
                    >
                      {t('batch.list.actions.process')}
                    </GcdsButton>
                    <GcdsButton
                      size="small"
                      onClick={() => {
                        handleDelete(_id);
                        setClicked(true);
                      }}
                    >
                      {t('batch.list.actions.delete') || 'Delete'}
                    </GcdsButton>
                  </div>
                );
              };
              root.render(<ActionButtonComplete />);
            } else {
              const ActionButtonCancel = () => {
                const [clicked, setClicked] = useState(false);
                if (clicked) return null;
                return (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <GcdsButton
                      size="small"
                      onClick={() => {
                        handleCancel(_id, aiProvider);
                        setClicked(true);
                      }}
                    >
                      {t('batch.list.actions.cancel')}
                    </GcdsButton>
                    <GcdsButton
                      size="small"
                      onClick={() => {
                        handleDelete(_id);
                        setClicked(true);
                      }}
                    >
                      {t('batch.list.actions.delete') || 'Delete'}
                    </GcdsButton>
                  </div>
                );
              };
              root.render(<ActionButtonCancel />);
            }
          },
        }}
        // Key forces a full remount when language or batches change so rows (and actions)
        // re-render with the latest statuses returned from the backend.
        key={`${lang}-${refreshKey}`}
      />
    </div>
  );
};

export default BatchList;


