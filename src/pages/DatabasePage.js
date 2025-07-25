import React, { useRef, useState, useEffect } from 'react';
import { getApiUrl } from '../utils/apiToUrl.js';
import { GcdsContainer, GcdsHeading, GcdsText, GcdsButton } from '@cdssnc/gcds-components-react';
import AuthService from '../services/AuthService.js';
import DataStoreService from '../services/DataStoreService.js';
import streamSaver from 'streamsaver';

const DatabasePage = ({ lang }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('All');
  const [isImporting, setIsImporting] = useState(false);
  const [isDroppingIndexes, setIsDroppingIndexes] = useState(false);
  const [isDeletingSystemLogs, setIsDeletingSystemLogs] = useState(false);
  const [isRepairingTimestamps, setIsRepairingTimestamps] = useState(false);
  const [isRepairingExpertFeedback, setIsRepairingExpertFeedback] = useState(false);
  const [isMigratingPublicFeedback, setIsMigratingPublicFeedback] = useState(false);
  const [message, setMessage] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportLimit, setExportLimit] = useState(10000); // New state for export limit
  const [tableCounts, setTableCounts] = useState(null);
  const [countsError, setCountsError] = useState('');
  const fileInputRef = useRef(null);

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
        const collectionsRes = await fetch(getApiUrl('db-database-management'), {
          method: 'GET',
          headers: AuthService.getAuthHeader()
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
      if (selectedCollection && selectedCollection !== 'All') {
        collectionsToExport = [selectedCollection];
      }
      if (!collectionsToExport || !Array.isArray(collectionsToExport) || collectionsToExport.length === 0) {
        throw new Error('No collections found');
      }

      // Step 2: Stream each collection as it is fetched (JSONL format)
      const filename = `database-backup-${selectedCollection && selectedCollection !== 'All' ? selectedCollection + '-' : ''}${new Date().toISOString()}.jsonl`;
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
              const res = await fetch(url, { headers: AuthService.getAuthHeader(), signal: controller.signal });
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
    let lineBuffer = '';
    let accumulatedStats = { inserted: 0, failed: 0 };

    try {
      const chunkSize = 2 * 1024 * 1024; 
      const totalChunks = Math.ceil(file.size / chunkSize);
      const fileName = file.name;
      let lineBuffer = '';
      let chunkIndex = 0;
      let offset = 0;
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
          const response = await fetch(getApiUrl('db-database-management'), {
            method: 'POST',
            headers: {
              ...AuthService.getAuthHeader(),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chunkIndex,
              totalChunks, // This is still the total number of file chunks, not payload chunks
              fileName,
              chunkPayload: payload
            }),
          });
          if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(`Server error on chunk ${chunkIndex + 1}: ${errorResult.message || response.statusText}`);
          }
          const result = await response.json();
          if (result.stats) {
            accumulatedStats.inserted += result.stats.inserted;
            accumulatedStats.failed += result.stats.failed;
          }
          setMessage(`Processed chunk ${chunkIndex + 1} of ${totalChunks}. Current totals - Inserted: ${accumulatedStats.inserted}, Failed: ${accumulatedStats.failed}`);
        }
        offset = end;
        chunkIndex++;
      }
      // Send any remaining buffered line as the last chunk
      if (lineBuffer.trim().length > 0) {
        const response = await fetch(getApiUrl('db-database-management'), {
          method: 'POST',
          headers: {
            ...AuthService.getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chunkIndex,
            totalChunks,
            fileName,
            chunkPayload: lineBuffer
          }),
        });
        if (!response.ok) {
          const errorResult = await response.json();
          throw new Error(`Server error on chunk ${chunkIndex + 1}: ${errorResult.message || response.statusText}`);
        }
        const result = await response.json();
        if (result.stats) {
          accumulatedStats.inserted += result.stats.inserted;
          accumulatedStats.failed += result.stats.failed;
        }
        setMessage(`Processed chunk ${chunkIndex + 1} of ${totalChunks}. Current totals - Inserted: ${accumulatedStats.inserted}, Failed: ${accumulatedStats.failed}`);
      }

      setMessage(`Database import completed. Total Inserted: ${accumulatedStats.inserted}, Total Failed: ${accumulatedStats.failed}`);
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

      const response = await fetch(getApiUrl('db-database-management'), {
        method: 'DELETE',
        headers: AuthService.getAuthHeader()
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
      const response = await fetch(getApiUrl('db-delete-system-logs'), {
        method: 'DELETE',
        headers: AuthService.getAuthHeader(),
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
      );    } finally {
      setIsDeletingSystemLogs(false);
    }
  };

  const handleRepairTimestamps = async () => {    if (!window.confirm(
      lang === 'en'
        ? 'This will add updatedAt timestamps to existing tool records without them. Are you sure you want to continue?'
        : 'Cela ajoutera des horodatages updatedAt aux enregistrements d\'outils existants qui n\'en ont pas. Êtes-vous sûr de vouloir continuer?'
    )) return;
    
    setIsRepairingTimestamps(true);
    setMessage('');
    
    try {      const result = await DataStoreService.repairTimestamps();
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

  return (
    <GcdsContainer  size="xl" centered>
      <GcdsHeading tag="h1">Database Management</GcdsHeading>
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
    </GcdsContainer>
  );
};

export default DatabasePage;