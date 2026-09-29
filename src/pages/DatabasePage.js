import React, { useRef, useState, useEffect } from 'react';
import { getApiUrl } from '../utils/apiToUrl.js';
import { GcdsContainer, GcdsHeading, GcdsText, GcdsButton, GcdsLink, GcdsIcon, GcdsFieldset } from '@gcds-core/components-react';
import AuthService from '../services/AuthService.js';
import DataStoreService from '../services/DataStoreService.js';
import BatchService from '../services/BatchService.js';
import streamSaver from 'streamsaver';
import { useTranslations } from '../hooks/useTranslations.js';
import { formatNumber } from '../utils/numberFormat.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import FeedbackInlineError from '../components/chat/FeedbackInlineError.js';
import { useInlineFormError } from '../hooks/useInlineFormError.js';
import { useErrorStatus } from '../hooks/useErrorStatus.js';
import { useAnnounceOnChange } from '../hooks/useAnnounceOnChange.js';
import { announce } from '../utils/liveAnnouncer.js';
import {
  ALL_BUT_LOGS_AND_EMBEDDINGS_EXPORT,
  EXPERT_EVAL_CHATS_EXPORT,
  getDatabaseExportCollections,
  getDatabaseExportFilenameTag,
  exportHasNoDates,
  toExportDateBounds
} from '../utils/database/exportCollections.js';

