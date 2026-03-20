import React, { useRef, useState, useEffect } from 'react';
import { getApiUrl } from '../utils/apiToUrl.js';
import { GcdsContainer, GcdsHeading, GcdsText, GcdsButton, GcdsLink } from '@cdssnc/gcds-components-react';
import AuthService from '../services/AuthService.js';
import DataStoreService from '../services/DataStoreService.js';
import BatchService from '../services/BatchService.js';
import streamSaver from 'streamsaver';
import { useTranslations } from '../hooks/useTranslations.js';

const DatabasePage = ({ lang }) => {
  const { t } = useTranslations(lang);
  const [isExporting, setIsExporting] = useState(false);
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('All');
  const [isImporting, setIsImporting] = useState(false);
  const [importSelectedCollections, setImportSelectedCollections] = useState(['All']);
  const [isDroppingIndexes, setIsDroppingIndexes] = useState(false);
  const [isDeletingSystemLogs, setIsDeletingSystemLogs] = useState(false);
  const [isDeletingAllBatches, setIsDeletingAllBatches] = useState(false);
  const [isRepairingTimestamps, setIsRepairingTimestamps] = useState(false);
  const [isRepairingExpertFeedback, setIsRepairingExpertFeedback] = useState(false);
  const [isMigratingPublicFeedback, setIsMigratingPublicFeedback] = useState(false);
  const [message, setMessage] = useState('');
  const [isCreatingIndexes, setIsCreatingIndexes] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportLimit, setExportLimit] = useState(10000); // New state for export limit
  const [tableCounts, setTableCounts] = useState(null);
  const [countsError, setCountsError] = useState('');
  // Import controls: chunk size in MB and optional throttle between chunk uploads (ms)
  const [importChunkMB, setImportChunkMB] = useState(90); // default 90 MB per file slice
  const [importThrottleMs, setImportThrottleMs] = useState(0); // default no extra delay between chunk POSTs
  const fileInputRef = useRef(null);
  const [checksRunning, setChecksRunning] = useState({});
  const [checksResults, setChecksResults] = useState({});
  const [isRemovingDuplicates, setIsRemovingDuplicates] = useState(false);
  const [isCheckingIndexStatus, setIsCheckingIndexStatus] = useState(false);
  const [indexStatus, setIndexStatus] = useState(null);
  const [creationDetails, setCreationDetails] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchCountsAndCollections() {
      setCountsError('');
      try {
        const counts = await DataStoreService.getTableCounts();
        if (isMounted) setTableCounts(counts);
      } catch (e) {
        if (isMounted) setCountsError(e.message);
      }
      // Fetch collections for export dropdown
      try {
        const collectionsRes = await AuthService.fetch(getApiUrl('db-database-management'), {
          method: 'GET'
        });
        if (collectionsRes.ok) {
          const { collections } = await collectionsRes.json();
          if (isMounted && Array.isArray(collections)) setCollections(collections);
        }
      } catch (e) {
        // ignore
      }
    }
    fetchCountsAndCollections();
    return () => { isMounted = false; };
  }, []);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setMessage('');

      // Use selectedCollection for export
      let collectionsToExport = collections;
      if (selectedCollection && selectedCollection !== 'All' && selectedCollection !== 'AllButLogs') {
        collectionsToExport = [selectedCollection];
      } else if (selectedCollection === 'AllButLogs') {
        // filter out collections whose names end with 'log' or 'logs'
        collectionsToExport = (collections || []).filter(col => {
          const n = String(col || '').toLowerCase();
          return !(n.endsWith('log') || n.endsWith('logs'));
        });
      }
      if (!collectionsToExport || !Array.isArray(collectionsToExport) || collectionsToExport.length === 0) {
        throw new Error('No collections found');
      }

      // Step 2: Stream each collection as it is fetched (JSONL format)
      const collectionTag = selectedCollection === 'AllButLogs'
        ? 'all-but-logs-'
        : (selectedCollection && selectedCollection !== 'All' ? selectedCollection + '-' : '');
      const filename = `database-backup-${collectionTag}${new Date().toISOString()}.jsonl`;
      const fileStream = streamSaver.createWriteStream(filename);
      const writer = fileStream.getWriter();
      const encoder = new TextEncoder();
      const initialChunkSize = Number(exportLimit) || 10000;
      const minChunkSize = 1;

      for (let i = 0; i < collectionsToExport.length; i++) {
        const collection = collectionsToExport[i];
        let lastId = '';
        let chunkSize = initialChunkSize;
        let hasMore = true;
        while (hasMore) {
          let success = false;
          let data = [];
          let newLastId = '';
          while (!success && chunkSize >= minChunkSize) {
            try {
              // Add date range and always use updatedAt
              let url = getApiUrl(`db-database-management?collection=${encodeURIComponent(collection)}&limit=${chunkSize}`);
              if (lastId) url += `&lastId=${encodeURIComponent(lastId)}`;
              if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
              if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
              url += `&dateField=updatedAt`;
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 300000); // 5 minutes
              const res = await AuthService.fetch(url, { signal: controller.signal });
              clearTimeout(timeout);
              if (!res.ok) {
                let errorMsg = `Failed to export collection ${collection}`;
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                  const error = await res.json();
                  errorMsg = error.message || errorMsg;
                } else {
                  const text = await res.text();
                  errorMsg = text || errorMsg;
                }
                throw new Error(errorMsg);
              }
              const json = await res.json();
              data = json.data;
              newLastId = json.lastId;
              success = true;
            } catch (err) {
              // Retry on any error until minChunkSize is reached
              if (chunkSize > minChunkSize) {
                chunkSize = Math.floor(chunkSize / 2);
                if (chunkSize < minChunkSize) chunkSize = minChunkSize;
              } else {
                throw new Error(`Export failed for collection ${collection} at min chunk size (${minChunkSize}): ${err.message}`);
              }
            }
          }
          // Write each document as a JSONL line: {"collection": "name", "doc": {...}}
          for (let j = 0; j < data.length; j++) {
            const docStr = JSON.stringify({ collection, doc: data[j] });
            await writer.write(encoder.encode(docStr + '\n'));
          }
          if (!newLastId || data.length === 0) {
            hasMore = false;
          } else {
            lastId = newLastId;
          }
        }
      }
      await writer.close();
      setMessage('Database exported successfully');
    } catch (error) {
      setMessage(`Export failed: ${error.message}`);
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event) => {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setMessage('Please select a file to import');
      return;
    }

    setIsImporting(true);
    setMessage('Starting import...');
    // lineBuffer is managed inside the try block per chunk
    let accumulatedStats = { inserted: 0, failed: 0, skipped: 0, skippedExamples: [] };

    try {
      // Compute chunk size from UI (MB -> bytes). Minimum 64KB to avoid extremely small slices.
      const requestedChunkSize = Number(importChunkMB) > 0 ? Number(importChunkMB) * 1024 * 1024 : 2 * 1024 * 1024;
      const chunkSize = Math.max(requestedChunkSize, 64 * 1024);
      const totalChunks = Math.ceil(file.size / chunkSize);
      const fileName = file.name;
      let lineBuffer = '';
      let chunkIndex = 0;
      let offset = 0;
      // helper: sleep and send with retries (exponential backoff)
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      // build collection payload for POST: 'All' | 'AllButLogs' | [list]
      const buildCollectionPayload = () => {
        const sel = Array.isArray(importSelectedCollections) ? importSelectedCollections : [importSelectedCollections];
        if (sel.includes('All')) return 'All';
        if (sel.includes('AllButLogs') && sel.length === 1) return 'AllButLogs';
        return sel.filter(s => s !== 'All' && s !== 'AllButLogs');
      };
      const sendChunkWithRetry = async (bodyObj, attemptLimit = 5) => {
        let delay = 500; // start 500ms
        let lastErr = null;
        for (let attempt = 0; attempt < attemptLimit; attempt++) {
          try {
            const response = await AuthService.fetch(getApiUrl('db-database-management'), {
              method: 'POST',
              body: JSON.stringify(bodyObj),
            });
            if (!response.ok) {
              // try to read error body if any
              let errorMsg = response.statusText || 'Server error';
              try {
                const errJson = await response.json();
                if (errJson && errJson.message) errorMsg = errJson.message;
              } catch (e) {
                // ignore JSON parse errors
              }
              throw new Error(errorMsg);
            }
            const result = await response.json();
            return result;
          } catch (err) {
            lastErr = err;
            if (attempt === attemptLimit - 1) {
              // last attempt, rethrow
              throw err;
            }
            // exponential backoff before next retry
            // eslint-disable-next-line no-await-in-loop
            await sleep(delay);
            delay *= 2;
          }
        }
        // Shouldn't reach here, but throw the last error if it does
        throw lastErr || new Error('Unknown error during chunk upload');
      };
      while (offset < file.size) {
        const end = Math.min(offset + chunkSize, file.size);
        const fileSlice = file.slice(offset, end);
        const chunkText = await fileSlice.text();
        // Prepend any leftover from previous chunk
        const text = lineBuffer + chunkText;
        const lines = text.split(/\r?\n/);
        // All lines except the last are complete
        const completeLines = lines.slice(0, -1);
        lineBuffer = lines[lines.length - 1]; // May be incomplete
        const payload = completeLines.join('\n');
        if (payload.trim().length > 0) {
          const bodyObj = {
            chunkIndex,
            totalChunks, // This is still the total number of file chunks, not payload chunks
            fileName,
            chunkPayload: payload,
            collection: buildCollectionPayload()
          };
          const result = await sendChunkWithRetry(bodyObj, 5).catch(err => { throw new Error(`Server error on chunk ${chunkIndex + 1}: ${err.message}`); });
          if (result && result.stats) {
            accumulatedStats.inserted += result.stats.inserted || 0;
            accumulatedStats.failed += result.stats.failed || 0;
            accumulatedStats.skipped += result.stats.skipped || 0;
            if (result.stats.skippedExamples && Array.isArray(result.stats.skippedExamples)) {
              accumulatedStats.skippedExamples = accumulatedStats.skippedExamples || [];
              for (const ex of result.stats.skippedExamples) {
                if (accumulatedStats.skippedExamples.length >= 10) break;
                accumulatedStats.skippedExamples.push(ex);
              }
            }
          }
          setMessage(`Processed chunk ${chunkIndex + 1} of ${totalChunks}. Current totals - Inserted: ${accumulatedStats.inserted}, Failed: ${accumulatedStats.failed}, Skipped: ${accumulatedStats.skipped}`);
          // Optional throttle between chunk uploads to avoid flooding the server
          // Only apply throttle delay if the server performed upserts for this chunk
          if (Number(importThrottleMs) > 0) {
            const didUpsert = result && result.stats && (result.stats.inserted && Number(result.stats.inserted) > 0);
            if (didUpsert) {
              // eslint-disable-next-line no-await-in-loop
              await sleep(Number(importThrottleMs));
            }
          }
        }
        offset = end;
        chunkIndex++;
      }
      // Send any remaining buffered line as the last chunk
      if (lineBuffer.trim().length > 0) {
        const bodyObj = {
          chunkIndex,
          totalChunks,
          fileName,
          chunkPayload: lineBuffer,
          collection: buildCollectionPayload()
        };
        const result = await sendChunkWithRetry(bodyObj, 5).catch(err => { throw new Error(`Server error on chunk ${chunkIndex + 1}: ${err.message}`); });
        if (result && result.stats) {
          accumulatedStats.inserted += result.stats.inserted || 0;
          accumulatedStats.failed += result.stats.failed || 0;
          accumulatedStats.skipped += result.stats.skipped || 0;
          if (result.stats.skippedExamples && Array.isArray(result.stats.skippedExamples)) {
            accumulatedStats.skippedExamples = accumulatedStats.skippedExamples || [];
            for (const ex of result.stats.skippedExamples) {
              if (accumulatedStats.skippedExamples.length >= 10) break;
              accumulatedStats.skippedExamples.push(ex);
            }
          }
        }
        setMessage(`Processed chunk ${chunkIndex + 1} of ${totalChunks}. Current totals - Inserted: ${accumulatedStats.inserted}, Failed: ${accumulatedStats.failed}, Skipped: ${accumulatedStats.skipped}`);
        // Only apply throttle delay if the server performed upserts for this chunk
        if (Number(importThrottleMs) > 0) {
          const didUpsert = result && result.stats && (result.stats.inserted && Number(result.stats.inserted) > 0);
          if (didUpsert) {
            // eslint-disable-next-line no-await-in-loop
            await sleep(Number(importThrottleMs));
          }
        }
      }

      // Build final completion message, optionally include skipped example snippets
      let finalMsg = `Database import completed. Total Inserted: ${accumulatedStats.inserted}, Total Failed: ${accumulatedStats.failed}`;
      if (accumulatedStats.skipped) finalMsg += `, Skipped: ${accumulatedStats.skipped}`;
      if (accumulatedStats.skippedExamples && accumulatedStats.skippedExamples.length) {
        finalMsg += `\nSkipped examples:\n${accumulatedStats.skippedExamples.slice(0, 10).join('\n')}`;
      }
      setMessage(finalMsg);
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset file input
      }
    } catch (error) {
      setMessage(`Import failed: ${error.message}`);
      console.error('Import error:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDropIndexes = async () => {
    const confirmed = window.confirm(t('admin.database.dropIndexesConfirm'));

    if (!confirmed) return;

    try {
      setIsDroppingIndexes(true);
      setMessage('');

      const response = await AuthService.fetch(getApiUrl('db-database-management'), {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to drop indexes');
      }

      const result = await response.json();
      setMessage(t('admin.database.dropIndexesSuccess').replace('{count}', result.results.success.length));
    } catch (error) {
      setMessage(t('admin.database.dropIndexesError').replace('{error}', error.message));
      console.error('Drop indexes error:', error);
    } finally {
      setIsDroppingIndexes(false);
    }
  };

  const handleDeleteSystemLogs = async () => {
    if (!window.confirm(t('admin.database.deleteSystemLogsConfirm'))) return;
    setIsDeletingSystemLogs(true);
    setMessage('');
    try {
      const response = await AuthService.fetch(getApiUrl('db-delete-system-logs'), {
        method: 'DELETE'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Failed to delete system logs');
      setMessage(t('admin.database.deleteSystemLogsSuccess').replace('{count}', result.deletedCount));
    } catch (error) {
      setMessage(t('admin.database.deleteSystemLogsError').replace('{error}', error.message));
    } finally {
      setIsDeletingSystemLogs(false);
    }
  };

  const handleDeleteAllBatches = async () => {
    if (!window.confirm(t('admin.database.deleteAllBatchesConfirm'))) return;

    setIsDeletingAllBatches(true);
    setMessage('');
    try {
      const result = await BatchService.deleteAllBatches();
      // Expecting { deletedBatches, deletedBatchItems } or similar
      const deletedBatches = (result && result.deletedBatches != null) ? result.deletedBatches : (result && result.deleted != null ? result.deleted : 0);
      const deletedBatchItems = (result && result.deletedBatchItems != null) ? result.deletedBatchItems : 0;
      setMessage(t('admin.database.deleteAllBatchesSuccess').replace('{batches}', deletedBatches).replace('{batchItems}', deletedBatchItems));
    } catch (error) {
      setMessage(t('admin.database.deleteAllBatchesError').replace('{error}', error.message));
      console.error('Delete all batches error:', error);
    } finally {
      setIsDeletingAllBatches(false);
    }
  };

  const handleRepairTimestamps = async () => {
    if (!window.confirm(t('admin.database.repairTimestampsConfirm'))) return;

    setIsRepairingTimestamps(true);
    setMessage('');

    try {
      const result = await DataStoreService.repairTimestamps();
      setMessage(t('admin.database.repairTimestampsSuccess').replace('{updated}', result.stats.tools.updated).replace('{total}', result.stats.tools.total));
    } catch (error) {
      setMessage(t('admin.database.repairTimestampsError').replace('{error}', error.message));
    } finally {
      setIsRepairingTimestamps(false);
    }
  };

  const handleRepairExpertFeedback = async () => {
    if (!window.confirm(t('admin.database.repairExpertFeedbackConfirm'))) return;

    setIsRepairingExpertFeedback(true);
    setMessage('');

    try {
      const result = await DataStoreService.repairExpertFeedback();
      setMessage(t('admin.database.repairExpertFeedbackSuccess').replace('{updated}', result.stats.expertFeedback.updated).replace('{total}', result.stats.expertFeedback.total).replace('{alreadyCorrect}', result.stats.expertFeedback.alreadyCorrect));
    } catch (error) {
      setMessage(t('admin.database.repairExpertFeedbackError').replace('{error}', error.message));
    } finally {
      setIsRepairingExpertFeedback(false);
    }
  };

  const handleMigratePublicFeedback = async () => {
    if (!window.confirm(t('admin.database.migratePublicFeedbackConfirm'))) return;
    setIsMigratingPublicFeedback(true);
    setMessage('');
    try {
      const result = await DataStoreService.migratePublicFeedback();
      setMessage(t('admin.database.migratePublicFeedbackSuccess').replace('{migrated}', result.migrated || 0));
    } catch (error) {
      setMessage(t('admin.database.migratePublicFeedbackError').replace('{error}', error.message));
    } finally {
      setIsMigratingPublicFeedback(false);
    }
  };

  const handleCreateIndexes = async () => {
    const confirmed = window.confirm(t('admin.database.createIndexesConfirm'));

    if (!confirmed) return;

    try {
      setIsCreatingIndexes(true);
      setMessage('');

      const result = await DataStoreService.createIndexes();

      const successCount = result.results.success ? result.results.success.length : 0;
      const failCount = result.results.failed ? result.results.failed.length : 0;

      setCreationDetails(result.results);
      setMessage(t('admin.database.createIndexesSuccess').replace('{successCount}', successCount).replace('{failCount}', failCount));
    } catch (error) {
      setCreationDetails(null);
      setMessage(t('admin.database.createIndexesError').replace('{error}', error.message));
      console.error('Create indexes error:', error);
    } finally {
      setIsCreatingIndexes(false);
    }
  };


  return (
    <GcdsContainer size="xl" centered>
      <GcdsHeading tag="h1">{t('admin.database.title')}</GcdsHeading>
      <nav className="mb-400">
        <GcdsLink href={`/${lang}/admin`}>
          {t('common.backToAdmin')}
        </GcdsLink>
      </nav>
      {/* Table counts display */}
      <div style={{ marginBottom: 24 }}>
        <GcdsHeading tag="h2">{t('admin.database.tableRecordCounts')}</GcdsHeading>
        {countsError && <div style={{ color: 'red' }}>{countsError}</div>}
        {tableCounts ? (
          <table style={{ margin: '12px 0', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingRight: 16 }}>{t('admin.database.tableColumn')}</th>
                <th style={{ textAlign: 'right' }}>{t('admin.database.countColumn')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(tableCounts).map(([table, count]) => (
                <tr key={table}>
                  <td style={{ paddingRight: 16 }}>{t(`admin.database.collections.${table}`) || table}</td>
                  <td style={{ textAlign: 'right' }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !countsError && <div>{t('common.loading')}</div>
        )}
      </div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <label>
          {t('admin.database.tableLabel')}&nbsp;
          <select
            value={selectedCollection}
            onChange={e => setSelectedCollection(e.target.value)}
            style={{ minWidth: 120 }}
            disabled={isExporting || collections.length === 0}
          >
            <option value="All">All</option>
            <option value="AllButLogs">All but logs</option>
            {collections.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </label>
        <label>{t('admin.database.startDate')}&nbsp;
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </label>
        <label>{t('admin.database.endDate')}&nbsp;
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </label>
        <label>{t('admin.database.limitLabel')}&nbsp;
          <input
            type="number"
            min="1"
            value={exportLimit}
            onChange={e => setExportLimit(e.target.value)}
            style={{ width: 100 }}
            disabled={isExporting}
          />
        </label>
        <GcdsButton onClick={handleExport} disabled={isExporting || collections.length === 0}>
          {isExporting ? t('admin.database.exporting') : t('admin.database.exportButton')}
        </GcdsButton>
      </div>
      {/* Integrity checks: orphan and parent-invalid-child counts */}
      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.integrityTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.integrityDescription')}
        </GcdsText>
        <details open className="mb-200" style={{ padding: 12, border: '1px solid #e6e6e6' }}>
          <summary style={{ cursor: 'pointer', fontWeight: '600' }}>{t('admin.database.coreChecksLabel')}</summary>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { id: 'orphanCitations', labelKey: 'checks.orphanCitations' },
              { id: 'orphanTools', labelKey: 'checks.orphanTools' },
              { id: 'orphanAnswers', labelKey: 'checks.orphanAnswers' },
              { id: 'orphanQuestions', labelKey: 'checks.orphanQuestions' },
              { id: 'orphanInteractions', labelKey: 'checks.orphanInteractions' },
              { id: 'interactionMissingChildren', labelKey: 'checks.interactionMissingChildren' },
              { id: 'embeddingsMissingRefs', labelKey: 'checks.embeddingsMissingRefs' },
              { id: 'sentenceEmbeddingOrphans', labelKey: 'checks.sentenceEmbeddingOrphans' },
              { id: 'chatInvalidInteractions', labelKey: 'checks.chatInvalidInteractions' },
              { id: 'answerInvalidTools', labelKey: 'checks.answerInvalidTools' },
              { id: 'evalInvalidInteraction', labelKey: 'checks.evalInvalidInteraction' },
              { id: 'duplicateKeys', labelKey: 'checks.duplicateKeys' }
            ].map(check => (
              <div key={check.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>{t(`admin.database.${check.labelKey}`)}</div>
                <GcdsButton
                  onClick={async () => {
                    try {
                      setChecksRunning(prev => ({ ...prev, [check.id]: true }));
                      setMessage('');
                      const res = await AuthService.fetch(getApiUrl(`db-integrity-checks?check=${encodeURIComponent(check.id)}&limit=10`), {
                        method: 'GET'
                      });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.message || 'Check failed');
                      setChecksResults(prev => ({ ...prev, [check.id]: json }));
                    } catch (err) {
                      setMessage(`Check ${check.id} failed: ${err.message}`);
                    } finally {
                      setChecksRunning(prev => ({ ...prev, [check.id]: false }));
                    }
                  }}
                  disabled={!!checksRunning[check.id]}
                  variant="secondary"
                >
                  {checksRunning[check.id] ? t('admin.database.runningLabel') : t('admin.database.runCheckButton')}
                </GcdsButton>
                <div style={{ minWidth: 220, textAlign: 'right' }}>
                  {checksResults[check.id] ? (
                    <div style={{ fontSize: 13 }}>
                      {t('admin.database.countLabel')} <strong>{checksResults[check.id].count}</strong>
                      {checksResults[check.id].breakdown ? (
                        <div style={{ marginTop: 6, textAlign: 'right' }}>
                          <div style={{ fontSize: 12 }}>{t('admin.database.breakdownMissing').replace('{chat}', checksResults[check.id].breakdown.missingChat).replace('{interaction}', checksResults[check.id].breakdown.missingInteraction).replace('{question}', checksResults[check.id].breakdown.missingQuestion).replace('{answer}', checksResults[check.id].breakdown.missingAnswer)}</div>
                          {checksResults[check.id].samples && checksResults[check.id].samples.length ? (
                            <div style={{ marginTop: 6 }}>
                              {t('admin.database.breakdownSamples').replace('{samples}', checksResults[check.id].samples.slice(0, 5).map(s => (s._id || s)).join(', '))}
                            </div>
                          ) : null}
                        </div>
                      ) : checksResults[check.id].samples && checksResults[check.id].samples.length ? (
                        <div style={{ marginTop: 6 }}>
                          Samples: {checksResults[check.id].samples.slice(0, 5).map(s => (s._id || s)).join(', ')}
                        </div>
                      ) : null}
                    </div>
                  ) : <div style={{ fontSize: 13, color: '#666' }}>{t('admin.database.noResultsLabel')}</div>}
                </div>
                {/* Add Remove Duplicates button only for duplicateKeys check */}
                {check.id === 'duplicateKeys' && (
                  <GcdsButton
                    onClick={async () => {
                      if (!window.confirm(t('admin.database.removeDuplicatesConfirm'))) return;
                      try {
                        setIsRemovingDuplicates(true);
                        setMessage('');
                        const res = await AuthService.fetch(getApiUrl('db-integrity-checks?action=removeDuplicates'), {
                          method: 'DELETE'
                        });
                        const json = await res.json();
                        if (!res.ok) throw new Error(json.message || 'Remove duplicates failed');
                        setMessage(t('admin.database.removeDuplicatesSuccess').replace('{count}', json.deletedCount));
                        // Refresh the check results
                        setChecksResults(prev => ({ ...prev, duplicateKeys: null }));
                      } catch (err) {
                        setMessage(t('admin.database.removeDuplicatesError').replace('{error}', err.message));
                      } finally {
                        setIsRemovingDuplicates(false);
                      }
                    }}
                    disabled={isRemovingDuplicates}
                    variant="danger"
                  >
                    {isRemovingDuplicates ? t('admin.database.removingLabel') : t('admin.database.removeDuplicatesButton')}
                  </GcdsButton>
                )}
              </div>
            ))}
          </div>
        </details>
      </div >

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.importTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.importDescription')}
        </GcdsText>
        {/* Show import progress message above the import button */}
        {isImporting && message && (
          <div style={{ margin: '12px 0', color: 'blue' }}>{message}</div>
        )}
        <form onSubmit={handleImport} className="mb-200">
          <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <label>
              {t('admin.database.chunkSizeLabel')}&nbsp;
              <input
                type="number"
                min="0.0625"
                step="0.0625"
                value={importChunkMB}
                onChange={e => setImportChunkMB(e.target.value)}
                style={{ width: 100 }}
                disabled={isImporting}
              />
            </label>
            <label>
              {t('admin.database.throttleLabel')}&nbsp;
              <input
                type="number"
                min="0"
                step="50"
                value={importThrottleMs}
                onChange={e => setImportThrottleMs(e.target.value)}
                style={{ width: 100 }}
                disabled={isImporting}
              />
            </label>
            <label>
              {t('admin.database.tableSelectLabel')}&nbsp;
              <select
                value={importSelectedCollections}
                onChange={e => {
                  const options = Array.from(e.target.options);
                  const vals = options.filter(o => o.selected).map(o => o.value);
                  // If nothing selected, default to All
                  setImportSelectedCollections(vals.length ? vals : ['All']);
                }}
                style={{ minWidth: 200, minHeight: 100 }}
                multiple
                disabled={isImporting || collections.length === 0}
              >
                <option value="All">{t('admin.database.collections.all')}</option>
                <option value="AllButLogs">{t('admin.database.collections.allButLogs')}</option>
                {collections.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </label>
          </div>
          <input
            type="file"
            accept=".jsonl"
            ref={fileInputRef}
            className="mb-200"
            style={{ display: 'block' }}
          />
          <GcdsButton
            type="submit"
            disabled={isImporting}
            variant="secondary"
          >
            {isImporting ? t('admin.database.importingLabel') : t('admin.database.importButton')}
          </GcdsButton>
        </form>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.createIndexes')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.createIndexesDescription')}
        </GcdsText>
        <GcdsButton
          onClick={handleCreateIndexes}
          disabled={isCreatingIndexes}
          variant="secondary"
          className="mb-200"
        >
          {isCreatingIndexes ? t('admin.database.creatingIndexesLabel') : t('admin.database.createIndexesButton')}
        </GcdsButton>
        {creationDetails && creationDetails.failed && creationDetails.failed.length > 0 && (
          <div style={{ marginTop: 12, border: '1px solid #d93939', padding: 12, borderRadius: 4, backgroundColor: '#fff5f5' }}>
            <div style={{ fontWeight: 600, color: '#d93939', marginBottom: 8 }}>
              {t('admin.database.indexCreationFailed')}
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
              {creationDetails.failed.map((f, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  <strong>{f.collection}</strong>: <span style={{ color: '#555' }}>{f.error}</span>
                  {f.code && <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>({t('admin.database.indexCodeLabel').replace('{code}', f.code)})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>


      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.dropIndexesTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.dropIndexesDescription')}
        </GcdsText>
        <GcdsButton
          onClick={handleDropIndexes}
          disabled={isDroppingIndexes}
          variant="danger"
          className="mb-200"
        >
          {isDroppingIndexes ? t('admin.database.droppingLabel') : t('admin.database.dropIndexesButton')}
        </GcdsButton>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.indexStatusTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.indexStatusDescription')}
        </GcdsText>
        <GcdsButton
          onClick={async () => {
            try {
              setIsCheckingIndexStatus(true);
              setIndexStatus(null);
              setMessage('');
              const res = await AuthService.fetch(getApiUrl('db-database-management'), {
                method: 'PATCH'
              });
              const json = await res.json();
              if (!res.ok) throw new Error(json.message || 'Check failed');
              setIndexStatus(json);
            } catch (err) {
              setMessage(t('admin.database.indexStatusError').replace('{error}', err.message));
            } finally {
              setIsCheckingIndexStatus(false);
            }
          }}
          disabled={isCheckingIndexStatus}
          variant="secondary"
          className="mb-200"
        >
          {isCheckingIndexStatus ? t('admin.database.checkingLabel') : t('admin.database.checkIndexStatusButton')}
        </GcdsButton>
        {indexStatus && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: indexStatus.anyBuilding ? 'blue' : indexStatus.allComplete ? 'green' : 'orange' }}>
              {indexStatus.message}
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingRight: 16 }}>{t('admin.database.collectionColumn')}</th>
                  <th style={{ textAlign: 'right', paddingRight: 16 }}>{t('admin.database.currentColumn')}</th>
                  <th style={{ textAlign: 'right', paddingRight: 16 }}>{t('admin.database.expectedColumn')}</th>
                  <th style={{ textAlign: 'left' }}>{t('admin.database.statusColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {indexStatus.collections?.map(col => (
                  <tr key={col.collection}>
                    <td style={{ paddingRight: 16 }}>{col.collection}</td>
                    <td style={{ textAlign: 'right', paddingRight: 16 }}>{col.currentIndexCount ?? '-'}</td>
                    <td style={{ textAlign: 'right', paddingRight: 16 }}>{col.expectedIndexCount ?? '-'}</td>
                    <td style={{ color: col.status === 'complete' ? 'green' : col.status === 'building' ? 'blue' : col.status === 'error' ? 'red' : 'orange' }}>
                      {col.status}
                      {col.status === 'building' && col.building?.length > 0 && (
                        <span style={{ marginLeft: 8, fontSize: 11 }}>
                          ({col.building.map(b => b.progress != null ? `${b.progress}%` : t('admin.database.inProgressLabel')).join(', ')})
                        </span>
                      )}
                      {col.status === 'incomplete' && col.missingIndexes?.length > 0 && (
                        <span style={{ marginLeft: 8, fontSize: 11, fontStyle: 'italic' }}>
                          {t('admin.database.missingLabel')} {col.missingIndexes.join('; ')}
                        </span>
                      )}
                      {col.error ? `: ${col.error}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.deleteSystemLogsTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.deleteSystemLogsDescription')}
        </GcdsText>
        <GcdsButton
          onClick={handleDeleteSystemLogs}
          disabled={isDeletingSystemLogs}
          variant="danger"
          className="mb-200"
        >
          {isDeletingSystemLogs ? t('admin.database.deletingLabel') : t('admin.database.deleteSystemLogsButton')}
        </GcdsButton>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.repairTimestampsTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.repairTimestampsDescription')}
        </GcdsText>
        <GcdsButton
          onClick={handleRepairTimestamps}
          disabled={isRepairingTimestamps}
          variant="secondary"
          className="mb-200"
        >
          {isRepairingTimestamps ? t('admin.database.repairingLabel') : t('admin.database.repairTimestampsButton')}
        </GcdsButton>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.deleteAllBatchesTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.deleteAllBatchesDescription')}
        </GcdsText>
        <GcdsButton
          onClick={handleDeleteAllBatches}
          disabled={isDeletingAllBatches}
          variant="danger"
          className="mb-200"
        >
          {isDeletingAllBatches ? t('admin.database.deletingLabel') : t('admin.database.deleteAllBatchesButton')}
        </GcdsButton>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.repairExpertFeedbackTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.repairExpertFeedbackDescription')}
        </GcdsText>
        <GcdsButton
          onClick={handleRepairExpertFeedback}
          disabled={isRepairingExpertFeedback}
          variant="secondary"
          className="mb-200"
        >
          {isRepairingExpertFeedback ? t('admin.database.repairingLabel') : t('admin.database.repairExpertFeedbackButton')}
        </GcdsButton>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.migratePublicFeedbackTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.migratePublicFeedbackDescription')}
        </GcdsText>
        <GcdsButton
          onClick={handleMigratePublicFeedback}
          disabled={isMigratingPublicFeedback}
          variant="secondary"
          className="mb-200"
        >
          {isMigratingPublicFeedback ? t('admin.database.migratingLabel') : t('admin.database.migratePublicFeedbackButton')}
        </GcdsButton>
      </div>

      {/* Show other messages (not import progress) at the bottom */}
      {(!isImporting && message) && <div style={{ marginTop: 16, color: 'blue' }}>{message}</div>}
    </GcdsContainer >
  );
};

export default DatabasePage;
