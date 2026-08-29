import React, { useState } from 'react';
import { GcdsContainer, GcdsLink } from '@gcds-core/components-react';
import BatchUpload from '../components/batch/BatchUpload.js';
import BatchList from '../components/batch/BatchList.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import { announce as announceSuccessRaw } from '../utils/liveAnnouncer.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import ExportService from '../services/ExportService.js';
import BatchService from '../services/BatchService.js';

const BatchPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { language } = usePageContext();

  // Action-outcome announcement: BatchList's per-row buttons hide themselves
  // immediately on click (see BatchList.js) with no other feedback, so this
  // is the only place delete/export/process/cancel results reach the user.
  //
  // Success stays sr-only: the table itself already shows the outcome to a
  // sighted user (the row disappears, moves lists, or its status/totals
  // update), so a floating visible box repeating that in words is
  // redundant. Errors stay visible: a failure isn't otherwise self-evident
  // (the row often just reverts to how it looked before), so it needs to
  // actually interrupt someone, not just be heard by screen reader users -
  // and it's scoped per section (`running`/`processed`) so the box renders
  // next to the table the failing row actually belongs to, not stranded in
  // one shared spot disconnected from both.
  const [errors, setErrors] = useState({ running: null, processed: null }); // { text } per section
  // Nonce is per-section too, not one shared counter - a shared nonce would
  // force *both* StatusMessages to remount (and therefore re-announce)
  // whenever either section's error changed, even the section whose
  // `errors.*` value didn't actually change - re-announcing a stale,
  // unrelated error just because the other list failed.
  const [errorNonces, setErrorNonces] = useState({ running: 0, processed: 0 });
  const setError = (section, text) => {
    setErrors((prev) => ({ ...prev, [section]: { text } }));
    // Forces a remount even when two failures in a row produce identical
    // text (e.g. two different rows both failing with the same generic
    // error) - see StatusMessage.js's own doc comment on `nonce` for why a
    // same-value update would otherwise be silently un-announced/unchanged.
    setErrorNonces((prev) => ({ ...prev, [section]: prev[section] + 1 }));
  };
  // Most of these outcomes can name the batch (BatchList.js passes its name
  // through from the row); falls back to the generic wording for the rare
  // case a name isn't available, same pattern as confirmDelete/
  // confirmDeleteNamed already established.
  const namedOrGeneric = (namedKey, genericKey, name) =>
    name ? t(namedKey).replace('{name}', () => name) : t(genericKey);

  // `section` is optional only because a couple of hypothetical future
  // callers might not have one - every actual call site below always
  // passes it, since every success here is scoped to one of the two
  // tables. Without this, a section's visible error box (set by an
  // earlier failed Process/Delete/Export/Cancel) would sit on screen
  // forever even after a later retry in that same section succeeds -
  // the old single-shared-statusMessage implementation didn't have this
  // gap, since every success overwrote the one shared state; splitting
  // errors per-section (see `errors` above) needs the success side to
  // clear its own section explicitly instead.
  const announceSuccess = (text, section) => {
    announceSuccessRaw(text);
    if (section) {
      setErrors((prev) => (prev[section] ? { ...prev, [section]: null } : prev));
    }
  };

  const onDelete = async (batchId, batchName, section) => {
    try {
      await BatchService.deleteBatch(batchId);
      announceSuccess(t('batch.list.actions.deleteSuccess'), section);
      return true;
    } catch (err) {
      console.error('Failed to delete batch:', err);
      setError(section, namedOrGeneric('batch.list.actions.deleteErrorNamed', 'batch.list.actions.deleteError', batchName));
      return false;
    }
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

  const onExport = async (batchId, type, batchName, section) => {
    try {
      // Prefer server-provided chat logs for the batch
      const chats = await BatchService.retrieveBatchChats(batchId, 1000);
      const fileName = `${batchId}.${type === 'excel' ? 'xlsx' : 'csv'}`;
      if (Array.isArray(chats) && chats.length > 0) {
        ExportService.export(chats, fileName);
        announceSuccess(t('batch.list.actions.exportSuccess'), section);
        return;
      }
      setError(section, namedOrGeneric('batch.list.actions.exportEmptyNamed', 'batch.list.actions.exportEmpty', batchName));
    } catch (err) {
      console.error('Failed to fetch chats from BatchService.retrieveBatchChats, falling back to batch retrieve:', err);
      setError(section, namedOrGeneric('batch.list.actions.exportErrorNamed', 'batch.list.actions.exportError', batchName));
    }
  };

  const onProcess = async (batchId, provider, workflowParam, batchName, section) => {
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
        selectedAI: persisted?.aiProvider || 'openai-gpt51',
        lang: persisted?.pageLanguage || language || 'en',
        searchProvider: persisted?.searchProvider || '',
        // Prefer the workflow explicitly provided by the caller (restart), fall back to the persisted value
        workflow: workflowParam || persisted?.workflow || 'Default',
        batchId,
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
        announceSuccess(t('batch.list.actions.processSuccess'), section);
      }).catch((err) => {
        console.error('Batch run failed:', err);
        unmarkProcessing(batchId);
        setError(section, namedOrGeneric('batch.list.actions.processErrorNamed', 'batch.list.actions.processError', batchName));
      });
    } catch (err) {
      console.error('Error starting process:', err);
      unmarkProcessing(batchId);
      setError(section, namedOrGeneric('batch.list.actions.processErrorNamed', 'batch.list.actions.processError', batchName));
    }
  };

  const onCancel = async (batchId, provider, batchName, section) => {
    try {
      // Use cancelBatch which aborts client-side processing (provider is ignored)
      await BatchService.cancelBatch(batchId, provider);
      // Clear local processing marker
      unmarkProcessing(batchId);
      announceSuccess(t('batch.list.actions.cancelSuccess'), section);
    } catch (err) {
      console.error('Cancel failed:', err);
      setError(section, namedOrGeneric('batch.list.actions.cancelErrorNamed', 'batch.list.actions.cancelError', batchName));
    }
  };

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">{t('batch.title')}</h1>

      {/* TODO: this aria-label is hand-copied onto every admin page's own <nav> —
          worth centralizing into a shared local nav/breadcrumb component so new
          pages can't reintroduce the unlabeled-nav gap this fixes. */}
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsLink href={`/${lang}/admin`}>
          {t('common.backToAdmin')}
        </GcdsLink>
      </nav>

      <section id="evaluator" className="mb-200">
        <h2 className="mt-400 mb-400">{t('batch.sections.evaluator.title')}</h2>
        <BatchUpload lang={lang} onBatchSaved={triggerRefresh} />
      </section>

      <section className="mb-600">
        <h2 className="mt-400 mb-400">{t('batch.sections.running.title')}</h2>
        {/* Scoped to this table specifically - delete/process/cancel/export
            failures from a row here shouldn't render above the *other*
            table instead. */}
        <StatusMessage
          variant={errors.running ? 'error' : undefined}
          message={errors.running?.text}
          nonce={errorNonces.running}
          className="mb-400"
        />
        <BatchList
          onProcess={(id, provider, workflow, name) => onProcess(id, provider, workflow, name, 'running')}
          onCancel={(id, provider, name) => onCancel(id, provider, name, 'running')}
          onDelete={(id, name) => onDelete(id, name, 'running')}
          onExport={(id, type, name) => onExport(id, type, name, 'running')}
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
        <p className="mb-400">{t('batch.sections.processed.description')}</p>
        <StatusMessage
          variant={errors.processed ? 'error' : undefined}
          message={errors.processed?.text}
          nonce={errorNonces.processed}
          className="mb-400"
        />
        <BatchList
          onProcess={(id, provider, workflow, name) => onProcess(id, provider, workflow, name, 'processed')}
          onCancel={(id, provider, name) => onCancel(id, provider, name, 'processed')}
          onDelete={(id, name) => onDelete(id, name, 'processed')}
          onExport={(id, type, name) => onExport(id, type, name, 'processed')}
          batchStatus="processed"
          key={`processed-${refreshKey}`}
          processingBatches={processingBatches}
          unmarkProcessing={unmarkProcessing}
          lang={lang}
          announceCompletions
        />
      </section>
    </GcdsContainer>
  );
};

export default BatchPage;
