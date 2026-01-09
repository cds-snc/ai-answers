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
  const [isBackfillingSecrets, setIsBackfillingSecrets] = useState(false);
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
    const confirmed = window.confirm(
      lang === 'en'
        ? 'This will drop all database indexes. Database operations may be slower until indexes are rebuilt automatically. Are you sure you want to continue?'
        : 'Cette action supprimera tous les index de la base de données. Les opérations de base de données peuvent être plus lentes jusqu\'à ce que les index soient reconstruits automatiquement. Êtes-vous sûr de vouloir continuer?'
    );

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
      setMessage(lang === 'en'
        ? `Indexes dropped successfully for ${result.results.success.length} collections`
        : `Indexes supprimés avec succès pour ${result.results.success.length} collections`
      );
    } catch (error) {
      setMessage(lang === 'en'
        ? `Drop indexes failed: ${error.message}`
        : `Échec de la suppression des index: ${error.message}`
      );
      console.error('Drop indexes error:', error);
    } finally {
      setIsDroppingIndexes(false);
    }
  };

  const handleDeleteSystemLogs = async () => {
    if (!window.confirm(
      lang === 'en'
        ? 'Are you sure you want to delete all logs with chatId = "system"? This cannot be undone.'
        : 'Êtes-vous sûr de vouloir supprimer tous les journaux avec chatId = "system" ? Cette action est irréversible.'
    )) return;
    setIsDeletingSystemLogs(true);
    setMessage('');
    try {
      const response = await AuthService.fetch(getApiUrl('db-delete-system-logs'), {
        method: 'DELETE'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Failed to delete system logs');
      setMessage(
        (lang === 'en'
          ? `Deleted ${result.deletedCount} system logs.`
          : `Supprimé ${result.deletedCount} journaux système.`)
      );
    } catch (error) {
      setMessage(
        lang === 'en'
          ? `Delete system logs failed: ${error.message}`
          : `Échec de la suppression des journaux système: ${error.message}`
      );
    } finally {
      setIsDeletingSystemLogs(false);
    }
  };

  const handleDeleteAllBatches = async () => {
    if (!window.confirm(
      lang === 'en'
        ? 'This will delete ALL batches and batchItems. This cannot be undone. Are you sure you want to continue?'
        : "Cela supprimera TOUS les lots et batchItems. Cette action est irréversible. Êtes-vous sûr de vouloir continuer?"
    )) return;

    setIsDeletingAllBatches(true);
    setMessage('');
    try {
      const result = await BatchService.deleteAllBatches();
      // Expecting { deletedBatches, deletedBatchItems } or similar
      const deletedBatches = (result && result.deletedBatches != null) ? result.deletedBatches : (result && result.deleted != null ? result.deleted : 0);
      const deletedBatchItems = (result && result.deletedBatchItems != null) ? result.deletedBatchItems : 0;
      setMessage(
        lang === 'en'
          ? `Deleted batches: ${deletedBatches}, deleted batchItems: ${deletedBatchItems}`
          : `Lots supprimés : ${deletedBatches}, batchItems supprimés : ${deletedBatchItems}`
      );
    } catch (error) {
      setMessage(
        lang === 'en'
          ? `Delete all batches failed: ${error.message}`
          : `Échec de la suppression des lots : ${error.message}`
      );
      console.error('Delete all batches error:', error);
    } finally {
      setIsDeletingAllBatches(false);
    }
  };

  const handleRepairTimestamps = async () => {
    if (!window.confirm(
      lang === 'en'
        ? 'This will add updatedAt timestamps to existing tool records without them. Are you sure you want to continue?'
        : 'Cela ajoutera des horodatages updatedAt aux enregistrements d\'outils existants qui n\'en ont pas. Êtes-vous sûr de vouloir continuer?'
    )) return;

    setIsRepairingTimestamps(true);
    setMessage('');

    try {
      const result = await DataStoreService.repairTimestamps();
      setMessage(
        lang === 'en'
          ? `Tool timestamps repaired successfully. Tools: ${result.stats.tools.updated}/${result.stats.tools.total}`
          : `Horodatages des outils réparés avec succès. Outils: ${result.stats.tools.updated}/${result.stats.tools.total}`
      );
    } catch (error) {
      setMessage(
        lang === 'en'
          ? `Repair timestamps failed: ${error.message}`
          : `Échec de la réparation des horodatages: ${error.message}`
      );
    } finally {
      setIsRepairingTimestamps(false);
    }
  };

  const handleRepairExpertFeedback = async () => {
    if (!window.confirm(
      lang === 'en'
        ? 'This will set the "type" field to "expert" for expert feedback records that have missing or empty type fields. Records with "public" or "ai" types will be left unchanged. Are you sure you want to continue?'
        : 'Cela définira le champ "type" sur "expert" pour les enregistrements de commentaires d\'experts qui ont des champs de type manquants ou vides. Les enregistrements avec les types "public" ou "ai" resteront inchangés. Êtes-vous sûr de vouloir continuer?'
    )) return;

    setIsRepairingExpertFeedback(true);
    setMessage('');

    try {
      const result = await DataStoreService.repairExpertFeedback();
      setMessage(
        lang === 'en'
          ? `Expert feedback types repaired successfully. Updated: ${result.stats.expertFeedback.updated}/${result.stats.expertFeedback.total} (${result.stats.expertFeedback.alreadyCorrect} already correct)`
          : `Types de commentaires d'experts réparés avec succès. Mis à jour: ${result.stats.expertFeedback.updated}/${result.stats.expertFeedback.total} (${result.stats.expertFeedback.alreadyCorrect} déjà corrects)`
      );
    } catch (error) {
      setMessage(
        lang === 'en'
          ? `Repair expert feedback failed: ${error.message}`
          : `Échec de la réparation des commentaires d'experts: ${error.message}`
      );
    } finally {
      setIsRepairingExpertFeedback(false);
    }
  };

  const handleMigratePublicFeedback = async () => {
    if (!window.confirm(
      lang === 'en'
        ? 'This will migrate all public feedback from expert feedback to the new public feedback collection. Are you sure you want to continue?'
        : 'Cela migrera tous les commentaires publics des commentaires d\'experts vers la nouvelle collection de commentaires publics. Êtes-vous sûr de vouloir continuer?'
    )) return;
    setIsMigratingPublicFeedback(true);
    setMessage('');
    try {
      const result = await DataStoreService.migratePublicFeedback();
      setMessage(
        lang === 'en'
          ? `Migration completed. Migrated ${result.migrated || 0} feedback documents.`
          : `Migration terminée. ${result.migrated || 0} commentaires migrés.`
      );
    } catch (error) {
      setMessage(
        lang === 'en'
          ? `Migration failed: ${error.message}`
          : `Échec de la migration: ${error.message}`
      );
    } finally {
      setIsMigratingPublicFeedback(false);
    }
  };

  const handleCreateIndexes = async () => {
    const confirmed = window.confirm(
      lang === 'en'
        ? 'This will ensure all Mongoose indexes exist in the database. Are you sure you want to continue?'
        : 'Cela garantira que tous les index Mongoose existent dans la base de données. Êtes-vous sûr de vouloir continuer?'
    );

    if (!confirmed) return;

    try {
      setIsCreatingIndexes(true);
      setMessage('');

      const result = await DataStoreService.createIndexes();

      const successCount = result.results.success ? result.results.success.length : 0;
      const failCount = result.results.failed ? result.results.failed.length : 0;

      setMessage(lang === 'en'
        ? `Indexes created/rebuilt successfully. Success: ${successCount}, Failed: ${failCount}`
        : `Index créés/reconstruits avec succès. Succès: ${successCount}, Échec: ${failCount}`
      );
    } catch (error) {
      setMessage(lang === 'en'
        ? `Create indexes failed: ${error.message}`
        : `Échec de la création des index: ${error.message}`
      );
      console.error('Create indexes error:', error);
    } finally {
      setIsCreatingIndexes(false);
    }
  };

  const handleBackfillSecrets = async () => {
    const confirmed = window.confirm(
      lang === 'en'
        ? 'This will generate 2FA and reset password secrets for any users who are missing them. Are you sure you want to continue?'
        : 'Cela générera des secrets 2FA et de réinitialisation de mot de passe pour tous les utilisateurs qui en manquent. Êtes-vous sûr de vouloir continuer?'
    );

    if (!confirmed) return;

    try {
      setIsBackfillingSecrets(true);
      setMessage('');

      const result = await DataStoreService.backfillUserSecrets();

      setMessage(lang === 'en'
        ? `Backfill complete. Updated users: ${result.updatedCount}`
        : `Remplissage terminé. Utilisateurs mis à jour: ${result.updatedCount}`
      );
    } catch (error) {
      setMessage(lang === 'en'
        ? `Backfill secrets failed: ${error.message}`
        : `Échec du remplissage des secrets: ${error.message}`
      );
      console.error('Backfill secrets error:', error);
    } finally {
      setIsBackfillingSecrets(false);
    }
  };

  return (
    <GcdsContainer size="xl" centered>
      <GcdsHeading tag="h1">Database Management</GcdsHeading>
      <nav className="mb-400">
        <GcdsLink href={`/${lang}/admin`}>
          {t('common.backToAdmin', 'Back to Admin')}
        </GcdsLink>
      </nav>
      {/* Table counts display */}
      <div style={{ marginBottom: 24 }}>
        <GcdsHeading tag="h2">{lang === 'en' ? 'Table Record Counts' : 'Nombre d\'enregistrements par table'}</GcdsHeading>
        {countsError && <div style={{ color: 'red' }}>{countsError}</div>}
        {tableCounts ? (
          <table style={{ margin: '12px 0', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingRight: 16 }}>{lang === 'en' ? 'Table' : 'Table'}</th>
                <th style={{ textAlign: 'right' }}>{lang === 'en' ? 'Count' : 'Nombre'}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(tableCounts).map(([table, count]) => (
                <tr key={table}>
                  <td style={{ paddingRight: 16 }}>{table}</td>
                  <td style={{ textAlign: 'right' }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !countsError && <div>{lang === 'en' ? 'Loading table counts...' : 'Chargement...'}</div>
        )}
      </div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <label>
          Table:&nbsp;
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
        <label>Start date:&nbsp;
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </label>
        <label>End date:&nbsp;
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </label>
        <label>Limit:&nbsp;
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
          {isExporting ? 'Exporting...' : 'Export Database'}
        </GcdsButton>
      </div>
      {/* Integrity checks: orphan and parent-invalid-child counts */}
      <div className="mb-400">
        <GcdsHeading tag="h2">Integrity Checks</GcdsHeading>
        <GcdsText>
          Run read-only checks to find orphaned documents and parent records that reference missing children.
        </GcdsText>
        <details open className="mb-200" style={{ padding: 12, border: '1px solid #e6e6e6' }}>
          <summary style={{ cursor: 'pointer', fontWeight: '600' }}>Core orphan & parent-reference checks</summary>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { id: 'orphanCitations', label: 'Orphaned Citations (not referenced by any Answer)' },
              { id: 'orphanTools', label: 'Orphaned Tools (not referenced by any Answer)' },
              { id: 'orphanAnswers', label: 'Orphaned Answers (not referenced by any Interaction or Embedding)' },
              { id: 'orphanQuestions', label: 'Orphaned Questions (not referenced by any Interaction or Embedding)' },
              { id: 'orphanInteractions', label: 'Orphaned Interactions (not referenced by any Chat)' },
              { id: 'interactionMissingChildren', label: 'Interactions referencing missing children (question/answer/feedback/context/eval)' },
              { id: 'embeddingsMissingRefs', label: 'Embeddings with missing Chat/Interaction/Question/Answer refs' },
              { id: 'sentenceEmbeddingOrphans', label: 'Sentence embeddings with missing parent Embedding' },
              { id: 'chatInvalidInteractions', label: 'Chats with invalid interaction references' },
              { id: 'answerInvalidTools', label: 'Answers with invalid tool references' },
              { id: 'evalInvalidInteraction', label: 'Evals referencing missing Interactions' },
              { id: 'duplicateKeys', label: 'Duplicate Keys (Index Violations)' }
            ].map(check => (
              <div key={check.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>{check.label}</div>
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
                  {checksRunning[check.id] ? 'Running...' : 'Run check'}
                </GcdsButton>
                <div style={{ minWidth: 220, textAlign: 'right' }}>
                  {checksResults[check.id] ? (
                    <div style={{ fontSize: 13 }}>
                      Count: <strong>{checksResults[check.id].count}</strong>
                      {checksResults[check.id].breakdown ? (
                        <div style={{ marginTop: 6, textAlign: 'right' }}>
                          <div style={{ fontSize: 12 }}>Missing — Chat: <strong>{checksResults[check.id].breakdown.missingChat}</strong>, Interaction: <strong>{checksResults[check.id].breakdown.missingInteraction}</strong>, Question: <strong>{checksResults[check.id].breakdown.missingQuestion}</strong>, Answer: <strong>{checksResults[check.id].breakdown.missingAnswer}</strong></div>
                          {checksResults[check.id].samples && checksResults[check.id].samples.length ? (
                            <div style={{ marginTop: 6 }}>
                              Samples: {checksResults[check.id].samples.slice(0, 5).map(s => (s._id || s)).join(', ')}
                            </div>
                          ) : null}
                        </div>
                      ) : checksResults[check.id].samples && checksResults[check.id].samples.length ? (
                        <div style={{ marginTop: 6 }}>
                          Samples: {checksResults[check.id].samples.slice(0, 5).map(s => (s._id || s)).join(', ')}
                        </div>
                      ) : null}
                    </div>
                  ) : <div style={{ fontSize: 13, color: '#666' }}>No results</div>}
                </div>
                {/* Add Remove Duplicates button only for duplicateKeys check */}
                {check.id === 'duplicateKeys' && (
                  <GcdsButton
                    onClick={async () => {
                      if (!window.confirm(
                        lang === 'en'
                          ? 'This will delete older duplicate records, keeping only the newest. Are you sure?'
                          : 'Cela supprimera les anciens enregistrements en double, ne gardant que les plus récents. Êtes-vous sûr?'
                      )) return;
                      try {
                        setIsRemovingDuplicates(true);
                        setMessage('');
                        const res = await AuthService.fetch(getApiUrl('db-integrity-checks?action=removeDuplicates'), {
                          method: 'DELETE'
                        });
                        const json = await res.json();
                        if (!res.ok) throw new Error(json.message || 'Remove duplicates failed');
                        setMessage(lang === 'en'
                          ? `Removed ${json.deletedCount} duplicate records`
                          : `Supprimé ${json.deletedCount} enregistrements en double`);
                        // Refresh the check results
                        setChecksResults(prev => ({ ...prev, duplicateKeys: null }));
                      } catch (err) {
                        setMessage(`Remove duplicates failed: ${err.message}`);
                      } finally {
                        setIsRemovingDuplicates(false);
                      }
                    }}
                    disabled={isRemovingDuplicates}
                    variant="danger"
                  >
                    {isRemovingDuplicates
                      ? (lang === 'en' ? 'Removing...' : 'Suppression...')
                      : (lang === 'en' ? 'Remove Duplicates' : 'Supprimer les doublons')}
                  </GcdsButton>
                )}
              </div>
            ))}
          </div>
        </details>
      </div >

      <div className="mb-400">
        <GcdsHeading tag="h2">{lang === 'en' ? 'Import Database' : 'Importer la base de données'}</GcdsHeading>
        <GcdsText>
          {lang === 'en'
            ? 'Restore the database from a backup file. Warning: This will replace all existing data.'
            : 'Restaurer la base de données à partir d\'un fichier de sauvegarde. Avertissement : Cela remplacera toutes les données existantes.'}
        </GcdsText>
        {/* Show import progress message above the import button */}
        {isImporting && message && (
          <div style={{ margin: '12px 0', color: 'blue' }}>{message}</div>
        )}
        <form onSubmit={handleImport} className="mb-200">
          <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <label>
              Chunk size (MB):&nbsp;
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
              Throttle (ms):&nbsp;
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
              Table (hold Ctrl/Cmd to multi-select):&nbsp;
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
                <option value="All">All</option>
                <option value="AllButLogs">All but logs</option>
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
            {isImporting
              ? (lang === 'en' ? 'Importing...' : 'Importation...')
              : (lang === 'en' ? 'Import Database' : 'Importer la base de données')}
          </GcdsButton>
        </form>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{lang === 'en' ? 'Create/Rebuild Indexes' : 'Créer/Reconstruire des index'}</GcdsHeading>
        <GcdsText>
          {lang === 'en'
            ? 'Ensure that all defined indexes exist in the database. This is useful if indexes were dropped or new schemas were deployed.'
            : 'Assurez-vous que tous les index définis existent dans la base de données. Cela est utile si les index ont été supprimés ou si de nouveaux schémas ont été déployés.'}
        </GcdsText>
        <GcdsButton
          onClick={handleCreateIndexes}
          disabled={isCreatingIndexes}
          variant="secondary"
          className="mb-200"
        >
          {isCreatingIndexes
            ? (lang === 'en' ? 'Creating Indexes...' : 'Création des index...')
            : (lang === 'en' ? 'Rebuild All Indexes' : 'Reconstruire tous les index')}
        </GcdsButton>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{lang === 'en' ? 'Backfill User Secrets' : 'Remplir les secrets des utilisateurs'}</GcdsHeading>
        <GcdsText>
          {lang === 'en'
            ? 'Generate 2FA and reset password secrets for existing users that are missing them.'
            : 'Générez des secrets 2FA et de réinitialisation de mot de passe pour les utilisateurs existants qui en sont dépourvus.'}
        </GcdsText>
        <GcdsButton
          onClick={handleBackfillSecrets}
          disabled={isBackfillingSecrets}
          variant="secondary"
          className="mb-200"
        >
          {isBackfillingSecrets
            ? (lang === 'en' ? 'Backfilling...' : 'Remplissage...')
            : (lang === 'en' ? 'Backfill Secrets' : 'Remplir les secrets')}
        </GcdsButton>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{lang === 'en' ? 'Drop All Indexes' : 'Supprimer tous les index'}</GcdsHeading>
        <GcdsText>
          {lang === 'en'
            ? 'Remove all database indexes. This can be useful to fix database performance issues. Indexes will be automatically rebuilt by MongoDB as needed.'
            : 'Supprimer tous les index de la base de données. Cela peut être utile pour résoudre les problèmes de performance de la base de données. Les index seront reconstruits automatiquement par MongoDB selon les besoins.'}
        </GcdsText>
        <GcdsButton
          onClick={handleDropIndexes}
          disabled={isDroppingIndexes}
          variant="danger"
          className="mb-200"
        >
          {isDroppingIndexes
            ? (lang === 'en' ? 'Dropping Indexes...' : 'Suppression des index...')
            : (lang === 'en' ? 'Drop All Indexes' : 'Supprimer tous les index')}
        </GcdsButton>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{lang === 'en' ? 'Delete System Logs' : 'Supprimer les journaux système'}</GcdsHeading>
        <GcdsText>
          {lang === 'en'
            ? 'Delete all logs where chatId = "system". This action cannot be undone.'
            : 'Supprimez tous les journaux où chatId = "system". Cette action est irréversible.'}
        </GcdsText>
        <GcdsButton
          onClick={handleDeleteSystemLogs}
          disabled={isDeletingSystemLogs}
          variant="danger"
          className="mb-200"
        >
          {isDeletingSystemLogs
            ? (lang === 'en' ? 'Deleting...' : 'Suppression...')
            : (lang === 'en' ? 'Delete System Logs' : 'Supprimer les journaux système')}        </GcdsButton>
      </div>

      <div className="mb-400">        <GcdsHeading tag="h2">{lang === 'en' ? 'Repair Tool Timestamps' : 'Réparer les horodatages des outils'}</GcdsHeading>
        <GcdsText>
          {lang === 'en'
            ? 'Add updatedAt timestamps to existing tool records without them. This will use the createdAt date if available, or the current date as fallback.'
            : 'Ajouter des horodatages updatedAt aux enregistrements d\'outils existants qui n\'en ont pas. Cela utilisera la date createdAt si disponible, ou la date actuelle comme solution de rechange.'}
        </GcdsText>
        <GcdsButton
          onClick={handleRepairTimestamps}
          disabled={isRepairingTimestamps}
          variant="secondary"
          className="mb-200"
        >          {isRepairingTimestamps
          ? (lang === 'en' ? 'Repairing...' : 'Réparation...')
          : (lang === 'en' ? 'Repair Tool Timestamps' : 'Réparer les horodatages des outils')}
        </GcdsButton>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{lang === 'en' ? 'Delete All Batches' : 'Supprimer tous les lots'}</GcdsHeading>
        <GcdsText>
          {lang === 'en'
            ? 'Delete all batch records and their associated batchItems. This is destructive and cannot be undone.'
            : 'Supprimer tous les enregistrements de lots et leurs batchItems associés. Cette action est destructive et irréversible.'}
        </GcdsText>
        <GcdsButton
          onClick={handleDeleteAllBatches}
          disabled={isDeletingAllBatches}
          variant="danger"
          className="mb-200"
        >
          {isDeletingAllBatches
            ? (lang === 'en' ? 'Deleting...' : 'Suppression...')
            : (lang === 'en' ? 'Delete All Batches' : 'Supprimer tous les lots')}
        </GcdsButton>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{lang === 'en' ? 'Repair Expert Feedback Types' : 'Réparer les types de commentaires d\'experts'}</GcdsHeading>
        <GcdsText>
          {lang === 'en'
            ? 'Set the "type" field to "expert" for expert feedback records that have missing or empty type fields. Records with "public" or "ai" types will be left unchanged.'
            : 'Définir le champ "type" sur "expert" pour les enregistrements de commentaires d\'experts qui ont des champs de type manquants ou vides. Les enregistrements avec les types "public" ou "ai" resteront inchangés.'}
        </GcdsText>
        <GcdsButton
          onClick={handleRepairExpertFeedback}
          disabled={isRepairingExpertFeedback}
          variant="secondary"
          className="mb-200"
        >
          {isRepairingExpertFeedback
            ? (lang === 'en' ? 'Repairing...' : 'Réparation...')
            : (lang === 'en' ? 'Repair Expert Feedback Types' : 'Réparer les types de commentaires d\'experts')}
        </GcdsButton>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{lang === 'en' ? 'Migrate Public Feedback' : 'Migrer les commentaires publics'}</GcdsHeading>
        <GcdsText>
          {lang === 'en'
            ? 'Move all public feedback from the expert feedback collection to the new public feedback collection.'
            : 'Déplacer tous les commentaires publics de la collection des commentaires d\'experts vers la nouvelle collection des commentaires publics.'}
        </GcdsText>
        <GcdsButton
          onClick={handleMigratePublicFeedback}
          disabled={isMigratingPublicFeedback}
          variant="secondary"
          className="mb-200"
        >
          {isMigratingPublicFeedback
            ? (lang === 'en' ? 'Migrating...' : 'Migration...')
            : (lang === 'en' ? 'Migrate Public Feedback' : 'Migrer les commentaires publics')}
        </GcdsButton>
      </div>

      {/* Show other messages (not import progress) at the bottom */}
      {(!isImporting && message) && <div style={{ marginTop: 16, color: 'blue' }}>{message}</div>}
    </GcdsContainer >
  );
};

export default DatabasePage;
