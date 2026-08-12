import React, { useEffect, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsButton, GcdsLink, GcdsDetails } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import DataStoreService from '../services/DataStoreService.js';
import VectorService from '../services/VectorService.js';
import SimilarChatsDashboard from '../components/admin/SimilarChatsDashboard.js';
import { formatDecimal, formatNumber } from '../utils/numberFormat.js';
import StatusMessage from '../components/admin/StatusMessage.js';

const ACTIVE_METADATA_JOB_STATUSES = new Set(['queued', 'running', 'stopping']);

const metadataProgressFromJob = (job) => job ? ({
  jobId: job.id,
  status: job.status,
  processed: job.processed || 0,
  updated: job.updated || 0,
  cleared: job.cleared || 0,
  skipped: job.skipped || 0,
  remaining: null,
  hasMore: ACTIVE_METADATA_JOB_STATUSES.has(job.status),
  lastProcessedId: job.lastProcessedId,
  phase: job.phase,
  cursorSource: job.cursorSource,
  delayMs: job.delayMs || 0,
  error: job.error || null,
}) : null;

const getDocdb8ProbeDefinitions = (t) => ([
  {
    key: 'ann_all_then_feedback_post_filter',
    label: t('vector.docdb8Capability.probes.annAllThenFeedbackPostFilter'),
  },
  {
    key: 'exact_after_feedback_lookup_match',
    label: t('vector.docdb8Capability.probes.exactAfterFeedbackLookupMatch'),
  },
  {
    key: 'exact_after_denormalized_match',
    label: t('vector.docdb8Capability.probes.exactAfterDenormalizedMatch'),
  },
  {
    key: 'ann_feedback_only_collection',
    label: t('vector.docdb8Capability.probes.annFeedbackOnlyCollection'),
  },
  {
    key: 'node_bruteforce_feedback_subset',
    label: t('vector.docdb8Capability.probes.nodeBruteforceFeedbackSubset'),
  },
]);

const formatDocdb8ScoreRange = (scoreSummary, lang, t) => {
  if (!scoreSummary?.hasNumericScores) {
    return t('vector.docdb8Capability.notAvailable');
  }
  return t('vector.docdb8Capability.scoreRange')
    .replace('{min}', formatDecimal(scoreSummary.minScore, lang, 3))
    .replace('{max}', formatDecimal(scoreSummary.maxScore, lang, 3));
};

