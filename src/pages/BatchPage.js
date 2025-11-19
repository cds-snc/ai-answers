import React, { useState } from 'react';
import { GcdsContainer, GcdsLink } from '@cdssnc/gcds-components-react';
import BatchUpload from '../components/batch/BatchUpload.js';
import BatchList from '../components/batch/BatchList.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import ExportService from '../services/ExportService.js';
import BatchService from '../services/BatchService.js';

const BatchPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { language } = usePageContext();
  const onDelete = async (batchId) => {
    await BatchService.deleteBatch(batchId);
  };

  // Simple refresh trigger to force BatchList to remount and refresh data
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  // Local UI state: track which batches the user has requested processing for
  // This is intentionally non-persistent so a page reload will show the Process
  // button again (the desired behavior).
  const [processingBatches, setProcessingBatches] = useState([]);
  const markProcessing = (id) => {
    if (!id) return;
    setProcessingBatches((prev) => (prev.includes(String(id)) ? prev : [...prev, String(id)]));
  };
  const unmarkProcessing = (id) => {
    if (!id) return;
    setProcessingBatches((prev) => prev.filter((x) => x !== String(id)));
  };

  const onExport = async (batchId, type) => {
    try {
      // Prefer server-provided chat logs for the batch
      const chats = await BatchService.retrieveBatchChats(batchId, 1000);
      const fileName = `${batchId}.${type === 'excel' ? 'xlsx' : 'csv'}`;
      if (Array.isArray(chats) && chats.length > 0) {
        ExportService.export(chats, fileName);
        return;
      }
    } catch (err) {
      console.error('Failed to fetch chats from BatchService.retrieveBatchChats, falling back to batch retrieve:', err);
    }


  };

  const onProcess = async (batchId, provider, workflowParam) => {
    // Mark locally so the UI immediately hides the Process button
    markProcessing(batchId);

    try {
      const persisted = await BatchService.retrieveBatch(batchId);
      const entries = persisted?.items || [];
      console.log(`[batch] onProcess: batchId=${batchId} items.length=${entries.length}`, entries);

      try {
        const { _id, ...batchDataWithoutId } = persisted;
        await BatchService.persistBatch({
          _id, // ensure server updates this document
          ...batchDataWithoutId,
          status: 'processing'
        });
      } catch (e) {
        console.error('Failed to update batch status to processing:', e);
      }

      BatchService.runBatch({
        entries,
        batchName: persisted?.name || batchId,
        selectedAI: persisted?.aiProvider || 'openai',
        lang: persisted?.pageLanguage || language || 'en',
        searchProvider: persisted?.searchProvider || '',
        // Prefer the workflow explicitly provided by the caller (restart), fall back to the persisted value
        workflow: workflowParam || persisted?.workflow || 'Default',
        batchId,
        concurrency: 8, 
      }).then(async ({ summary }) => {
        try {
          // Preserve batch metadata when updating final status, exclude items and _id
          const { _id, ...batchDataWithoutId } = persisted;
          const total = Number(summary?.total ?? entries.length ?? 0);
          const completed = Number(summary?.completed ?? 0);
          const failed = Number(summary?.failed ?? 0);
          const finished = completed + failed;
          const status = total > 0 && finished >= total ? 'processed' : 'processing';
          await BatchService.persistBatch({
            _id, // ensure server updates this document
            ...batchDataWithoutId,
            status
          });
        } catch (e) {
          console.error('Failed to update batch status after run:', e);
        }
        // Clear local processing marker when the run completes
        unmarkProcessing(batchId);
      }).catch((err) => console.error('Batch run failed:', err));
    } catch (err) {
      console.error('Error starting process:', err);
    }
  };

  const onCancel = async (batchId, provider) => {
    try {
      // Use cancelBatch which aborts client-side processing (provider is ignored)
      await BatchService.cancelBatch(batchId, provider);
      // Clear local processing marker
      unmarkProcessing(batchId);
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('batch.title', 'Batches')}</h1>

      <nav className="mb-400">
        <GcdsLink href={`/${lang}/admin`}>
          {t('admin.backToAdmin', t('common.backToAdmin', 'Back to Admin'))}
        </GcdsLink>
      </nav>


      <section id="evaluator" className="mb-600">
        <h2 className="mt-400 mb-400">{t('batch.sections.evaluator.title')}</h2>
        <BatchUpload lang={lang} onBatchSaved={triggerRefresh} />
      </section>

      <section id="running-evaluation" className="mb-600">
        <h2 className="mt-400 mb-400">{t('batch.sections.running.title')}</h2>
        <BatchList
          onProcess={onProcess}
          onCancel={onCancel}
          onDelete={onDelete}
          onExport={onExport}
          // Include 'uploaded' so freshly created batches appear in the running list
          batchStatus="uploaded,validating,failed,in_progress,finalizing,completed,expired"
          key={`running-${refreshKey}`}
          processingBatches={processingBatches}
          unmarkProcessing={unmarkProcessing}
          lang={lang}
        />
      </section>

      <section id="processed-evaluation" className="mb-600">
        <h2 className="mt-400 mb-400">{t('batch.sections.processed.title')}</h2>
        <BatchList
          onProcess={onProcess}
          onCancel={onCancel}
          onDelete={onDelete}
          onExport={onExport}
          batchStatus="processed"
          key={`processed-${refreshKey}`}
          processingBatches={processingBatches}
          unmarkProcessing={unmarkProcessing}
          lang={lang}
        />
      </section>
    </GcdsContainer>
  );
};

export default BatchPage;