const DatabasePage = ({ lang }) => {
  const { t } = useTranslations(lang);

  // Every ...Message state below shares the same { text } (success) or
  // { prefix, suffix, detail, isError } (error) shape — buildErrorStatus/
  // renderStatusMessage build and render it, shared with SettingsPage.js's
  // own single use of the same shape (useErrorStatus.js) rather than each
  // hand-rolling it independently.
  const { buildErrorStatus, renderStatusMessage } = useErrorStatus(t);

  const [isExporting, setIsExporting] = useState(false);
  const [collections, setCollections] = useState([]);
  const [collectionsWithoutDates, setCollectionsWithoutDates] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('All');
  const [isImporting, setIsImporting] = useState(false);
  const importProgressRef = useRef(null);
  // skippable: a chunk tick is only worth saying if it's still the latest
  // one — fast chunks would otherwise queue up behind the announcer's
  // minimum gap and delay the final outcome behind stale "chunk N of M"s.
  useAnnounceOnChange(importProgressRef, { skippable: true });
  // 'All' | 'AllButLogs' | 'Chosen' (only the tables in importChosenTables)
  const [importScope, setImportScope] = useState('All');
  const [importChosenTables, setImportChosenTables] = useState([]);
  const [isDroppingIndexes, setIsDroppingIndexes] = useState(false);
  const [isDeletingSystemLogs, setIsDeletingSystemLogs] = useState(false);
  const [isDeletingAllBatches, setIsDeletingAllBatches] = useState(false);
  const [isRepairingTimestamps, setIsRepairingTimestamps] = useState(false);
  const [isRepairingExpertFeedback, setIsRepairingExpertFeedback] = useState(false);
  const [isRepairingQaMatchScores, setIsRepairingQaMatchScores] = useState(false);
  const [isMigratingPublicFeedback, setIsMigratingPublicFeedback] = useState(false);
  // Each async action below gets its own { text, isError } | null message
  // state, rendered right next to its own button, instead of one shared
  // state that only ever renders in one fixed page position regardless of
  // which button was clicked (was: a single `message` state rendered near
  // the top during import and at the very bottom of the page otherwise).
  const [exportMessage, setExportMessage] = useState(null);
  const [importMessage, setImportMessage] = useState(null);
  const [createIndexesMessage, setCreateIndexesMessage] = useState(null);
  const [dropIndexesMessage, setDropIndexesMessage] = useState(null);
  const [indexStatusMessage, setIndexStatusMessage] = useState(null);
  const [deleteSystemLogsMessage, setDeleteSystemLogsMessage] = useState(null);
  const [repairTimestampsMessage, setRepairTimestampsMessage] = useState(null);
  const [deleteAllBatchesMessage, setDeleteAllBatchesMessage] = useState(null);
  const [repairExpertFeedbackMessage, setRepairExpertFeedbackMessage] = useState(null);
  const [migratePublicFeedbackMessage, setMigratePublicFeedbackMessage] = useState(null);
  const [repairQaMatchScoresMessage, setRepairQaMatchScoresMessage] = useState(null);
  // Keyed by check.id — each integrity check button announces its own
  // outcome next to itself, not through one shared page-level message.
  const [checksMessages, setChecksMessages] = useState({});
  const [removeDuplicatesMessage, setRemoveDuplicatesMessage] = useState(null);
  const [isCreatingIndexes, setIsCreatingIndexes] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportLimit, setExportLimit] = useState(10000); // New state for export limit
  const [tableCounts, setTableCounts] = useState(null);
  const [countsError, setCountsError] = useState(null);
  // Import controls: chunk size in MB and optional throttle between chunk uploads (ms)
  const [importChunkMB, setImportChunkMB] = useState(90); // default 90 MB per file slice
  const [importThrottleMs, setImportThrottleMs] = useState(0); // default no extra delay between chunk POSTs
  const fileInputRef = useRef(null);
  // "No file selected" is a validation error tied to this field, not a
  // page-level outcome — matches SettingsPage.js's FeedbackInlineError
  // pattern (field-tied via id/aria-describedby) rather than StatusMessage.
  // useInlineFormError (rather than a bare useState) is what makes repeat
  // identical failures (e.g. clicking Import twice with no file selected)
  // still re-announce to screen readers — see the hook's own comment.
  const fileSelectError = useInlineFormError();
  // "Only the tables I choose" with nothing ticked — same field-tied pattern.
  const importTablesError = useInlineFormError();
  const [checksRunning, setChecksRunning] = useState({});
  const [checksResults, setChecksResults] = useState({});
  const [isRemovingDuplicates, setIsRemovingDuplicates] = useState(false);
  const [isCheckingIndexStatus, setIsCheckingIndexStatus] = useState(false);
  const [indexStatus, setIndexStatus] = useState(null);
  const [creationDetails, setCreationDetails] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchCountsAndCollections() {
      setCountsError(null);
      try {
        const counts = await DataStoreService.getTableCounts();
        if (isMounted) setTableCounts(counts);
      } catch (e) {
        // Was raw e.message, untranslated and unwrapped — same fix as the
        // ~13 buildErrorStatus call sites below, just missed on this one
        // since it predates them (fetched on mount, not from a button).
        if (isMounted) setCountsError(buildErrorStatus('admin.database.countsError', e));
      }
      // Fetch collections for export dropdown
      try {
        const collectionsRes = await AuthService.fetch(getApiUrl('db-database-management'), {
          method: 'GET'
        });
        if (collectionsRes.ok) {
          const { collections, collectionsWithoutDates } = await collectionsRes.json();
          if (isMounted && Array.isArray(collections)) setCollections(collections);
          if (isMounted && Array.isArray(collectionsWithoutDates)) setCollectionsWithoutDates(collectionsWithoutDates);
        }
      } catch (e) {
        // ignore
      }
    }
    fetchCountsAndCollections();
    return () => { isMounted = false; };
  }, []);

  // TODO (pending review — open question, not yet a confirmed gap):
  // SettingsPage.js's real convention (stageChange) is narrower than it
  // first looks — editing a field clears only that *section's* own stale
  // save message, never a sibling section's. Export/Import here already
  // match that exactly (each clears its own message when its own fields
  // change). The other ~10 operations (Drop indexes, Repair timestamps,
  // Migrate public feedback, etc.) are single-button actions with no
  // editable fields at all, so there's no field-edit event to hook a clear
  // into the way Settings/Export/Import do — per that actual precedent,
  // that may not be a gap. Open question for review: should an unrelated
  // stale message (e.g. "Repair timestamps succeeded" sitting on screen
  // while the admin then clicks "Drop indexes") get cleared by that
  // unrelated click, or is per-operation persistence until its own button
  // is re-clicked actually fine? Don't copy VectorPage.js's
  // fetchVectorStats (clears a sibling message too) as precedent here —
  // that pattern hasn't been reviewed yet.
  const exportDatesUnavailable = exportHasNoDates(selectedCollection, collectionsWithoutDates);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportMessage(null);

      // Use selectedCollection for export
      const collectionsToExport = getDatabaseExportCollections(selectedCollection, collections);
      if (!collectionsToExport || !Array.isArray(collectionsToExport) || collectionsToExport.length === 0) {
        throw new Error('No collections found');
      }

      // Step 2: Stream each collection as it is fetched (JSONL format)
      const collectionTag = getDatabaseExportFilenameTag(selectedCollection);
      const filename = `database-backup-${collectionTag}${new Date().toISOString()}.jsonl`;
      const fileStream = streamSaver.createWriteStream(filename);
      const writer = fileStream.getWriter();
      const encoder = new TextEncoder();
      const initialChunkSize = Number(exportLimit) || 10000;
      const dateBounds = exportDatesUnavailable ? {} : toExportDateBounds({ startDate, endDate });
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
              if (dateBounds.startDate) url += `&startDate=${encodeURIComponent(dateBounds.startDate)}`;
              if (dateBounds.endDate) url += `&endDate=${encodeURIComponent(dateBounds.endDate)}`;
              if (selectedCollection === EXPERT_EVAL_CHATS_EXPORT) url += '&exportScope=expertEvalChats';
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
      setExportMessage({ text: t('admin.database.exportSuccess'), isError: false });
    } catch (error) {
      setExportMessage(buildErrorStatus('admin.database.exportError', error));
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event) => {
    event.preventDefault();
    // One error at a time: each moves focus onto itself.
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      fileSelectError.triggerError();
      return;
    }
    fileSelectError.clearError();
    if (importScope === 'Chosen' && importChosenTables.length === 0) {
      importTablesError.triggerError();
      return;
    }
    importTablesError.clearError();
    // Import upserts over existing records, so it gets the same popup as
    // every other destructive action on this page.
    if (!window.confirm(t('admin.database.importConfirm'))) return;

    setIsImporting(true);
    setImportMessage({ text: t('admin.database.importStarting'), isError: false });
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
      const buildCollectionPayload = () => (importScope === 'Chosen' ? importChosenTables : importScope);
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
          setImportMessage({
            text: t('admin.database.importChunkProgress')
              .replace('{chunk}', chunkIndex + 1)
              .replace('{total}', totalChunks)
              .replace('{inserted}', accumulatedStats.inserted)
              .replace('{failed}', accumulatedStats.failed)
              .replace('{skipped}', accumulatedStats.skipped),
            isError: false,
          });
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
        setImportMessage({
          text: t('admin.database.importChunkProgress')
            .replace('{chunk}', chunkIndex + 1)
            .replace('{total}', totalChunks)
            .replace('{inserted}', accumulatedStats.inserted)
            .replace('{failed}', accumulatedStats.failed)
            .replace('{skipped}', accumulatedStats.skipped),
          isError: false,
        });
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
      let finalMsg = accumulatedStats.skipped
        ? t('admin.database.importCompleteWithSkipped')
          .replace('{inserted}', accumulatedStats.inserted)
          .replace('{failed}', accumulatedStats.failed)
          .replace('{skipped}', accumulatedStats.skipped)
        : t('admin.database.importComplete')
          .replace('{inserted}', accumulatedStats.inserted)
          .replace('{failed}', accumulatedStats.failed);
      if (accumulatedStats.skippedExamples && accumulatedStats.skippedExamples.length) {
        finalMsg += `\n${t('admin.database.importSkippedExamplesHeader')}\n${accumulatedStats.skippedExamples.slice(0, 10).join('\n')}`;
      }
      setImportMessage({ text: finalMsg, isError: false });
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset file input
      }
    } catch (error) {
      setImportMessage(buildErrorStatus('admin.database.importError', error));
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
      setDropIndexesMessage(null);

      const response = await AuthService.fetch(getApiUrl('db-database-management'), {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to drop indexes');
      }

      const result = await response.json();
      setDropIndexesMessage({ text: t('admin.database.dropIndexesSuccess').replace('{count}', result.results.success.length), isError: false });
    } catch (error) {
      setDropIndexesMessage(buildErrorStatus('admin.database.dropIndexesError', error));
      console.error('Drop indexes error:', error);
    } finally {
      setIsDroppingIndexes(false);
    }
  };

  const handleDeleteSystemLogs = async () => {
    if (!window.confirm(t('admin.database.deleteSystemLogsConfirm'))) return;
    setIsDeletingSystemLogs(true);
    setDeleteSystemLogsMessage(null);
    try {
      const response = await AuthService.fetch(getApiUrl('db-delete-system-logs'), {
        method: 'DELETE'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Failed to delete system logs');
      setDeleteSystemLogsMessage({ text: t('admin.database.deleteSystemLogsSuccess').replace('{count}', result.deletedCount), isError: false });
    } catch (error) {
      setDeleteSystemLogsMessage(buildErrorStatus('admin.database.deleteSystemLogsError', error));
    } finally {
      setIsDeletingSystemLogs(false);
    }
  };

  const handleDeleteAllBatches = async () => {
    if (!window.confirm(t('admin.database.deleteAllBatchesConfirm'))) return;

    setIsDeletingAllBatches(true);
    setDeleteAllBatchesMessage(null);
    try {
      const result = await BatchService.deleteAllBatches();
      // Expecting { deletedBatches, deletedBatchItems } or similar
      const deletedBatches = (result && result.deletedBatches != null) ? result.deletedBatches : (result && result.deleted != null ? result.deleted : 0);
      const deletedBatchItems = (result && result.deletedBatchItems != null) ? result.deletedBatchItems : 0;
      setDeleteAllBatchesMessage({ text: t('admin.database.deleteAllBatchesSuccess').replace('{batches}', deletedBatches).replace('{batchItems}', deletedBatchItems), isError: false });
    } catch (error) {
      setDeleteAllBatchesMessage(buildErrorStatus('admin.database.deleteAllBatchesError', error));
      console.error('Delete all batches error:', error);
    } finally {
      setIsDeletingAllBatches(false);
    }
  };

  const handleRepairTimestamps = async () => {
    if (!window.confirm(t('admin.database.repairTimestampsConfirm'))) return;

    setIsRepairingTimestamps(true);
    setRepairTimestampsMessage(null);

    try {
      const result = await DataStoreService.repairTimestamps();
      setRepairTimestampsMessage({ text: t('admin.database.repairTimestampsSuccess').replace('{updated}', result.stats.tools.updated).replace('{total}', result.stats.tools.total), isError: false });
    } catch (error) {
      setRepairTimestampsMessage(buildErrorStatus('admin.database.repairTimestampsError', error));
    } finally {
      setIsRepairingTimestamps(false);
    }
  };

  const handleRepairExpertFeedback = async () => {
    if (!window.confirm(t('admin.database.repairExpertFeedbackConfirm'))) return;

    setIsRepairingExpertFeedback(true);
    setRepairExpertFeedbackMessage(null);

    try {
      const result = await DataStoreService.repairExpertFeedback();
      setRepairExpertFeedbackMessage({ text: t('admin.database.repairExpertFeedbackSuccess').replace('{updated}', result.stats.expertFeedback.updated).replace('{total}', result.stats.expertFeedback.total).replace('{alreadyCorrect}', result.stats.expertFeedback.alreadyCorrect), isError: false });
    } catch (error) {
      setRepairExpertFeedbackMessage(buildErrorStatus('admin.database.repairExpertFeedbackError', error));
    } finally {
      setIsRepairingExpertFeedback(false);
    }
  };

  const handleRepairQaMatchScores = async () => {
    if (!window.confirm(t('admin.database.repairQaMatchScoresConfirm'))) return;
    setIsRepairingQaMatchScores(true);
    setRepairQaMatchScoresMessage(null);
    try {
      const result = await DataStoreService.repairQaMatchScores();
      setRepairQaMatchScoresMessage({ text: t('admin.database.repairQaMatchScoresSuccess').replace('{updated}', result.stats.updated).replace('{matches}', result.stats.matches), isError: false });
    } catch (error) {
      setRepairQaMatchScoresMessage(buildErrorStatus('admin.database.repairQaMatchScoresError', error));
    } finally {
      setIsRepairingQaMatchScores(false);
    }
  };

  const handleMigratePublicFeedback = async () => {
    if (!window.confirm(t('admin.database.migratePublicFeedbackConfirm'))) return;
    setIsMigratingPublicFeedback(true);
    setMigratePublicFeedbackMessage(null);
    try {
      const result = await DataStoreService.migratePublicFeedback();
      setMigratePublicFeedbackMessage({ text: t('admin.database.migratePublicFeedbackSuccess').replace('{migrated}', result.migrated || 0), isError: false });
    } catch (error) {
      setMigratePublicFeedbackMessage(buildErrorStatus('admin.database.migratePublicFeedbackError', error));
    } finally {
      setIsMigratingPublicFeedback(false);
    }
  };

  const handleCreateIndexes = async () => {
    const confirmed = window.confirm(t('admin.database.createIndexesConfirm'));

    if (!confirmed) return;

    try {
      setIsCreatingIndexes(true);
      setCreateIndexesMessage(null);

      const result = await DataStoreService.createIndexes();

      const successCount = result.results.success ? result.results.success.length : 0;
      const failCount = result.results.failed ? result.results.failed.length : 0;

      setCreationDetails(result.results);
      setCreateIndexesMessage({ text: t('admin.database.createIndexesSuccess').replace('{successCount}', successCount).replace('{failCount}', failCount), isError: false });
    } catch (error) {
      setCreationDetails(null);
      setCreateIndexesMessage(buildErrorStatus('admin.database.createIndexesError', error));
      console.error('Create indexes error:', error);
    } finally {
      setIsCreatingIndexes(false);
    }
  };


  return (
    <GcdsContainer layout="page">
      <GcdsHeading tag="h1">{t('admin.database.title')}</GcdsHeading>
      {/* TODO: this aria-label is hand-copied onto every admin page's own <nav> —
          worth centralizing into a shared local nav/breadcrumb component so new
          pages can't reintroduce the unlabeled-nav gap this fixes. */}
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsLink href={`/${lang}/admin`}>
          {t('common.backToAdmin')}
        </GcdsLink>
      </nav>
      {/* Table counts display */}
      <div style={{ marginBottom: 24 }}>
        <GcdsHeading tag="h2">{t('admin.database.tableRecordCounts')}</GcdsHeading>
        {renderStatusMessage(countsError, 'success', 'counts')}
        {tableCounts ? (
          <dl className="canada-ca-dl-columns font-size-text-sm-nr">
            {Object.entries(tableCounts).map(([table, count]) => (
              <div key={table}>
                <dt>{t(`admin.database.collections.${table.toLowerCase()}`) || table}</dt>
                <dd>{formatNumber(count, lang)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          !countsError && <div>{t('common.loading')}</div>
        )}
      </div>
      <div className="mb-400 filter-fields-full-size">
        <GcdsHeading tag="h2">{t('admin.database.exportTitle')}</GcdsHeading>
        {/* Every export field clears exportMessage on change — a stale
            "Export failed"/"Export succeeded" from the last run shouldn't
            keep showing once the admin has started changing what they're
            about to export next. Same idea as SettingsPage.js's
            stageChange clearing a section's stale save-outcome message on
            edit; inline here rather than a shared helper/lookup table
            since it's only 4 fields, not ~30 across 6 sections. */}
        <div className="mb-300">
          <label htmlFor="database-export-table" className="filter-label display-block">
            {t('admin.database.tableLabel')}
          </label>
          <select
            id="database-export-table"
            className="filter-select filter-select--narrow"
            value={selectedCollection}
            onChange={e => { setSelectedCollection(e.target.value); setExportMessage(null); }}
            disabled={isExporting || collections.length === 0}
          >
            <option value="All">{t('admin.database.collections.all')}</option>
            <option value="AllButLogs">{t('admin.database.collections.allButLogs')}</option>
            <option value={ALL_BUT_LOGS_AND_EMBEDDINGS_EXPORT}>{t('admin.database.collections.allButLogsAndEmbeddings')}</option>
            <option value={EXPERT_EVAL_CHATS_EXPORT}>{t('admin.database.collections.expertEvalChats')}</option>
            {collections.map((col) => (
              <option key={col} value={col}>{t(`admin.database.collections.${col.toLowerCase()}`) || col}</option>
            ))}
          </select>
        </div>
        {/* Dates filter on updatedAt. For a table without it, an info
            message takes their place instead of fields that do nothing. */}
        {exportDatesUnavailable ? (
          <div className="mb-300">
            <StatusMessage variant="info" message={t('admin.database.datesNotApplicableTable')} />
          </div>
        ) : (
          <GcdsFieldset
            className="mb-300"
            legend={t('admin.database.dateRangeLegend')}
            legendSize="h6"
            hint={t('admin.database.dateRangeHint')}
          >
            <div className="mb-300">
              <label htmlFor="database-export-start-date" className="filter-label display-block">
                {t('admin.database.startDate')}
              </label>
              <input
                id="database-export-start-date"
                type="date"
                className="filter-input filter-input--narrow"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setExportMessage(null); }}
              />
            </div>
            <div>
              <label htmlFor="database-export-end-date" className="filter-label display-block">
                {t('admin.database.endDate')}
              </label>
              <input
                id="database-export-end-date"
                type="date"
                className="filter-input filter-input--narrow"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setExportMessage(null); }}
              />
            </div>
          </GcdsFieldset>
        )}
        <div className="mb-300">
          <label htmlFor="database-export-limit" className="filter-label display-block">
            {t('admin.database.limitLabel')}
          </label>
          <input
            id="database-export-limit"
            type="number"
            min="1"
            className="filter-input filter-input--narrow"
            value={exportLimit}
            onChange={e => { setExportLimit(e.target.value); setExportMessage(null); }}
            disabled={isExporting}
          />
        </div>
        <GcdsButton onClick={handleExport} disabled={isExporting || collections.length === 0} className="mb-200">
          {/* Decorative icon; the text is the whole accessible name. */}
          <span className="export-button-label">
            <GcdsIcon name="download" />
            {isExporting ? t('admin.database.exporting') : t('admin.database.exportButton')}
          </span>
        </GcdsButton>
        {renderStatusMessage(exportMessage, 'success', 'export')}
      </div>
      {/* Integrity checks: orphan and parent-invalid-child counts */}
      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.integrityTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.integrityDescription')}
        </GcdsText>
        <details open className="mb-200">
          <summary style={{ cursor: 'pointer', fontWeight: '600' }}>{t('admin.database.coreChecksLabel')}</summary>
          {/* role="list": Safari drops list semantics without bullets */}
          <ul className="mt-200" role="list">
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
              <li key={check.id} className="canada-ca-action-result-row">
                {/* Name | buttons + message | results */}
                <div className="font-size-text-sm-nr">{t(`admin.database.${check.labelKey}`)}</div>
                <div>
                  <div className="d-flex flex-wrap gap-200">
                    {/* Native, not GcdsButton: its sr-only check name must
                        reach the accessible name. aria-disabled keeps focus. */}
                    <button
                      type="button"
                      className="btn-secondary"
                      aria-disabled={checksRunning[check.id] ? 'true' : undefined}
                      onClick={async () => {
                        if (checksRunning[check.id]) return;
                        try {
                          setChecksRunning(prev => ({ ...prev, [check.id]: true }));
                          setChecksMessages(prev => ({ ...prev, [check.id]: null }));
                          const res = await AuthService.fetch(getApiUrl(`db-integrity-checks?check=${encodeURIComponent(check.id)}&limit=10`), {
                            method: 'GET'
                          });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json.message || 'Check failed');
                          setChecksResults(prev => ({ ...prev, [check.id]: json }));
                          announce(`${t(`admin.database.${check.labelKey}`)}. ${t('admin.database.countLabel')} ${json.count}`);
                        } catch (err) {
                          setChecksMessages(prev => ({
                            ...prev,
                            [check.id]: buildErrorStatus(
                              'admin.database.checkFailed',
                              err,
                              { check: check.id },
                            ),
                          }));
                        } finally {
                          setChecksRunning(prev => ({ ...prev, [check.id]: false }));
                        }
                      }}
                    >
                      {checksRunning[check.id] ? t('admin.database.runningLabel') : t('admin.database.runCheckButton')}
                      {/* Names the check - 12 buttons otherwise share one name */}
                      <span className="sr-only"> – {t(`admin.database.${check.labelKey}`)}</span>
                    </button>
                    {/* Add Remove Duplicates button only for duplicateKeys check */}
                    {check.id === 'duplicateKeys' && (
                      <GcdsButton
                        onClick={async () => {
                          if (!window.confirm(t('admin.database.removeDuplicatesConfirm'))) return;
                          try {
                            setIsRemovingDuplicates(true);
                            setRemoveDuplicatesMessage(null);
                            const res = await AuthService.fetch(getApiUrl('db-integrity-checks?action=removeDuplicates'), {
                              method: 'DELETE'
                            });
                            const json = await res.json();
                            if (!res.ok) throw new Error(json.message || 'Remove duplicates failed');
                            setRemoveDuplicatesMessage({ text: t('admin.database.removeDuplicatesSuccess').replace('{count}', json.deletedCount), isError: false });
                            // Refresh the check results
                            setChecksResults(prev => ({ ...prev, duplicateKeys: null }));
                          } catch (err) {
                            setRemoveDuplicatesMessage(buildErrorStatus('admin.database.removeDuplicatesError', err));
                          } finally {
                            setIsRemovingDuplicates(false);
                          }
                        }}
                        disabled={isRemovingDuplicates}
                        buttonRole="danger"
                      >
                        {isRemovingDuplicates ? t('admin.database.removingLabel') : t('admin.database.removeDuplicatesButton')}
                      </GcdsButton>
                    )}
                  </div>
                  {renderStatusMessage(checksMessages[check.id], 'success', `check-${check.id}`)}
                  {check.id === 'duplicateKeys' && (
                    renderStatusMessage(removeDuplicatesMessage, 'success', 'removeDuplicates')
                  )}
                </div>
                <div className="font-size-text-sm-nr">
                  {checksResults[check.id] ? (
                    <>
                      <div>{t('admin.database.countLabel')} <strong>{checksResults[check.id].count}</strong></div>
                      {checksResults[check.id].breakdown && (
                        <div>{t('admin.database.breakdownMissing').replace('{chat}', checksResults[check.id].breakdown.missingChat).replace('{interaction}', checksResults[check.id].breakdown.missingInteraction).replace('{question}', checksResults[check.id].breakdown.missingQuestion).replace('{answer}', checksResults[check.id].breakdown.missingAnswer)}</div>
                      )}
                      {checksResults[check.id].samples && checksResults[check.id].samples.length ? (
                        <div>{t('admin.database.breakdownSamples').replace('{samples}', checksResults[check.id].samples.slice(0, 5).map(s => (s._id || s)).join(', '))}</div>
                      ) : null}
                    </>
                  ) : <span className="label pending">{t('admin.database.notRunLabel')}</span>}
                </div>
              </li>
            ))}
          </ul>
        </details>
      </div >

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.importTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.importDescription')}
        </GcdsText>
        <form onSubmit={handleImport} className="mb-200 filter-fields-full-size">
          {/* Every import field clears importMessage on change — same
              reasoning as the export section above. */}
          <label htmlFor="database-import-file" className="filter-label display-block">
            {t('admin.database.importFileLabel')}
          </label>
          {fileSelectError.hasError && (
            <FeedbackInlineError
              id="database-import-file-error"
              message={t('admin.database.fileSelectError')}
              errorCount={fileSelectError.errorCount}
              inputRef={fileSelectError.errorRef}
            />
          )}
          {/* Native file input dressed as GC DS's file uploader
              (.canada-ca-file-input), keeping the app's own field-tied
              FeedbackInlineError rather than GcdsFileUploader's. */}
          <input
            id="database-import-file"
            type="file"
            accept=".jsonl"
            ref={fileInputRef}
            onChange={() => { setImportMessage(null); fileSelectError.clearError(); }}
            className="canada-ca-file-input mb-300"
            aria-describedby={fileSelectError.hasError ? 'database-import-file-error' : undefined}
            disabled={isImporting}
          />

          <fieldset className="gc-chckbxrdio md canada-ca-choice-fieldset">
            <legend className="filter-label">{t('admin.database.importTablesLegend')}</legend>
            {[
              { value: 'All', label: t('admin.database.collections.all') },
              { value: 'AllButLogs', label: t('admin.database.collections.allButLogs') },
              { value: 'Chosen', label: t('admin.database.importScopeChosen') }
            ].map(option => (
              <div className="radio" key={option.value}>
                <input
                  type="radio"
                  id={`database-import-scope-${option.value}`}
                  name="database-import-scope"
                  value={option.value}
                  checked={importScope === option.value}
                  onChange={() => { setImportScope(option.value); setImportMessage(null); importTablesError.clearError(); }}
                  disabled={isImporting || collections.length === 0}
                />
                <label htmlFor={`database-import-scope-${option.value}`}>{option.label}</label>
              </div>
            ))}
            {/* Revealed right under the radio that asks for it. */}
            {importScope === 'Chosen' && (
              <fieldset
                className={`gc-chckbxrdio md canada-ca-choice-fieldset${importTablesError.hasError ? ' has-error' : ''}`}
                aria-describedby={importTablesError.hasError ? 'database-import-tables-error' : undefined}
              >
                <legend className="filter-label">{t('admin.database.importChosenLegend')}</legend>
                {importTablesError.hasError && (
                  <FeedbackInlineError
                    id="database-import-tables-error"
                    message={t('admin.database.importTablesError')}
                    errorCount={importTablesError.errorCount}
                    inputRef={importTablesError.errorRef}
                  />
                )}
                {collections.map(col => (
                  <div className="checkbox" key={col}>
                    <input
                      type="checkbox"
                      id={`database-import-table-${col}`}
                      value={col}
                      checked={importChosenTables.includes(col)}
                      onChange={e => {
                        setImportChosenTables(prev => (e.target.checked ? [...prev, col] : prev.filter(c => c !== col)));
                        setImportMessage(null);
                        importTablesError.clearError();
                      }}
                      disabled={isImporting}
                    />
                    <label htmlFor={`database-import-table-${col}`}>{t(`admin.database.collections.${col.toLowerCase()}`) || col}</label>
                  </div>
                ))}
              </fieldset>
            )}
          </fieldset>

          <div className="mb-300">
            <label htmlFor="database-import-chunk-size" className="filter-label display-block">
              {t('admin.database.chunkSizeLabel')}
            </label>
            <input
              id="database-import-chunk-size"
              type="number"
              min="0.0625"
              step="0.0625"
              className="filter-input filter-input--narrow"
              value={importChunkMB}
              onChange={e => { setImportChunkMB(e.target.value); setImportMessage(null); }}
              disabled={isImporting}
            />
          </div>
          <div className="mb-300">
            <label htmlFor="database-import-throttle" className="filter-label display-block">
              {t('admin.database.throttleLabel')}
            </label>
            <input
              id="database-import-throttle"
              type="number"
              min="0"
              step="50"
              className="filter-input filter-input--narrow"
              value={importThrottleMs}
              onChange={e => { setImportThrottleMs(e.target.value); setImportMessage(null); }}
              disabled={isImporting}
            />
          </div>

          <GcdsButton
            type="submit"
            disabled={isImporting}
            buttonRole="secondary"
            className="mb-200"
          >
            {isImporting ? t('admin.database.importingLabel') : t('admin.database.importButton')}
          </GcdsButton>
          {/* Right under the Import button, like the other sections' outcomes:
              the fields between the file input and the button (up to one
              checkbox per table) would otherwise push this out of view of
              whoever just clicked. During import it's the per-chunk
              progress as plain text (.status-message--progress), not a
              StatusMessage box, since a chunk tick isn't a settled outcome;
              once import finishes, a StatusMessage box shows the result.
              TODO: chunkIndex/totalChunks are already known during the
              import loop (see handleImport) — a real determinate progress
              bar could replace this text-only counter later. If it does,
              it should be its own small component (bar + a text line
              announced via useAnnounceOnChange, same shape as
              ExperimentalAnalysisPage.js's ProgressCard), not a new
              StatusMessage prop — see the scope note in StatusMessage.js.
              Each chunk tick is announced through the shared announcer
              (importProgressRef), not by this div being a live region — it's
              conditionally rendered, so as its own role="status" the first
              tick was inserted-with-text and never heard. */}
          {isImporting ? (
            <div ref={importProgressRef} className="status-message--progress">{importMessage?.text}</div>
          ) : (
            renderStatusMessage(importMessage, 'success', 'import')
          )}
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
          buttonRole="secondary"
          className="mb-200"
        >
          {isCreatingIndexes ? t('admin.database.creatingIndexesLabel') : t('admin.database.createIndexesButton')}
        </GcdsButton>
        {renderStatusMessage(createIndexesMessage, 'success', 'createIndexes')}
        {creationDetails && creationDetails.failed && creationDetails.failed.length > 0 && (
          <div style={{ marginTop: 12, border: '1px solid #d93939', padding: 12, borderRadius: 4, backgroundColor: '#fff5f5' }}>
            <div style={{ fontWeight: 600, color: '#d93939', marginBottom: 8 }}>
              {t('admin.database.indexCreationFailed')}
            </div>
            <ul className="font-size-text-sm-nr" style={{ margin: 0, paddingLeft: 20 }}>
              {creationDetails.failed.map((f, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  <strong>{f.collection}</strong>: <span style={{ color: '#555' }}>{f.error}</span>
                  {f.code && <span className="text-secondary" style={{ marginLeft: 8 }}>({t('admin.database.indexCodeLabel').replace('{code}', f.code)})</span>}
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
          buttonRole="danger"
          className="mb-200"
        >
          {isDroppingIndexes ? t('admin.database.droppingLabel') : t('admin.database.dropIndexesButton')}
        </GcdsButton>
        {renderStatusMessage(dropIndexesMessage, 'success', 'dropIndexes')}
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
              setIndexStatusMessage(null);
              const json = await DataStoreService.checkIndexStatus();
              setIndexStatus(json);
            } catch (err) {
              setIndexStatusMessage(buildErrorStatus('admin.database.indexStatusError', err));
            } finally {
              setIsCheckingIndexStatus(false);
            }
          }}
          disabled={isCheckingIndexStatus}
          buttonRole="secondary"
          className="mb-200"
        >
          {isCheckingIndexStatus ? t('admin.database.checkingLabel') : t('admin.database.checkIndexStatusButton')}
        </GcdsButton>
        {renderStatusMessage(indexStatusMessage, 'success', 'indexStatus')}
        {indexStatus && (
          <div style={{ marginTop: 12 }}>
            {/* Was a hand-rolled colored <div> showing indexStatus.message
                verbatim — raw, untranslated server text with no t() call at
                all. The server's message is actually always one of these
                same 3 fixed strings (see api/db/db-database-management.js),
                picked from the exact same anyBuilding/allComplete booleans
                already computed here — so the frontend translates its own
                copy instead of echoing the server's English one. */}
            <div style={{ marginBottom: 8 }}>
              <StatusMessage
                variant={indexStatus.anyBuilding ? 'info' : indexStatus.allComplete ? 'success' : 'warning'}
                message={t(
                  indexStatus.anyBuilding
                    ? 'admin.database.indexStatusBuilding'
                    : indexStatus.allComplete
                      ? 'admin.database.indexStatusComplete'
                      : 'admin.database.indexStatusIncomplete'
                )}
              />
            </div>
            <table className="font-size-text-sm-nr" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left', paddingRight: 16 }}>{t('admin.database.collectionColumn')}</th>
                  <th scope="col" style={{ textAlign: 'right', paddingRight: 16 }}>{t('admin.database.currentColumn')}</th>
                  <th scope="col" style={{ textAlign: 'right', paddingRight: 16 }}>{t('admin.database.expectedColumn')}</th>
                  <th scope="col" style={{ textAlign: 'left' }}>{t('admin.database.statusColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {indexStatus.collections?.map(col => (
                  <tr key={col.collection}>
                    <td style={{ paddingRight: 16 }}>{col.collection}</td>
                    <td style={{ textAlign: 'right', paddingRight: 16 }}>{col.currentIndexCount ?? '-'}</td>
                    <td style={{ textAlign: 'right', paddingRight: 16 }}>{col.expectedIndexCount ?? '-'}</td>
                    <td>
                      {/* TODO: confirm the backend (api/db/db-database-management.js) never emits
                          a status outside building/complete/incomplete/error — if it doesn't, this
                          whitelist is dead code and can simplify to `label ${col.status}`. */}
                      <span className={`label ${['complete', 'building', 'error'].includes(col.status) ? col.status : 'incomplete'}`}>
                        {col.status}
                      </span>
                      {col.status === 'building' && col.building?.length > 0 && (
                        <span style={{ marginLeft: 8 }}>
                          ({col.building.map(b => b.progress != null ? `${b.progress}%` : t('admin.database.inProgressLabel')).join(', ')})
                        </span>
                      )}
                      {col.status === 'incomplete' && col.missingIndexes?.length > 0 && (
                        <span style={{ marginLeft: 8 }}>
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
          buttonRole="danger"
          className="mb-200"
        >
          {isDeletingSystemLogs ? t('admin.database.deletingLabel') : t('admin.database.deleteSystemLogsButton')}
        </GcdsButton>
        {renderStatusMessage(deleteSystemLogsMessage, 'success', 'deleteSystemLogs')}
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.repairTimestampsTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.repairTimestampsDescription')}
        </GcdsText>
        <GcdsButton
          onClick={handleRepairTimestamps}
          disabled={isRepairingTimestamps}
          buttonRole="secondary"
          className="mb-200"
        >
          {isRepairingTimestamps ? t('admin.database.repairingLabel') : t('admin.database.repairTimestampsButton')}
        </GcdsButton>
        {renderStatusMessage(repairTimestampsMessage, 'success', 'repairTimestamps')}
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.deleteAllBatchesTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.deleteAllBatchesDescription')}
        </GcdsText>
        <GcdsButton
          onClick={handleDeleteAllBatches}
          disabled={isDeletingAllBatches}
          buttonRole="danger"
          className="mb-200"
        >
          {isDeletingAllBatches ? t('admin.database.deletingLabel') : t('admin.database.deleteAllBatchesButton')}
        </GcdsButton>
        {renderStatusMessage(deleteAllBatchesMessage, 'success', 'deleteAllBatches')}
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.repairExpertFeedbackTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.repairExpertFeedbackDescription')}
        </GcdsText>
        <GcdsButton
          onClick={handleRepairExpertFeedback}
          disabled={isRepairingExpertFeedback}
          buttonRole="secondary"
          className="mb-200"
        >
          {isRepairingExpertFeedback ? t('admin.database.repairingLabel') : t('admin.database.repairExpertFeedbackButton')}
        </GcdsButton>
        {renderStatusMessage(repairExpertFeedbackMessage, 'success', 'repairExpertFeedback')}
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.migratePublicFeedbackTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.database.migratePublicFeedbackDescription')}
        </GcdsText>
        <GcdsButton
          onClick={handleMigratePublicFeedback}
          disabled={isMigratingPublicFeedback}
          buttonRole="secondary"
          className="mb-200"
        >
          {isMigratingPublicFeedback ? t('admin.database.migratingLabel') : t('admin.database.migratePublicFeedbackButton')}
        </GcdsButton>
        {renderStatusMessage(migratePublicFeedbackMessage, 'success', 'migratePublicFeedback')}
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.database.repairQaMatchScoresTitle')}</GcdsHeading>
        <GcdsText>{t('admin.database.repairQaMatchScoresDescription')}</GcdsText>
        <GcdsButton onClick={handleRepairQaMatchScores} disabled={isRepairingQaMatchScores} buttonRole="secondary" className="mb-200">
          {isRepairingQaMatchScores ? t('admin.database.repairingLabel') : t('admin.database.repairQaMatchScoresButton')}
        </GcdsButton>
        {renderStatusMessage(repairQaMatchScoresMessage, 'success', 'repairQaMatchScores')}
      </div>
    </GcdsContainer >
  );
};

export default DatabasePage;