const VectorPage = ({ lang = 'en' }) => {
  const { language } = usePageContext();
  const activeLang = lang || language;
  const { t } = useTranslations(activeLang);
  const fmtN = (n) => formatNumber(n, activeLang);
  const [vectorStats, setVectorStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [docdb8CapabilityResults, setDocdb8CapabilityResults] = useState({});
  const [docdb8CapabilityLoadingProbe, setDocdb8CapabilityLoadingProbe] = useState(null);
  const [docdb8CapabilityErrors, setDocdb8CapabilityErrors] = useState({});

  // Embedding functionality state
  const [embeddingProgress, setEmbeddingProgress] = useState(null);
  const [isAutoProcessingEmbeddings, setIsAutoProcessingEmbeddings] = useState(false);
  const [isRequestInProgress, setIsRequestInProgress] = useState(false);
  const [isRegeneratingEmbeddings, setIsRegeneratingEmbeddings] = useState(false);
  const [provider, setProvider] = useState('openai');
  const [metadataProgress, setMetadataProgress] = useState(null);
  const [metadataDelaySecondsInput, setMetadataDelaySecondsInput] = useState('5');
  const [metadataBatchRecords, setMetadataBatchRecords] = useState([]);
  const [isBackfillingMetadata, setIsBackfillingMetadata] = useState(false);
  const [stopMetadataBackfill, setStopMetadataBackfill] = useState(false);
  const [metadataLookupChatId, setMetadataLookupChatId] = useState('');
  const [metadataLookupResult, setMetadataLookupResult] = useState(null);
  const [metadataLookupLoading, setMetadataLookupLoading] = useState(false);
  const [metadataLookupError, setMetadataLookupError] = useState(null);
  const [metadataStatus, setMetadataStatus] = useState(null);
  const [metadataStatusLoading, setMetadataStatusLoading] = useState(false);
  const [metadataStatusError, setMetadataStatusError] = useState(null);
  // WCAG 2.2.2 (Pause, Stop, Hide): this poll only changes what's on screen
  // while a backfill job is active (queued/running/stopping) — when
  // `!job`, below returns before touching state, so an idle page is a
  // visual no-op. The "Stop backfill" button already halts the job, which
  // is what stops the auto-updating content, so no separate pause control
  // is needed here (unlike BatchList/SessionPage, which refresh
  // unconditionally regardless of any admin action).
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const { job } = await VectorService.getMetadataBackfillJob();
        if (cancelled || !job) return;
        setMetadataProgress(metadataProgressFromJob(job));
        setMetadataBatchRecords(job.latestBatchRecords || []);
        setIsBackfillingMetadata(ACTIVE_METADATA_JOB_STATUSES.has(job.status));
        setStopMetadataBackfill(job.status === 'stopped');
        if (ACTIVE_METADATA_JOB_STATUSES.has(job.status)) {
          setMetadataDelaySecondsInput(String((job.delayMs || 0) / 1000));
        }
      } catch (err) {
        if (!cancelled) console.error('Error polling embedding metadata backfill job:', err);
      }
    };
    poll();
    const pollTimer = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
    };
  }, []);

  // Fetch vector stats using VectorService
  const fetchVectorStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await VectorService.getStats();
      setVectorStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Embedding functionality handlers
  const handleGenerateEmbeddings = async (isAutoProcess = false, regenerateAll = false, lastId = null) => {
    if (isRequestInProgress) {
      return; // Skip if a request is already in progress
    }

    try {
      setIsRequestInProgress(true);
      if (!isAutoProcess) {
        setIsAutoProcessingEmbeddings(true);
      }

      const result = await DataStoreService.generateEmbeddings({ lastProcessedId: lastId, regenerateAll, provider });
      // Only update progress if we got a valid response
      if (typeof result.remaining === 'number') {
        setEmbeddingProgress({
          remaining: result.remaining,
          hasMore: result.hasMore === true,
          lastProcessedId: result.lastProcessedId
        });
        // Only continue processing if there are actually items remaining
        if (result.remaining > 0) {
          handleGenerateEmbeddings(true, false, result.lastProcessedId);
        } else {
          setIsAutoProcessingEmbeddings(false);
          if (!isAutoProcess) {
            alert(t('vector.allEmbeddingsGenerated'));
          }
        }
      } else {
        // If we don't get a valid remaining count, stop processing
        setIsAutoProcessingEmbeddings(false);
        throw new Error('Invalid response format from server');
      }
    } catch (generateError) {
      console.error('Error generating embeddings:', generateError);
      if (!isAutoProcess) {
        alert(t('vector.generateEmbeddingsFailed'));
      }
      setIsAutoProcessingEmbeddings(false);
    } finally {
      setIsRequestInProgress(false);
    }
  };

  const handleRegenerateEmbeddings = () => {
    const confirmed = window.confirm(t('vector.regenerateConfirm'));
    if (confirmed) {
      setIsRegeneratingEmbeddings(true);
      handleGenerateEmbeddings(false, true, null);
      setIsRegeneratingEmbeddings(false);
    }
  };

  // Trigger vector index creation and reinitialize vector service using VectorService
  const handleCreateVectorIndex = async () => {
    setLoading(true);
    setError(null);
    try {
      await VectorService.reinitialize();
      alert(t('vector.indexCreatedSuccess'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBackfillMetadata = async ({
    resumeJobId = null,
    restartJobId = null,
  } = {}) => {
    if (isBackfillingMetadata) return;
    const delaySeconds = Number(metadataDelaySecondsInput);
    if (!Number.isFinite(delaySeconds) || delaySeconds < 0 || delaySeconds > 300) {
      alert(t('vector.metadataDelayInvalid'));
      return;
    }

    setIsBackfillingMetadata(true);
    setStopMetadataBackfill(false);
    try {
      const { job } = await VectorService.startMetadataBackfillJob({
        phase: 'missing',
        resumeJobId,
        restartJobId,
        delaySeconds,
      });
      setMetadataProgress(metadataProgressFromJob(job));
      setMetadataBatchRecords(job?.latestBatchRecords || []);
    } catch (err) {
      console.error('Error backfilling embedding metadata:', err);
      alert(t('vector.metadataBackfillFailed'));
      setIsBackfillingMetadata(false);
    }
  };

  const handleStopMetadataBackfill = async () => {
    try {
      const { job } = await VectorService.stopMetadataBackfillJob(metadataProgress?.jobId);
      if (job) {
        setMetadataProgress(metadataProgressFromJob(job));
        setIsBackfillingMetadata(ACTIVE_METADATA_JOB_STATUSES.has(job.status));
      }
      setStopMetadataBackfill(true);
    } catch (err) {
      console.error('Error stopping embedding metadata backfill:', err);
      alert(t('vector.metadataBackfillFailed'));
    }
  };

  const handleBackfillEmptyMetadata = () => {
    setMetadataProgress(null);
    setMetadataBatchRecords([]);
    handleBackfillMetadata();
  };

  const handleClearMetadata = async () => {
    if (isBackfillingMetadata) return;
    try {
      await VectorService.clearMetadata();
      setMetadataProgress(null);
      setMetadataBatchRecords([]);
      setMetadataStatus(null);
      alert(t('vector.metadataClearSuccess'));
    } catch (err) {
      console.error('Error clearing embedding metadata:', err);
      alert(t('vector.metadataClearFailed'));
    }
  };

  const handleResumeMetadataBackfill = () => {
    handleBackfillMetadata({ resumeJobId: metadataProgress?.jobId || null });
  };

  const handleRestartMetadataBackfill = () => {
    setMetadataBatchRecords([]);
    handleBackfillMetadata({ restartJobId: metadataProgress?.jobId || null });
  };

  const handleRunDocdb8CapabilityTest = async (probe) => {
    setDocdb8CapabilityLoadingProbe(probe);
    setDocdb8CapabilityErrors((current) => ({
      ...current,
      [probe]: null,
    }));
    try {
      const data = await VectorService.runDocdb8CapabilityTest(probe);
      setDocdb8CapabilityResults((current) => ({
        ...current,
        [probe]: data,
      }));
    } catch (err) {
      setDocdb8CapabilityErrors((current) => ({
        ...current,
        [probe]: err.message,
      }));
    } finally {
      setDocdb8CapabilityLoadingProbe(null);
    }
  };

  const handleMetadataLookup = async () => {
    const trimmedChatId = metadataLookupChatId.trim();
    if (!trimmedChatId) {
      alert(t('vector.metadataLookup.chatIdRequired'));
      return;
    }
    setMetadataLookupLoading(true);
    setMetadataLookupError(null);
    try {
      const result = await VectorService.lookupMetadata(trimmedChatId);
      setMetadataLookupResult(result);
    } catch (err) {
      console.error('Error looking up embedding metadata:', err);
      setMetadataLookupResult(null);
      setMetadataLookupError(t('vector.metadataLookup.failed'));
    } finally {
      setMetadataLookupLoading(false);
    }
  };

  const handleMetadataStatus = async () => {
    setMetadataStatusLoading(true);
    setMetadataStatusError(null);
    try {
      setMetadataStatus(await VectorService.getMetadataStatus());
    } catch (err) {
      console.error('Error checking embedding metadata status:', err);
      setMetadataStatus(null);
      setMetadataStatusError(t('vector.metadataStatus.failed'));
    } finally {
      setMetadataStatusLoading(false);
    }
  };

  const docdb8ProbeDefinitions = getDocdb8ProbeDefinitions(t);
  const hasMetadataBackfillResume = ['stopped', 'failed'].includes(metadataProgress?.status)
    && Boolean(metadataProgress?.jobId);
  const hasMetadataBackfillRestart = ['stopped', 'failed', 'completed'].includes(metadataProgress?.status)
    && Boolean(metadataProgress?.jobId);
  const loadedDocdb8Results = docdb8ProbeDefinitions
    .map(({ key, label }) => ({
      key,
      label,
      result: docdb8CapabilityResults[key],
      error: docdb8CapabilityErrors[key],
    }))
    .filter((entry) => entry.result || entry.error);

  return (
    <GcdsContainer layout="page">
      <h1>{t('vector.title')}</h1>
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>
            {t('common.backToAdmin')}
          </GcdsLink>
        </GcdsText>
      </nav>
      <div className="mb-400">
        <h2>{t('vector.indexManagement')}</h2>
        <GcdsText>
          {t('vector.manageDescription')}
        </GcdsText>
        <div className="button-group">
          <GcdsButton onClick={fetchVectorStats} disabled={loading} className="mb-200 mr-200">
            {loading ? t('vector.loading') : t('vector.fetchStats')}
          </GcdsButton>
          <GcdsButton onClick={handleCreateVectorIndex} disabled={loading} buttonRole="primary" className="mb-200 mr-200">
            {t('vector.reinitializeIndex')}
          </GcdsButton>
        </div>
        <StatusMessage message={error} isError tag="div" className="error-message" />
        {vectorStats && (
          <div className="mb-200">
            <pre>{JSON.stringify(vectorStats, null, 2)}</pre>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.docdb8Capability.title')}</h2>
        <GcdsText>
          {t('vector.docdb8Capability.description')}
        </GcdsText>
        <div className="button-group">
          {docdb8ProbeDefinitions.map((probe) => (
            <GcdsButton
              key={probe.key}
              onClick={() => handleRunDocdb8CapabilityTest(probe.key)}
              disabled={docdb8CapabilityLoadingProbe === probe.key}
              className="mb-200 mr-200"
            >
              {docdb8CapabilityLoadingProbe === probe.key ? t('vector.docdb8Capability.running') : probe.label}
            </GcdsButton>
          ))}
        </div>
        <GcdsText>
          {t('vector.docdb8Capability.singleProbeDescription')}
        </GcdsText>
        {loadedDocdb8Results.length > 0 && (
          <div className="mb-400">
            <table>
              <thead>
                <tr>
                  <th>{t('vector.docdb8Capability.table.capability')}</th>
                  <th>{t('vector.docdb8Capability.table.status')}</th>
                  <th>{t('vector.docdb8Capability.table.resultCount')}</th>
                  <th>{t('vector.docdb8Capability.table.preFilter')}</th>
                  <th>{t('vector.docdb8Capability.table.score')}</th>
                  <th>{t('vector.docdb8Capability.table.duration')}</th>
                  <th>{t('vector.docdb8Capability.table.error')}</th>
                </tr>
              </thead>
              <tbody>
                {loadedDocdb8Results.map(({ key, label, result, error: probeError }) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{result?.test?.supported ? t('vector.docdb8Capability.pass') : t('vector.docdb8Capability.fail')}</td>
                    <td>{fmtN(result?.test?.resultCount)}</td>
                    <td>{result?.test?.metadata?.candidateReductionBeforeVectorSearch ? t('vector.docdb8Capability.yes') : t('vector.docdb8Capability.no')}</td>
                    <td>{formatDocdb8ScoreRange(result?.test?.scoreSummary, activeLang, t)}</td>
                    <td>{t('vector.docdb8Capability.durationMs').replace('{ms}', fmtN(result?.test?.durationMs))}</td>
                    <td>{probeError || result?.test?.error?.message || t('vector.docdb8Capability.noError')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <GcdsDetails detailsTitle={t('vector.docdb8Capability.rawResults')} className="mb-400" tabIndex="0">
              <pre>{JSON.stringify(docdb8CapabilityResults, null, 2)}</pre>
            </GcdsDetails>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.embeddingManagement')}</h2>
        <GcdsText>
          {t('vector.embeddingDescription')}
        </GcdsText>
        <div className="button-group">
          <select value={provider} onChange={e => setProvider(e.target.value)} className="mr-200" aria-label={t('vector.embeddingProviderLabel')}>
            <option value="openai">OpenAI</option>
            <option value="azure">Azure OpenAI</option>
          </select>
          <GcdsButton
            onClick={() => handleGenerateEmbeddings(false)}
            disabled={embeddingProgress?.loading || isAutoProcessingEmbeddings}
            className="mb-200 mr-200"
          >
            {embeddingProgress?.loading && !isAutoProcessingEmbeddings ? t('vector.processing') : t('vector.generateEmbeddings')}
          </GcdsButton>
          <GcdsButton
            onClick={handleRegenerateEmbeddings}
            disabled={embeddingProgress?.loading || isAutoProcessingEmbeddings}
            buttonRole="danger"
            className="mb-200 mr-200"
          >
            {isRegeneratingEmbeddings ? t('vector.regenerating') : t('vector.regenerateEmbeddings')}
          </GcdsButton>
        </div>
        {embeddingProgress && (
          <div className="mb-200">
            <p>
              {embeddingProgress.remaining !== undefined && (
                <span> {t('vector.remaining')}: {fmtN(embeddingProgress.remaining)}</span>
              )}
              {isAutoProcessingEmbeddings && (
                <span> <strong>{t('vector.autoProcessingActive')}</strong></span>
              )}
            </p>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.metadataBackfillTitle')}</h2>
        <GcdsText>
          {t('vector.metadataBackfillDescription')}
        </GcdsText>
        <div className="mb-200">
          <label htmlFor="metadata-backfill-delay-seconds" className="display-block mb-100">
            {t('vector.metadataDelayLabel')}
          </label>
          <input
            id="metadata-backfill-delay-seconds"
            type="number"
            min="0"
            max="300"
            step="1"
            inputMode="numeric"
            value={metadataDelaySecondsInput}
            onChange={(e) => setMetadataDelaySecondsInput(e.target.value)}
            disabled={isBackfillingMetadata}
            className="mr-200"
          />
          <GcdsText>
            {t('vector.metadataDelayHelp')}
          </GcdsText>
        </div>
        <div className="button-group">
          <GcdsButton
            onClick={hasMetadataBackfillResume ? handleResumeMetadataBackfill : handleBackfillEmptyMetadata}
            disabled={isBackfillingMetadata}
            className="mb-200 mr-200"
          >
            {hasMetadataBackfillResume ? t('vector.resumeMetadataBackfill') : t('vector.backfillEmptyMetadata')}
          </GcdsButton>
          {hasMetadataBackfillRestart && (
            <GcdsButton
              onClick={handleRestartMetadataBackfill}
              disabled={isBackfillingMetadata}
              buttonRole="secondary"
              className="mb-200 mr-200"
            >
              {t('vector.restartMetadataBackfill')}
            </GcdsButton>
          )}
          <GcdsButton onClick={handleClearMetadata} disabled={isBackfillingMetadata} buttonRole="secondary" className="mb-200 mr-200">
            {t('vector.clearMetadata')}
          </GcdsButton>
          <GcdsButton
            onClick={handleStopMetadataBackfill}
            disabled={!isBackfillingMetadata}
            buttonRole="secondary"
            className="mb-200 mr-200"
          >
            {t('vector.stopMetadataBackfill')}
          </GcdsButton>
        </div>
        {metadataProgress && (
          <div className="mb-200">
            <p>
              <span>{t('vector.metadataProcessed')}: {fmtN(metadataProgress.processed)}</span>
              {typeof metadataProgress.remaining === 'number' && (
                <span> {t('vector.remaining')}: {fmtN(metadataProgress.remaining)}</span>
              )}
              {metadataProgress?.lastProcessedId && (
                <span>
                  {' '}
                  {t('vector.metadataResumeFromId').replace('{id}', metadataProgress.lastProcessedId)}
                </span>
              )}
              {isBackfillingMetadata && (
                <span> <strong>{t('vector.autoProcessingActive')}</strong></span>
              )}
              {stopMetadataBackfill && !isBackfillingMetadata && (
                <span> <strong>{t('vector.metadataBackfillStopped')}</strong></span>
              )}
              {metadataProgress.status === 'failed' && (
                <span> <strong>{t('vector.metadataBackfillFailed')}</strong></span>
              )}
            </p>
          </div>
        )}
        {metadataBatchRecords.length > 0 && (
          <div className="mb-400">
            <h3>{t('vector.metadataBatchResultsTitle')}</h3>
            <GcdsText>{t('vector.metadataBatchResultsDescription')}</GcdsText>
            <div className="mb-100">
              <strong>
                {(() => {
                  const updatedCount = metadataProgress?.updated ?? metadataBatchRecords.filter(r => r.action === 'updated').length;
                  const clearedCount = metadataProgress?.cleared ?? metadataBatchRecords.filter(r => r.action === 'cleared').length;
                  return t('vector.metadataBatchSummary')
                    .replace('{updated}', fmtN(updatedCount))
                    .replace('{cleared}', fmtN(clearedCount));
                })()}
              </strong>
            </div>
            <table>
              <thead>
                <tr>
                  <th>{t('vector.metadataBatchResults.columns.embeddingId')}</th>
                  <th>{t('vector.metadataBatchResults.columns.storedInteractionId')}</th>
                  <th>{t('vector.metadataBatchResults.columns.resolvedInteractionId')}</th>
                  <th>{t('vector.metadataBatchResults.columns.action')}</th>
                  <th>{t('vector.metadataBatchResults.columns.reason')}</th>
                  <th>{t('vector.metadataBatchResults.columns.feedbackType')}</th>
                  <th>{t('vector.metadataBatchResults.columns.pageLanguage')}</th>
                  <th>{t('vector.metadataBatchResults.columns.interactionLanguage')}</th>
                  <th>{t('vector.metadataBatchResults.columns.expertFeedbackId')}</th>
                  <th>{t('vector.metadataBatchResults.columns.totalScore')}</th>
                  <th>{t('vector.metadataBatchResults.columns.modifiedCount')}</th>
                </tr>
              </thead>
              <tbody>
                {metadataBatchRecords.map((record) => (
                  <tr key={record.embeddingId}>
                    <td>{record.embeddingId || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{record.storedInteractionId || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{record.resolvedInteractionId || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{t(`vector.metadataBatchResults.actions.${record.action || 'unknown'}`)}</td>
                    <td>{t(`vector.metadataBatchResults.reasons.${record.reason || 'none'}`)}</td>
                    <td>{record.feedbackType || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{record.metadata?.pageLanguage || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{record.metadata?.interactionLanguage || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{record.metadata?.expertFeedbackId || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{record.metadata?.expertFeedbackTotalScore ?? t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{fmtN(record.modifiedCount ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.metadataStatus.title')}</h2>
        <GcdsText>{t('vector.metadataStatus.description')}</GcdsText>
        <div className="mb-200">
          <GcdsButton onClick={handleMetadataStatus} disabled={metadataStatusLoading} className="mb-200 mr-200">
            {metadataStatusLoading ? t('vector.metadataStatus.loading') : t('vector.metadataStatus.check')}
          </GcdsButton>
        </div>
        <StatusMessage message={metadataStatusError} isError tag="div" className="error-message" />
        {metadataStatus && (
          <div className="mb-400">
            <p><strong>{metadataStatus.complete ? t('vector.metadataStatus.complete') : t('vector.metadataStatus.incomplete')}</strong></p>
            <table>
              <tbody>
                <tr><th>{t('vector.metadataStatus.totalEmbeddings')}</th><td>{fmtN(metadataStatus.totalEmbeddings)}</td></tr>
                <tr><th>{t('vector.metadataStatus.recordsRequiringMetadata')}</th><td>{fmtN(metadataStatus.recordsRequiringMetadata)}</td></tr>
                <tr><th>{t('vector.metadataStatus.recordsWithMetadata')}</th><td>{fmtN(metadataStatus.recordsWithMetadata)}</td></tr>
                <tr><th>{t('vector.metadataStatus.recordsMissingMetadata')}</th><td>{fmtN(metadataStatus.recordsMissingMetadata)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.metadataLookup.title')}</h2>
        <GcdsText>
          {t('vector.metadataLookup.description')}
        </GcdsText>
        <div className="mb-200">
          <label htmlFor="metadata-lookup-chat-id" className="display-block mb-100">
            {t('vector.metadataLookup.chatIdLabel')}
          </label>
          <input
            id="metadata-lookup-chat-id"
            type="text"
            value={metadataLookupChatId}
            onChange={(e) => setMetadataLookupChatId(e.target.value)}
            placeholder={t('vector.chatIdPlaceholder')}
            disabled={metadataLookupLoading}
            className="mr-200"
          />
          <GcdsButton
            onClick={handleMetadataLookup}
            disabled={metadataLookupLoading}
            className="mb-200 mr-200"
          >
            {metadataLookupLoading ? t('vector.metadataLookup.loading') : t('vector.metadataLookup.lookup')}
          </GcdsButton>
        </div>
        <StatusMessage message={metadataLookupError} isError tag="div" className="error-message" />
        {metadataLookupResult?.chat && (
          <div className="mb-400">
            <p>
              <span>{t('vector.metadataLookup.chatSummary.chatId')}: {metadataLookupResult.chat.chatId}</span>
              <span> {t('vector.metadataLookup.chatSummary.pageLanguage')}: {metadataLookupResult.chat.pageLanguage || t('vector.metadataBatchResults.emptyValue')}</span>
              <span> {t('vector.metadataLookup.chatSummary.interactions')}: {fmtN(metadataLookupResult.chat.interactionCount)}</span>
              <span> {t('vector.metadataLookup.chatSummary.embeddings')}: {fmtN(metadataLookupResult.chat.embeddingCount)}</span>
            </p>
            <table>
              <thead>
                <tr>
                  <th>{t('vector.metadataLookup.columns.row')}</th>
                  <th>{t('vector.metadataLookup.columns.status')}</th>
                  <th>{t('vector.metadataLookup.columns.interactionObjectId')}</th>
                  <th>{t('vector.metadataLookup.columns.interactionDisplayId')}</th>
                  <th>{t('vector.metadataLookup.columns.embeddingId')}</th>
                  <th>{t('vector.metadataLookup.columns.embeddingInteractionId')}</th>
                  <th>{t('vector.metadataLookup.columns.attachedExpertFeedbackId')}</th>
                  <th>{t('vector.metadataLookup.columns.metadataExpertFeedbackId')}</th>
                  <th>{t('vector.metadataLookup.columns.attachedScore')}</th>
                  <th>{t('vector.metadataLookup.columns.metadataScore')}</th>
                  <th>{t('vector.metadataLookup.columns.chatPageLanguage')}</th>
                  <th>{t('vector.metadataLookup.columns.metadataPageLanguage')}</th>
                  <th>{t('vector.metadataLookup.columns.interactionLanguage')}</th>
                  <th>{t('vector.metadataLookup.columns.metadataInteractionLanguage')}</th>
                  <th>{t('vector.metadataLookup.columns.neverStale')}</th>
                </tr>
              </thead>
              <tbody>
                {(metadataLookupResult.rows || []).map((row) => (
                  <tr key={`${row.interactionObjectId || 'interaction'}-${row.embeddingId || 'missing'}`}>
                    <td>{fmtN(row.rowNumber)}</td>
                    <td>{t(`vector.metadataLookup.statuses.${row.metadataStatus || 'unknown'}`)}</td>
                    <td>{row.interactionObjectId || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{row.interactionDisplayId || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{row.embeddingId || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{row.embeddingInteractionId || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{row.attachedExpertFeedbackId || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{row.metadataExpertFeedbackId || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{typeof row.attachedExpertFeedbackTotalScore === 'number' ? fmtN(row.attachedExpertFeedbackTotalScore) : t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{typeof row.metadataExpertFeedbackTotalScore === 'number' ? fmtN(row.metadataExpertFeedbackTotalScore) : t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{row.chatPageLanguage || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{row.metadataPageLanguage || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{row.interactionLanguage || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{row.metadataInteractionLanguage || t('vector.metadataBatchResults.emptyValue')}</td>
                    <td>{row.metadataExpertFeedbackNeverStale ? t('vector.docdb8Capability.yes') : t('vector.docdb8Capability.no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.similarChats')}</h2>
        <GcdsText>
          {t('vector.similarChatsDescription')}
        </GcdsText>

        <SimilarChatsDashboard lang={activeLang} />

      </div>
    </GcdsContainer>
  );
};

export default VectorPage;
