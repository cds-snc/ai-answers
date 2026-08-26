import React, { useEffect, useRef, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsButton, GcdsLink, GcdsDetails } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import DataStoreService from '../services/DataStoreService.js';
import VectorService from '../services/VectorService.js';
import SimilarChatsDashboard from '../components/admin/SimilarChatsDashboard.js';
import { formatDecimal, formatNumber } from '../utils/numberFormat.js';
import StatusMessage, { useSrAnnouncer } from '../components/admin/StatusMessage.js';
import FeedbackInlineError from '../components/chat/FeedbackInlineError.js';
import { useInlineFormError } from '../hooks/useInlineFormError.js';
import { useErrorStatus } from '../hooks/useErrorStatus.js';

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

// A probe's error is a genuine, unpredictable driver/DB message from a live
// capability test (unlike VectorService.getStats/reinitialize's fixed
// strings above) — always worth keeping, but wrapped behind a translated
// prefix rather than shown alone, same as everywhere else in this file.
const renderDocdb8Error = (detail, t) => {
  if (!detail) return t('vector.docdb8Capability.noError');
  const [prefix, suffix] = t('vector.docdb8Capability.errorDetail').split('{error}');
  return <>{prefix}<code lang="en">{detail}</code>{suffix}</>;
};

const VectorPage = ({ lang = 'en' }) => {
  const { language } = usePageContext();
  const activeLang = lang || language;
  const { t } = useTranslations(activeLang);
  const { buildErrorStatus, renderStatusMessage } = useErrorStatus(t);
  const fmtN = (n) => formatNumber(n, activeLang);
  const [vectorStats, setVectorStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // useSrAnnouncer's nonce forces the sr-only "stats loaded" region to
  // re-announce even when stats are fetched twice in a row with an
  // identical result (same string both times, which React would otherwise
  // treat as a no-op update).
  const { message: vectorStatsAnnouncement, nonce: vectorStatsAnnounceNonce, announce: announceVectorStats } = useSrAnnouncer();
  // { type: 'success' | 'error', text } per action — was window.alert() for
  // every one of these; not caught by the earlier StatusMessage migration
  // pass since these never went through StatusMessage at all (this was
  // plain incomplete work, not a deliberate skip).
  const [indexMessage, setIndexMessage] = useState(null);
  const [embeddingMessage, setEmbeddingMessage] = useState(null);
  const [metadataBackfillMessage, setMetadataBackfillMessage] = useState(null);
  const [metadataClearMessage, setMetadataClearMessage] = useState(null);
  // Stopping is deliberately not a visible variant box on success — the
  // progress paragraph below already shows "Stopped" for sighted admins,
  // and the processed count visibly stops climbing; a screen reader gets
  // neither cue (that block has no aria-live at all — the still-open TODO
  // below), so this exists purely to announce it, same persistent sr-only
  // pattern as docdb8LastProbeAnnouncement. A genuine stop *failure* still
  // gets a real, visible metadataBackfillMessage error box below — that's
  // worth interrupting for.
  // useSrAnnouncer's nonce re-fires even when stopping the same job's
  // backfill twice in a row produces an identical string (which React would
  // otherwise treat as a no-op update).
  const {
    message: metadataBackfillStopAnnouncement,
    nonce: metadataBackfillStopAnnounceNonce,
    announce: announceMetadataBackfillStop,
    clear: clearMetadataBackfillStopAnnouncement,
  } = useSrAnnouncer();
  // Validation errors tied to one specific field, not an async outcome —
  // FeedbackInlineError + aria-describedby, not StatusMessage (see AGENTS.md's
  // "StatusMessage vs. form-field errors"). useInlineFormError (not a plain
  // useState) so errorCount increments on every triggerError() call, even a
  // repeat identical failure — that's what makes FeedbackInlineError's
  // key={errorCount} mount a fresh DOM node and re-announce/re-focus on
  // repeat submits, same pattern as PublicFeedbackComponent.js/
  // ExpertFeedbackComponent.js.
  const {
    hasError: hasMetadataDelayError,
    errorCount: metadataDelayErrorCount,
    errorRef: metadataDelayErrorRef,
    triggerError: triggerMetadataDelayError,
    clearError: clearMetadataDelayError,
  } = useInlineFormError();
  const {
    hasError: hasMetadataLookupChatIdError,
    errorCount: metadataLookupChatIdErrorCount,
    errorRef: metadataLookupChatIdErrorRef,
    triggerError: triggerMetadataLookupChatIdError,
    clearError: clearMetadataLookupChatIdError,
  } = useInlineFormError();
  const [docdb8CapabilityResults, setDocdb8CapabilityResults] = useState({});
  const [docdb8CapabilityLoadingProbe, setDocdb8CapabilityLoadingProbe] = useState(null);
  const [docdb8CapabilityErrors, setDocdb8CapabilityErrors] = useState({});
  // Sighted admins see the stats <pre>/results table appear or update; a
  // screen reader gets nothing unless the outcome is announced separately —
  // there was no failure-only StatusMessage for either of these before, so
  // success (the common case) was silent. persistent sr-only live regions,
  // same pattern as ConnectivityPage.js's test-completion summary.
  // useSrAnnouncer's nonce re-fires even when running the same probe twice
  // in a row produces an identical pass/fail string (which React would
  // otherwise treat as a no-op update).
  const { message: docdb8LastProbeAnnouncement, nonce: docdb8AnnounceNonce, announce: announceDocdb8Probe } = useSrAnnouncer();

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
  // A job id whose progress/message the admin has explicitly dismissed via
  // an unrelated action (e.g. "Clear metadata") — the poll won't re-surface
  // that same job's inactive-state progress/message again, so clearing
  // doesn't get immediately undone by the next 5s tick re-fetching the same
  // already-dismissed job record from the server. Cleared implicitly once a
  // *different* job id shows up (a genuinely new backfill).
  const dismissedJobIdRef = useRef(null);
  // TODO (review): metadataProgress — and by extension "Processed: X" —
  // comes from whatever job the server last has on file, shown as soon as
  // this page mounts, even if the admin hasn't triggered anything this
  // session. Arguably it shouldn't be visible at all until the admin
  // actually starts a backfill in the current session; flagging rather than
  // changing that behavior blind.
  //
  // WCAG 2.2.2 (Pause, Stop, Hide): this poll only changes what's on screen
  // while a backfill job is active (queued/running/stopping) — when
  // `!job`, below returns before touching state, so an idle page is a
  // visual no-op. The "Stop backfill" button already halts the job, which
  // is what stops the auto-updating content, so no separate pause control
  // is needed here (unlike BatchList/SessionPage, which refresh
  // unconditionally regardless of any admin action).
  //
  // TODO: the network call itself (getMetadataBackfillJob every 5s) has no
  // stop condition tied to the job reaching a terminal state — the
  // same-value guards below (failed/completed) stop redundant state
  // updates/re-renders once the message has settled, but setInterval keeps
  // firing the request indefinitely if the admin leaves this page open
  // without clicking "Clear metadata". Pre-existing (predates this PR),
  // not fixed here — worth tying the interval to isActive/isDismissed if
  // this section gets reworked.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const { job } = await VectorService.getMetadataBackfillJob();
        if (cancelled || !job) return;
        const isActive = ACTIVE_METADATA_JOB_STATUSES.has(job.status);
        const isDismissed = !isActive && job.id === dismissedJobIdRef.current;
        if (!isDismissed) {
          setMetadataProgress(metadataProgressFromJob(job));
          setMetadataBatchRecords(job.latestBatchRecords || []);
        }
        setIsBackfillingMetadata(isActive);
        setStopMetadataBackfill(job.status === 'stopped');
        if (isActive) {
          setMetadataDelaySecondsInput(String((job.delayMs || 0) / 1000));
        }
        if (isDismissed) return;
        // TODO (review): this write to metadataBackfillMessage races with
        // the same state being set imperatively by handleBackfillMetadata /
        // handleStopMetadataBackfill's success and catch paths. dismissedJobIdRef
        // guards the Clear path against exactly this class of race, but Resume/
        // Restart/Stop have no equivalent guard: if a poll request fired before
        // one of those handlers ran is still in flight when the handler's own
        // (fresher, correct) message is set, the late poll response can land
        // after it and overwrite it with stale failed/completed text. Narrow
        // timing window and self-corrects on the next 5s tick, so low severity
        // as-is — but the fix (a generation counter bumped by each mutating
        // handler and checked here before applying a poll-derived message,
        // same idea as dismissedJobIdRef but general) belongs with whatever
        // pass reworks this section's button-group layout, not bolted on
        // alone.
        //
        // A job can fail asynchronously, discovered by this poll rather than
        // a direct start/stop catch block — same failure text, same
        // metadataBackfillMessage StatusMessage, so it's actually announced
        // instead of only ever appearing as plain text in the progress
        // block below. Functional state-update form + a same-value check so
        // this doesn't re-fire (and re-render the live region) every 5s
        // while the job stays failed.
        if (job.status === 'failed') {
          const failedText = t('vector.metadataBackfillFailed');
          setMetadataBackfillMessage((prev) => (prev?.type === 'error' && prev?.text === failedText) ? prev : { type: 'error', text: failedText });
        } else if (job.status === 'completed') {
          // Completion had no announcement at all before — not even the
          // plain, unstyled text "failed" used to get — since only 'failed'
          // was ever checked here. Same guarded functional-update pattern.
          const completedText = t('vector.metadataBackfillCompleted');
          setMetadataBackfillMessage((prev) => (prev?.type === 'success' && prev?.text === completedText) ? prev : { type: 'success', text: completedText });
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
    // Clears the sibling action's stale message too — clicking any button in
    // this section means the admin has moved on from whatever the last one
    // showed.
    setIndexMessage(null);
    try {
      const data = await VectorService.getStats();
      setVectorStats(data);
      announceVectorStats(t('vector.statsLoaded'));
    } catch (err) {
      // err.message is usually the one fixed string VectorService.getStats
      // throws on a non-OK response — not truly unbounded — but a real
      // network failure before any response (e.g. the browser's own
      // "Failed to fetch") can still land here, so the detail is kept,
      // just translated and wrapped rather than shown alone.
      setError(buildErrorStatus('vector.statsLoadError', err));
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
        setEmbeddingMessage(null);
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
          // "Remaining: 0" has nothing left to say once embeddingMessage's
          // success StatusMessage is about to announce completion — clear
          // it instead of leaving a "Remaining: 0" line sitting there
          // permanently. (The in-progress "Remaining: X" while >0 has no
          // aria wiring at all yet — separate TODO above, not this.)
          setEmbeddingProgress(null);
          if (!isAutoProcess) {
            // regenerateAll reflects the outermost call the admin actually
            // triggered — the success message only ever fires here, on that
            // outermost call (recursive auto-process calls always pass
            // isAutoProcess=true), so this is genuinely "which button did
            // they click", not stale state from a recursive step.
            setEmbeddingMessage({ type: 'success', text: t(regenerateAll ? 'vector.allEmbeddingsRegenerated' : 'vector.allEmbeddingsGenerated') });
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
        setEmbeddingMessage({ type: 'error', text: t(regenerateAll ? 'vector.regenerateEmbeddingsFailed' : 'vector.generateEmbeddingsFailed') });
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
    setIndexMessage(null);
    setError(null);
    try {
      await VectorService.reinitialize();
      setIndexMessage({ text: t('vector.indexCreatedSuccess'), isError: false });
    } catch (err) {
      // Same reasoning as fetchVectorStats' catch above — usually one fixed
      // string, occasionally a real network error, always kept but wrapped.
      setIndexMessage(buildErrorStatus('vector.indexCreateError', err));
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
      triggerMetadataDelayError();
      return;
    }
    clearMetadataDelayError();

    setIsBackfillingMetadata(true);
    setStopMetadataBackfill(false);
    setMetadataBackfillMessage(null);
    // Backfill and clear are two different actions on the same button-group
    // / same metadata — a stale "Metadata cleared" shouldn't keep showing
    // once a backfill has started.
    setMetadataClearMessage(null);
    clearMetadataBackfillStopAnnouncement();
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
      setMetadataBackfillMessage({ type: 'error', text: t('vector.metadataBackfillFailed') });
      setIsBackfillingMetadata(false);
    }
  };

  const handleStopMetadataBackfill = async () => {
    setMetadataBackfillMessage(null);
    setMetadataClearMessage(null);
    clearMetadataBackfillStopAnnouncement();
    try {
      const { job } = await VectorService.stopMetadataBackfillJob(metadataProgress?.jobId);
      if (job) {
        setMetadataProgress(metadataProgressFromJob(job));
        setIsBackfillingMetadata(ACTIVE_METADATA_JOB_STATUSES.has(job.status));
      }
      setStopMetadataBackfill(true);
      announceMetadataBackfillStop(t('vector.metadataBackfillStoppedAnnouncement'));
    } catch (err) {
      console.error('Error stopping embedding metadata backfill:', err);
      // Was vector.metadataBackfillFailed ("Failed to backfill...") — wrong
      // text for a stop failure specifically, which could read as "the
      // backfill itself failed" rather than "stopping it failed".
      setMetadataBackfillMessage({ type: 'error', text: t('vector.metadataBackfillStopFailed') });
    }
  };

  const handleBackfillEmptyMetadata = () => {
    setMetadataProgress(null);
    setMetadataBatchRecords([]);
    handleBackfillMetadata();
  };

  const handleClearMetadata = async () => {
    if (isBackfillingMetadata) return;
    setMetadataClearMessage(null);
    setMetadataBackfillMessage(null);
    clearMetadataBackfillStopAnnouncement();
    try {
      await VectorService.clearMetadata();
      // The backfill job record this progress/message came from still says
      // "failed"/"completed" on the server after clearing the metadata —
      // clearing metadata and a job's own run history are different things.
      // Remember its id so the next poll tick doesn't immediately re-show
      // the now-irrelevant old job state we're about to hide.
      if (metadataProgress?.jobId) {
        dismissedJobIdRef.current = metadataProgress.jobId;
      }
      setMetadataProgress(null);
      setMetadataBatchRecords([]);
      setMetadataStatus(null);
      setMetadataClearMessage({ type: 'success', text: t('vector.metadataClearSuccess') });
    } catch (err) {
      console.error('Error clearing embedding metadata:', err);
      setMetadataClearMessage({ type: 'error', text: t('vector.metadataClearFailed') });
    }
  };

  const handleResumeMetadataBackfill = () => {
    handleBackfillMetadata({ resumeJobId: metadataProgress?.jobId || null });
  };

  const handleRestartMetadataBackfill = () => {
    setMetadataBatchRecords([]);
    handleBackfillMetadata({ restartJobId: metadataProgress?.jobId || null });
  };

  const handleRunDocdb8CapabilityTest = async (probe, probeLabel) => {
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
      announceDocdb8Probe(
        t('vector.docdb8Capability.probeComplete')
          .replace('{label}', () => probeLabel)
          .replace('{status}', () => (data?.test?.supported ? t('vector.docdb8Capability.pass') : t('vector.docdb8Capability.fail')))
      );
    } catch (err) {
      setDocdb8CapabilityErrors((current) => ({
        ...current,
        [probe]: err.message,
      }));
      announceDocdb8Probe(
        t('vector.docdb8Capability.probeComplete')
          .replace('{label}', () => probeLabel)
          .replace('{status}', () => t('vector.docdb8Capability.fail'))
      );
    } finally {
      setDocdb8CapabilityLoadingProbe(null);
    }
  };

  const handleMetadataLookup = async () => {
    const trimmedChatId = metadataLookupChatId.trim();
    if (!trimmedChatId) {
      triggerMetadataLookupChatIdError();
      return;
    }
    clearMetadataLookupChatIdError();
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
        {renderStatusMessage(error)}
        {renderStatusMessage(indexMessage)}
        <StatusMessage persistent message={vectorStatsAnnouncement} nonce={vectorStatsAnnounceNonce} className="sr-only" />
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
              onClick={() => handleRunDocdb8CapabilityTest(probe.key, probe.label)}
              disabled={docdb8CapabilityLoadingProbe === probe.key}
              className="mb-200 mr-200"
            >
              {docdb8CapabilityLoadingProbe === probe.key ? t('vector.docdb8Capability.running') : probe.label}
            </GcdsButton>
          ))}
        </div>
        <StatusMessage persistent message={docdb8LastProbeAnnouncement} nonce={docdb8AnnounceNonce} className="sr-only" />
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
                    <td>{renderDocdb8Error(probeError || result?.test?.error?.message, t)}</td>
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
          <select value={provider} onChange={e => { setProvider(e.target.value); setEmbeddingMessage(null); }} className="mr-200" aria-label={t('vector.embeddingProviderLabel')}>
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
        <StatusMessage variant={embeddingMessage?.type} message={embeddingMessage?.text} />
        {/* TODO (review): "Remaining: X" ticks down through many values
            during auto-processing with no role/aria-live at all — silent to
            screen readers the whole time it's actively counting down (the
            final 0 is fine, embeddingMessage's StatusMessage already
            announces completion). Same class of gap as VectorPage.js's
            metadataProgress block and DatabasePage.js's per-chunk import
            counter — flagging rather than fixing blind. */}
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
          {hasMetadataDelayError && (
            <FeedbackInlineError
              id="metadata-backfill-delay-seconds-error"
              message={t('vector.metadataDelayInvalid')}
              errorCount={metadataDelayErrorCount}
              inputRef={metadataDelayErrorRef}
            />
          )}
          <input
            id="metadata-backfill-delay-seconds"
            type="number"
            min="0"
            max="300"
            step="1"
            inputMode="numeric"
            value={metadataDelaySecondsInput}
            onChange={(e) => {
              // Only this field's own validation error is cleared here — the
              // job-outcome messages (backfill/clear/stop) describe the job,
              // not this input, and shouldn't disappear just because the
              // admin is typing a delay value with no action submitted yet
              // (previously this hid an active "Backfill failed" message for
              // up to 5s with no failure indication anywhere on screen).
              setMetadataDelaySecondsInput(e.target.value);
              clearMetadataDelayError();
            }}
            disabled={isBackfillingMetadata}
            aria-describedby={hasMetadataDelayError ? 'metadata-backfill-delay-seconds-error' : undefined}
            className="mr-200"
          />
          <GcdsText>
            {t('vector.metadataDelayHelp')}
          </GcdsText>
        </div>
        {/* TODO (review): this button-group mixes two different actions —
            backfill (resume/restart, its own start/stop) and clear — sharing
            one visual group despite being conceptually separate. That's why
            it needed two message states (metadataBackfillMessage,
            metadataClearMessage) cross-clearing each other on every button
            in the group; a cleaner split (backfill controls and clear as
            visually separate sections, like metadata lookup/status below)
            would probably need only one state each and no cross-clearing at
            all. Not reworking the layout in this pass — flagging since the
            clearing logic above is a symptom of the grouping, not the other
            way around. */}
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
        <StatusMessage variant={metadataBackfillMessage?.type} message={metadataBackfillMessage?.text} />
        <StatusMessage variant={metadataClearMessage?.type} message={metadataClearMessage?.text} />
        <StatusMessage persistent message={metadataBackfillStopAnnouncement} nonce={metadataBackfillStopAnnounceNonce} className="sr-only" />
        {/* TODO (review): this "processed: X, remaining: Y, [active/stopped/
            failed]" block is a live-updating status (refreshed by the
            useEffect poll above, every 5s while a backfill job is active)
            with no role/aria-live at all — screen reader users get no
            indication it's changing. Wasn't part of this pass's alert()
            conversion since it was never an alert() to begin with, but it's
            the same class of gap. Doesn't cleanly fit StatusMessage's
            variant/loading (it's neither a settled outcome nor a single
            "still working" message — more like DatabasePage.js's per-chunk
            import counter) — flagging for a maintainer decision rather than
            guessing at a fix. */}
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
              {/* "failed" used to also repeat here as plain text — now
                  handled once, accessibly, by metadataBackfillMessage's
                  StatusMessage above instead of duplicating it silently. */}
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
        <StatusMessage variant={metadataStatusError ? 'error' : undefined} message={metadataStatusError} />
        {metadataStatus && (
          <StatusMessage
            variant={metadataStatus.complete ? 'success' : 'info'}
            message={metadataStatus.complete ? t('vector.metadataStatus.complete') : t('vector.metadataStatus.incomplete')}
          />
        )}
        {metadataStatus && (
          <div className="mb-400">
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
          {hasMetadataLookupChatIdError && (
            <FeedbackInlineError
              id="metadata-lookup-chat-id-error"
              message={t('vector.metadataLookup.chatIdRequired')}
              errorCount={metadataLookupChatIdErrorCount}
              inputRef={metadataLookupChatIdErrorRef}
            />
          )}
          <input
            id="metadata-lookup-chat-id"
            type="text"
            value={metadataLookupChatId}
            onChange={(e) => {
              setMetadataLookupChatId(e.target.value);
              clearMetadataLookupChatIdError();
              setMetadataLookupError(null);
            }}
            placeholder={t('vector.chatIdPlaceholder')}
            disabled={metadataLookupLoading}
            aria-describedby={hasMetadataLookupChatIdError ? 'metadata-lookup-chat-id-error' : undefined}
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
        <StatusMessage variant={metadataLookupError ? 'error' : undefined} message={metadataLookupError} />
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
