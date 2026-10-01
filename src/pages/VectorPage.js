import React, { useEffect, useRef, useState } from 'react';
import { GcdsContainer, GcdsHeading, GcdsText, GcdsButton, GcdsLink, GcdsDetails } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import DataStoreService from '../services/DataStoreService.js';
import VectorService from '../services/VectorService.js';
import SimilarChatsDashboard from '../components/admin/SimilarChatsDashboard.js';
import ChatIdLookupField from '../components/admin/ChatIdLookupField.js';
import { buildChatIdMatchesLabels } from '../components/admin/ChatIdMatchList.js';
import { useChatIdLookup } from '../hooks/admin/useChatIdLookup.js';
import { formatDecimal, formatNumber } from '../utils/numberFormat.js';
import StatusMessage, { useRepeatableStatus } from '../components/admin/StatusMessage.js';
import { announce } from '../utils/liveAnnouncer.js';
import FeedbackInlineError from '../components/chat/FeedbackInlineError.js';
import { useInlineFormError } from '../hooks/useInlineFormError.js';
import { useErrorStatus } from '../hooks/useErrorStatus.js';

const ACTIVE_METADATA_JOB_STATUSES = new Set(['queued', 'running', 'stopping']);

// Stacks every label a button can show in one spot, so the button is always
// as wide as its longest one and doesn't resize when the text changes.
const StableLabel = ({ labels, current }) => (
  <span className="canada-ca-stable-label">
    {labels.map((label) => (
      <span key={label} aria-hidden={label === current ? undefined : 'true'}>{label}</span>
    ))}
  </span>
);

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
const renderDocdb8Error = (detail, wrapErrorDetail, t) => {
  if (!detail) return t('vector.docdb8Capability.noError');
  const wrapped = wrapErrorDetail('vector.docdb8Capability.errorDetail', { message: detail });
  return <>{wrapped.prefix}{wrapped.detail}{wrapped.suffix}</>;
};

const VectorPage = ({ lang = 'en' }) => {
  const { language } = usePageContext();
  const activeLang = lang || language;
  const { t } = useTranslations(activeLang);
  const { buildErrorStatus, wrapErrorDetail, renderStatusMessage } = useErrorStatus(t);
  const fmtN = (n) => formatNumber(n, activeLang);
  const [vectorStats, setVectorStats] = useState(null);
  const [isFetchingStats, setIsFetchingStats] = useState(false);
  const [isReinitializingIndex, setIsReinitializingIndex] = useState(false);
  const [error, setError] = useState(null);
  const [indexMessage, setIndexMessage] = useState(null);
  const embeddingStatus = useRepeatableStatus();
  const metadataBackfillStatus = useRepeatableStatus();
  // Mirrors metadataBackfillStatus so the poll effect (empty deps) can diff
  // without depending on the hook.
  const metadataBackfillLastRef = useRef({ isError: undefined, text: null });
  const metadataClearStatus = useRepeatableStatus();
  // Stopping is deliberately not a visible variant box on success — the
  // progress paragraph below already shows "Stopped" for sighted admins,
  // and the processed count visibly stops climbing; a screen reader gets
  // neither cue (that block has no aria-live at all — the still-open TODO
  // below), so a stop is announced (announce(), in handleStopMetadataBackfill)
  // with no visible box. A genuine stop *failure* still gets a real,
  // visible metadataBackfillMessage error box below — that's worth
  // interrupting for.
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
  // Partial or full chat ID, same search as the admin home page's View
  // chat by ID: validation, "not found" and the several-matches pick list.
  const lookupChat = useChatIdLookup({ lang: activeLang });
  // Picking a match removes the pick-list, and the button with it - move
  // focus to the result summary instead of letting it drop to <body>. A
  // failed pick has no summary: focus its outcome message (the
  // trigger-loses-focus case in status-and-error-messaging.md), the field
  // only if there's neither. metadataLookupFromPick: the same boxes show
  // typed-search outcomes, which still announce normally.
  const [metadataLookupPickCount, setMetadataLookupPickCount] = useState(0);
  const [metadataLookupFromPick, setMetadataLookupFromPick] = useState(false);
  const metadataLookupResultRef = useRef(null);
  const metadataLookupErrorRef = useRef(null);
  const lookupChatStatusRef = useRef(null);
  useEffect(() => {
    if (!metadataLookupPickCount) return;
    (metadataLookupResultRef.current
      || metadataLookupErrorRef.current
      || lookupChatStatusRef.current
      || document.getElementById('metadata-lookup-chat-id'))?.focus();
  }, [metadataLookupPickCount]);
  const [docdb8CapabilityResults, setDocdb8CapabilityResults] = useState({});
  const [docdb8CapabilityLoadingProbe, setDocdb8CapabilityLoadingProbe] = useState(null);
  const [selectedDocdb8Probe, setSelectedDocdb8Probe] = useState('ann_all_then_feedback_post_filter');
  const [docdb8CapabilityErrors, setDocdb8CapabilityErrors] = useState({});
  // Sighted admins see the stats <pre>/results table appear or update; a
  // screen reader gets nothing unless the outcome is announced separately —
  // there was no failure-only StatusMessage for either of these before, so
  // success (the common case) was silent. Both go through announce() with
  // no visible box, same as ConnectivityPage.js's test-completion summary.

  // Embedding functionality state
  const [embeddingProgress, setEmbeddingProgress] = useState(null);
  const [isAutoProcessingEmbeddings, setIsAutoProcessingEmbeddings] = useState(false);
  const [isRequestInProgress, setIsRequestInProgress] = useState(false);
  const [isRegeneratingEmbeddings, setIsRegeneratingEmbeddings] = useState(false);
  const [embeddingScope, setEmbeddingScope] = useState('missing');
  const [provider, setProvider] = useState('openai');
  const [metadataProgress, setMetadataProgress] = useState(null);
  const [metadataDelaySecondsInput, setMetadataDelaySecondsInput] = useState('5');
  const [metadataBatchRecords, setMetadataBatchRecords] = useState([]);
  const [isBackfillingMetadata, setIsBackfillingMetadata] = useState(false);
  const [isClearingMetadata, setIsClearingMetadata] = useState(false);
  const [stopMetadataBackfill, setStopMetadataBackfill] = useState(false);
  // Which control started the current run, so that one shows it's running.
  // A run found on page load is shown on Start.
  const [metadataBackfillRunSource, setMetadataBackfillRunSource] = useState('start');
  const [metadataLookupResult, setMetadataLookupResult] = useState(null);
  const [metadataLookupLoading, setMetadataLookupLoading] = useState(false);
  const metadataLookupErrorStatus = useRepeatableStatus();
  const [metadataStatus, setMetadataStatus] = useState(null);
  const [metadataStatusLoading, setMetadataStatusLoading] = useState(false);
  const metadataStatusErrorStatus = useRepeatableStatus();
  // A job id whose progress/message the admin has explicitly dismissed via
  // an unrelated action (e.g. "Clear metadata") — the poll won't re-surface
  // that same job's inactive-state progress/message again, so clearing
  // doesn't get immediately undone by the next 5s tick re-fetching the same
  // already-dismissed job record from the server. Cleared implicitly once a
  // *different* job id shows up (a genuinely new backfill).
  const dismissedJobIdRef = useRef(null);
  // Keeps metadataBackfillLastRef in sync on every write (handler or poll)
  // so the poll's same-value guard sees handler-set outcomes too.
  const announceMetadataBackfillMessage = (text, isError, { quiet = false } = {}) => {
    metadataBackfillLastRef.current = { text, isError };
    metadataBackfillStatus.announce(text, { isError, quiet });
  };
  // Only a backfill started (or resumed/restarted) on this visit is
  // announced when the poll finds it finished. One the page finds on load
  // is shown quietly — nobody just asked for it.
  const backfillStartedRef = useRef(false);
  const clearMetadataBackfillMessage = () => {
    metadataBackfillLastRef.current = { text: null, isError: undefined };
    metadataBackfillStatus.clear();
  };
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
        // block below. Guarded against metadataBackfillLastRef so it doesn't
        // spam the live region every 5s while the job stays failed.
        if (job.status === 'failed') {
          const failedText = t('vector.metadataBackfillFailed');
          const last = metadataBackfillLastRef.current;
          if (!(last.isError === true && last.text === failedText)) {
            announceMetadataBackfillMessage(failedText, true, { quiet: !backfillStartedRef.current });
          }
        } else if (job.status === 'completed') {
          // Completion had no announcement at all before — not even the
          // plain, unstyled text "failed" used to get — since only 'failed'
          // was ever checked here. Same guarded pattern.
          const completedText = t('vector.metadataBackfillCompleted');
          const last = metadataBackfillLastRef.current;
          if (!(last.isError === false && last.text === completedText)) {
            announceMetadataBackfillMessage(completedText, false, { quiet: !backfillStartedRef.current });
          }
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
    setIsFetchingStats(true);
    setError(null);
    // Clears the sibling action's stale message too — clicking any button in
    // this section means the admin has moved on from whatever the last one
    // showed.
    setIndexMessage(null);
    try {
      const data = await VectorService.getStats();
      setVectorStats(data);
      announce(t('vector.statsLoaded'));
    } catch (err) {
      // err.message is usually the one fixed string VectorService.getStats
      // throws on a non-OK response — not truly unbounded — but a real
      // network failure before any response (e.g. the browser's own
      // "Failed to fetch") can still land here, so the detail is kept,
      // just translated and wrapped rather than shown alone.
      setError(buildErrorStatus('vector.statsLoadError', err));
    } finally {
      setIsFetchingStats(false);
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
        setIsRegeneratingEmbeddings(regenerateAll);
        embeddingStatus.clear();
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
          setIsRegeneratingEmbeddings(false);
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
            embeddingStatus.announce(t(regenerateAll ? 'vector.allEmbeddingsRegenerated' : 'vector.allEmbeddingsGenerated'), { isError: false });
          }
        }
      } else {
        // If we don't get a valid remaining count, stop processing
        setIsAutoProcessingEmbeddings(false);
        setIsRegeneratingEmbeddings(false);
        throw new Error('Invalid response format from server');
      }
    } catch (generateError) {
      console.error('Error generating embeddings:', generateError);
      if (!isAutoProcess) {
        embeddingStatus.announce(t(regenerateAll ? 'vector.regenerateEmbeddingsFailed' : 'vector.generateEmbeddingsFailed'), { isError: true });
      }
      setIsAutoProcessingEmbeddings(false);
      setIsRegeneratingEmbeddings(false);
    } finally {
      setIsRequestInProgress(false);
    }
  };

  const handleRegenerateEmbeddings = () => {
    const confirmed = window.confirm(t('vector.regenerateConfirm'));
    if (confirmed) {
      handleGenerateEmbeddings(false, true, null);
    }
  };

  // Trigger vector index creation and reinitialize vector service using VectorService
  const handleCreateVectorIndex = async () => {
    setIsReinitializingIndex(true);
    setIndexMessage(null);
    setError(null);
    try {
      await VectorService.reinitialize();
      setIndexMessage({ text: t('vector.indexCreatedSuccess'), isError: false });
      // Stats on screen describe the service that was just reloaded, so
      // refresh them. Quiet on success: the message above is the outcome.
      if (vectorStats) {
        try {
          setVectorStats(await VectorService.getStats());
        } catch (statsErr) {
          setVectorStats(null);
          setError(buildErrorStatus('vector.statsLoadError', statsErr));
        }
      }
    } catch (err) {
      // Same reasoning as fetchVectorStats' catch above — usually one fixed
      // string, occasionally a real network error, always kept but wrapped.
      setIndexMessage(buildErrorStatus('vector.indexCreateError', err));
    } finally {
      setIsReinitializingIndex(false);
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

    backfillStartedRef.current = true;
    setIsBackfillingMetadata(true);
    setStopMetadataBackfill(false);
    clearMetadataBackfillMessage();
    // Backfill and clear act on the same metadata — a stale "Metadata
    // cleared" shouldn't keep showing once a backfill has started.
    metadataClearStatus.clear();
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
      announceMetadataBackfillMessage(t('vector.metadataBackfillFailed'), true);
      setIsBackfillingMetadata(false);
    }
  };

  const handleStopMetadataBackfill = async () => {
    clearMetadataBackfillMessage();
    metadataClearStatus.clear();
    try {
      const { job } = await VectorService.stopMetadataBackfillJob(metadataProgress?.jobId);
      if (job) {
        setMetadataProgress(metadataProgressFromJob(job));
        setIsBackfillingMetadata(ACTIVE_METADATA_JOB_STATUSES.has(job.status));
      }
      setStopMetadataBackfill(true);
      announce(t('vector.metadataBackfillStoppedAnnouncement'));
    } catch (err) {
      console.error('Error stopping embedding metadata backfill:', err);
      // Was vector.metadataBackfillFailed ("Failed to backfill...") — wrong
      // text for a stop failure specifically, which could read as "the
      // backfill itself failed" rather than "stopping it failed".
      announceMetadataBackfillMessage(t('vector.metadataBackfillStopFailed'), true);
    }
  };

  const handleClearMetadata = async () => {
    if (isBackfillingMetadata || isClearingMetadata) return;
    if (!window.confirm(t('vector.clearMetadataConfirm'))) return;
    metadataClearStatus.clear();
    clearMetadataBackfillMessage();
    setIsClearingMetadata(true);
    try {
      const { modifiedCount } = await VectorService.clearMetadata();
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
      if (modifiedCount === 0) {
        metadataClearStatus.announce(t('vector.metadataClearNothing'), { variant: 'info' });
      } else {
        metadataClearStatus.announce(t('vector.metadataClearSuccess'), { isError: false });
      }
    } catch (err) {
      console.error('Error clearing embedding metadata:', err);
      metadataClearStatus.announce(t('vector.metadataClearFailed'), { isError: true });
    } finally {
      setIsClearingMetadata(false);
    }
  };

  const handleResumeMetadataBackfill = () => {
    setMetadataBackfillRunSource('resume');
    handleBackfillMetadata({ resumeJobId: metadataProgress?.jobId || null });
  };

  // Starts from the beginning. Reuses the last finished/stopped job's record
  // when there is one; the server creates a new job otherwise.
  const handleStartMetadataBackfill = () => {
    setMetadataBackfillRunSource('start');
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
      announce(
        t('vector.docdb8Capability.probeComplete')
          .replace('{label}', () => probeLabel)
          .replace('{status}', () => (data?.test?.supported ? t('vector.docdb8Capability.pass') : t('vector.docdb8Capability.fail')))
      );
    } catch (err) {
      setDocdb8CapabilityErrors((current) => ({
        ...current,
        [probe]: err.message,
      }));
      announce(
        t('vector.docdb8Capability.probeComplete')
          .replace('{label}', () => probeLabel)
          .replace('{status}', () => t('vector.docdb8Capability.fail'))
      );
    } finally {
      setDocdb8CapabilityLoadingProbe(null);
    }
  };

  const runMetadataLookup = async (chatId) => {
    setMetadataLookupLoading(true);
    try {
      const result = await VectorService.lookupMetadata(chatId);
      setMetadataLookupResult(result);
    } catch (err) {
      console.error('Error looking up embedding metadata:', err);
      setMetadataLookupResult(null);
      metadataLookupErrorStatus.announce(t('vector.metadataLookup.failed'), { isError: true });
    } finally {
      setMetadataLookupLoading(false);
    }
  };

  // searchChats/selectMatch leave loading on for a confirmed chat (see
  // useChatIdLookup.js); the metadata lookup is that next step.
  const handleMetadataLookup = async (e) => {
    e.preventDefault();
    setMetadataLookupFromPick(false);
    setMetadataLookupResult(null);
    metadataLookupErrorStatus.clear();
    const chat = await lookupChat.searchChats(lookupChat.chatId);
    if (!chat) return;
    lookupChat.setLoading(false);
    runMetadataLookup(chat.chatId);
  };

  const handleSelectMetadataLookupMatch = async (matchId) => {
    setMetadataLookupFromPick(true);
    const chat = await lookupChat.selectMatch(matchId);
    if (chat) {
      lookupChat.setLoading(false);
      await runMetadataLookup(chat.chatId);
    }
    setMetadataLookupPickCount((n) => n + 1);
  };

  const handleMetadataStatus = async () => {
    setMetadataStatusLoading(true);
    metadataStatusErrorStatus.clear();
    try {
      setMetadataStatus(await VectorService.getMetadataStatus());
    } catch (err) {
      console.error('Error checking embedding metadata status:', err);
      setMetadataStatus(null);
      metadataStatusErrorStatus.announce(t('vector.metadataStatus.failed'), { isError: true });
    } finally {
      setMetadataStatusLoading(false);
    }
  };

  const docdb8ProbeDefinitions = getDocdb8ProbeDefinitions(t);
  const hasMetadataBackfillResume = ['stopped', 'failed'].includes(metadataProgress?.status)
    && Boolean(metadataProgress?.jobId);
  const isStoppingMetadataBackfill = metadataProgress?.status === 'stopping';
  const isRunningMetadataBackfill = isBackfillingMetadata && !isStoppingMetadataBackfill;
  const isStoppedMetadataBackfill = metadataProgress?.status === 'stopped' && !isBackfillingMetadata;
  const activeMetadataBackfillControl = isRunningMetadataBackfill
    ? metadataBackfillRunSource
    : (isStoppingMetadataBackfill || isStoppedMetadataBackfill ? 'stop' : null);
  const metadataBackfillControlRole = (control) => (activeMetadataBackfillControl === control ? 'primary' : 'secondary');
  const loadedDocdb8Results = docdb8ProbeDefinitions
    .map(({ key, label }) => ({
      key,
      label,
      result: docdb8CapabilityResults[key],
      error: docdb8CapabilityErrors[key],
    }))
    .filter((entry) => entry.result || entry.error);

  // Job progress as label/value pairs; falsy rows are skipped.
  const renderProgressList = (rows) => (
    <dl className="canada-ca-dl-columns canada-ca-dl-columns--single mb-200">
      {rows.filter(Boolean).map(([key, label, value]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <GcdsContainer layout="page">
      <GcdsHeading tag="h1">{t('vector.title')}</GcdsHeading>
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>
            {t('common.backToAdmin')}
          </GcdsLink>
        </GcdsText>
      </nav>
      <div className="mb-400">
        <GcdsHeading tag="h2">{t('vector.indexManagement')}</GcdsHeading>
        <GcdsText>
          {t('vector.manageDescription')}
        </GcdsText>
        {/* Fetch only looks, so it's secondary; Reinitialize acts. */}
        <div className="canada-ca-button-stack">
          <GcdsButton onClick={fetchVectorStats} disabled={isFetchingStats || isReinitializingIndex} buttonRole="secondary">
            <StableLabel
              labels={[t('vector.fetchStats'), t('vector.fetchingStats')]}
              current={isFetchingStats ? t('vector.fetchingStats') : t('vector.fetchStats')}
            />
          </GcdsButton>
          <GcdsButton onClick={handleCreateVectorIndex} disabled={isFetchingStats || isReinitializingIndex} buttonRole="primary">
            <StableLabel
              labels={[t('vector.reinitializeIndex'), t('vector.reinitializingIndex')]}
              current={isReinitializingIndex ? t('vector.reinitializingIndex') : t('vector.reinitializeIndex')}
            />
          </GcdsButton>
        </div>
        {renderStatusMessage(error, 'success', 'stats')}
        {renderStatusMessage(indexMessage, 'success', 'indexCreate')}
        {vectorStats && (
          <div className="mb-200">
            <pre>{JSON.stringify(vectorStats, null, 2)}</pre>
          </div>
        )}
        <GcdsHeading tag="h2">{t('vector.docdb8Capability.title')}</GcdsHeading>
        <GcdsText>
          {t('vector.docdb8Capability.description')}
        </GcdsText>
        <div className="mb-300 filter-fields-full-size">
          <label htmlFor="docdb8-probe" className="filter-label display-block">
            {t('vector.docdb8Capability.probeLabel')}
          </label>
          <p id="docdb8-probe-hint" className="canada-ca-field-hint">
            {t('vector.docdb8Capability.singleProbeDescription')}
          </p>
          <select
            id="docdb8-probe"
            className="filter-select filter-select--narrow"
            value={selectedDocdb8Probe}
            onChange={(e) => setSelectedDocdb8Probe(e.target.value)}
            aria-describedby="docdb8-probe-hint"
          >
            {docdb8ProbeDefinitions.map((probe) => (
              <option key={probe.key} value={probe.key}>{probe.label}</option>
            ))}
          </select>
        </div>
        <div className="mb-200">
          <GcdsButton
            onClick={() => {
              const probe = docdb8ProbeDefinitions.find((p) => p.key === selectedDocdb8Probe);
              handleRunDocdb8CapabilityTest(probe.key, probe.label);
            }}
            disabled={docdb8CapabilityLoadingProbe !== null}
          >
            {docdb8CapabilityLoadingProbe ? t('vector.docdb8Capability.running') : t('vector.docdb8Capability.run')}
          </GcdsButton>
        </div>
        {loadedDocdb8Results.length > 0 && (
          <div className="mb-400">
            {/* Same static-table treatment as ChatViewer.js's pipeline step
                timeline (see the metadata backfill results table below). */}
            <div className="table-scroll dt-container" tabIndex={0}>
            {/* Fixed layout + colgroup: widths are set once instead of
                re-measured from the content every time a probe adds a row,
                which had the columns shifting between button clicks. Error
                takes whatever is left. */}
            <table className="dataTable table-slim-padding table-fixed-layout">
              <caption className="sr-only">{t('vector.docdb8Capability.title')}</caption>
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '9%' }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">{t('vector.docdb8Capability.table.capability')}</th>
                  <th scope="col">{t('vector.docdb8Capability.table.status')}</th>
                  <th scope="col">{t('vector.docdb8Capability.table.resultCount')}</th>
                  <th scope="col">{t('vector.docdb8Capability.table.preFilter')}</th>
                  <th scope="col">{t('vector.docdb8Capability.table.score')}</th>
                  <th scope="col">{t('vector.docdb8Capability.table.duration')}</th>
                  <th scope="col">{t('vector.docdb8Capability.table.error')}</th>
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
                    <td>{renderDocdb8Error(probeError || result?.test?.error?.message, wrapErrorDetail, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <GcdsDetails detailsTitle={t('vector.docdb8Capability.rawResults')} className="mb-400" tabIndex="0">
              <pre>{JSON.stringify(docdb8CapabilityResults, null, 2)}</pre>
            </GcdsDetails>
          </div>
        )}
        <GcdsHeading tag="h2">{t('vector.embeddingManagement')}</GcdsHeading>
        <GcdsText>
          {t('vector.embeddingDescription')}
        </GcdsText>
        {/* Same field styling as the Database page's export and import forms. */}
        <div className="filter-fields-full-size">
          <div className="mb-300">
            <label htmlFor="embedding-provider" className="filter-label display-block">
              {t('vector.embeddingProviderLabel')}
            </label>
            <select
              id="embedding-provider"
              className="filter-select filter-select--narrow"
              value={provider}
              onChange={e => { setProvider(e.target.value); embeddingStatus.clear(); }}
            >
              <option value="openai">OpenAI</option>
              <option value="azure">Azure OpenAI</option>
            </select>
          </div>
          <fieldset className="gc-chckbxrdio md canada-ca-choice-fieldset" disabled={isAutoProcessingEmbeddings}>
            <legend className="filter-label">{t('vector.embeddingScope.legend')}</legend>
            {[
              { value: 'missing', label: t('vector.embeddingScope.missing') },
              { value: 'all', label: t('vector.embeddingScope.all') },
            ].map(option => (
              <div className="radio" key={option.value}>
                <input
                  type="radio"
                  id={`embedding-scope-${option.value}`}
                  name="embedding-scope"
                  value={option.value}
                  checked={embeddingScope === option.value}
                  onChange={() => { setEmbeddingScope(option.value); embeddingStatus.clear(); }}
                />
                <label htmlFor={`embedding-scope-${option.value}`}>{option.label}</label>
              </div>
            ))}
          </fieldset>
        </div>
        {/* Red when it replaces every embedding; its text changes too, so
            colour isn't the only cue. */}
        <div className="mb-200">
          <GcdsButton
            onClick={embeddingScope === 'all' ? handleRegenerateEmbeddings : () => handleGenerateEmbeddings(false)}
            disabled={isAutoProcessingEmbeddings}
            buttonRole={embeddingScope === 'all' ? 'danger' : 'primary'}
          >
            <StableLabel
              labels={[t('vector.generateEmbeddings'), t('vector.regenerateEmbeddings'), t('vector.processing'), t('vector.regenerating')]}
              current={isAutoProcessingEmbeddings
                ? (isRegeneratingEmbeddings ? t('vector.regenerating') : t('vector.processing'))
                : (embeddingScope === 'all' ? t('vector.regenerateEmbeddings') : t('vector.generateEmbeddings'))}
            />
          </GcdsButton>
        </div>
        <StatusMessage variant={embeddingStatus.message ? (embeddingStatus.isError ? 'error' : 'success') : undefined} message={embeddingStatus.message} nonce={embeddingStatus.nonce} />
        {/* TODO (review): "Remaining: X" ticks down through many values
            during auto-processing with no role/aria-live at all — silent to
            screen readers the whole time it's actively counting down (the
            final 0 is fine, embeddingMessage's StatusMessage already
            announces completion). Same class of gap as VectorPage.js's
            metadataProgress block and DatabasePage.js's per-chunk import
            counter — flagging rather than fixing blind. */}
        {embeddingProgress && renderProgressList([
          isAutoProcessingEmbeddings && ['status', t('vector.progressStatus'), t('vector.autoProcessingActive')],
          embeddingProgress.remaining !== undefined && ['remaining', t('vector.remaining'), fmtN(embeddingProgress.remaining)],
        ])}
        <GcdsHeading tag="h2">{t('vector.metadataBackfillTitle')}</GcdsHeading>
        <GcdsText>
          {t('vector.metadataBackfillDescription')}
        </GcdsText>
        <div className="mb-200 filter-fields-full-size">
          <label htmlFor="metadata-backfill-delay-seconds" className="filter-label display-block">
            {t('vector.metadataDelayLabel')}
          </label>
          <p id="metadata-backfill-delay-seconds-help" className="canada-ca-field-hint">
            {t('vector.metadataDelayHelp')}
          </p>
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
            aria-describedby={hasMetadataDelayError ? 'metadata-backfill-delay-seconds-help metadata-backfill-delay-seconds-error' : 'metadata-backfill-delay-seconds-help'}
            className="filter-input filter-input--narrow"
          />
        </div>
        {/* The active control is blue and says what's happening. All three
            stay in place; Start reads "Restart" only while Resume is on, to
            set the two choices apart. The wrapper sizes the label like the
            delay field's. */}
        <div className="filter-fields-full-size">
          <p id="metadata-backfill-controls-label" className="filter-label display-block">
            {t('vector.backfillControls.label')}
          </p>
          <div className="canada-ca-button-group" role="group" aria-labelledby="metadata-backfill-controls-label">
            <GcdsButton
              onClick={handleStartMetadataBackfill}
              disabled={isBackfillingMetadata}
              buttonRole={metadataBackfillControlRole('start')}
            >
              <StableLabel
                labels={[t('vector.backfillControls.start'), t('vector.backfillControls.restart'), t('vector.backfillControls.running')]}
                current={activeMetadataBackfillControl === 'start'
                  ? t('vector.backfillControls.running')
                  : (hasMetadataBackfillResume ? t('vector.backfillControls.restart') : t('vector.backfillControls.start'))}
              />
            </GcdsButton>
            <GcdsButton
              onClick={handleResumeMetadataBackfill}
              disabled={isBackfillingMetadata || !hasMetadataBackfillResume}
              buttonRole={metadataBackfillControlRole('resume')}
            >
              <StableLabel
                labels={[t('vector.backfillControls.resume'), t('vector.backfillControls.running')]}
                current={activeMetadataBackfillControl === 'resume' ? t('vector.backfillControls.running') : t('vector.backfillControls.resume')}
              />
            </GcdsButton>
            <GcdsButton
              onClick={handleStopMetadataBackfill}
              disabled={!isRunningMetadataBackfill}
              buttonRole={metadataBackfillControlRole('stop')}
            >
              <StableLabel
                labels={[t('vector.backfillControls.stop'), t('vector.backfillControls.stopping'), t('vector.metadataBackfillStopped')]}
                current={isStoppingMetadataBackfill
                  ? t('vector.backfillControls.stopping')
                  : (isStoppedMetadataBackfill ? t('vector.metadataBackfillStopped') : t('vector.backfillControls.stop'))}
              />
            </GcdsButton>
          </div>
        </div>
        <StatusMessage variant={metadataBackfillStatus.message ? (metadataBackfillStatus.isError ? 'error' : 'success') : undefined} message={metadataBackfillStatus.message} nonce={metadataBackfillStatus.nonce} announce={!metadataBackfillStatus.quiet} />
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
        {/* "failed" isn't repeated here - metadataBackfillMessage's
            StatusMessage above covers it. */}
        {metadataProgress && renderProgressList([
          isBackfillingMetadata && ['status', t('vector.progressStatus'), t('vector.autoProcessingActive')],
          stopMetadataBackfill && !isBackfillingMetadata && ['status', t('vector.progressStatus'), t('vector.metadataBackfillStopped')],
          ['processed', t('vector.metadataProcessed'), fmtN(metadataProgress.processed)],
          typeof metadataProgress.remaining === 'number' && ['remaining', t('vector.remaining'), fmtN(metadataProgress.remaining)],
          metadataProgress.lastProcessedId && ['resumeId', t('vector.metadataResumeFromId'), metadataProgress.lastProcessedId],
        ])}
        {metadataBatchRecords.length > 0 && (
          <div className="mb-400">
            <GcdsHeading tag="h3">{t('vector.metadataBatchResultsTitle')}</GcdsHeading>
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
            {/* Same static-table treatment as ChatViewer.js's pipeline step
                timeline: DataTables' base table styling (the dataTable class
                alone, no display striping/hover) with slim padding - nothing
                to page/sort/search here. dt-container on the wrapper is what
                every live DataTables instance gets from the library, and
                admin.css keys the table text size off it. table-scroll: 11
                columns overflow the page width. */}
            <div className="table-scroll dt-container" tabIndex={0}>
            <table className="dataTable table-slim-padding">
              <caption className="sr-only">{t('vector.metadataBatchResultsTitle')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('vector.metadataBatchResults.columns.embeddingId')}</th>
                  <th scope="col">{t('vector.metadataBatchResults.columns.storedInteractionId')}</th>
                  <th scope="col">{t('vector.metadataBatchResults.columns.resolvedInteractionId')}</th>
                  <th scope="col">{t('vector.metadataBatchResults.columns.action')}</th>
                  <th scope="col">{t('vector.metadataBatchResults.columns.reason')}</th>
                  <th scope="col">{t('vector.metadataBatchResults.columns.feedbackType')}</th>
                  <th scope="col">{t('vector.metadataBatchResults.columns.pageLanguage')}</th>
                  <th scope="col">{t('vector.metadataBatchResults.columns.interactionLanguage')}</th>
                  <th scope="col">{t('vector.metadataBatchResults.columns.expertFeedbackId')}</th>
                  <th scope="col">{t('vector.metadataBatchResults.columns.totalScore')}</th>
                  <th scope="col">{t('vector.metadataBatchResults.columns.modifiedCount')}</th>
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
          </div>
        )}
        {/* Its own action, not part of the backfill job controls above. */}
        <div className="mb-200">
          <GcdsButton onClick={handleClearMetadata} disabled={isBackfillingMetadata || isClearingMetadata} buttonRole="secondary">
            {isClearingMetadata ? t('vector.clearingMetadata') : t('vector.clearMetadata')}
          </GcdsButton>
        </div>
        <StatusMessage variant={metadataClearStatus.message ? (metadataClearStatus.variant ?? (metadataClearStatus.isError ? 'error' : 'success')) : undefined} message={metadataClearStatus.message} nonce={metadataClearStatus.nonce} />
        <GcdsHeading tag="h2">{t('vector.metadataStatus.title')}</GcdsHeading>
        <GcdsText>{t('vector.metadataStatus.description')}</GcdsText>
        <div className="mb-200">
          <GcdsButton onClick={handleMetadataStatus} disabled={metadataStatusLoading} className="mb-200 mr-200">
            {metadataStatusLoading ? t('vector.metadataStatus.loading') : t('vector.metadataStatus.check')}
          </GcdsButton>
        </div>
        <StatusMessage variant={metadataStatusErrorStatus.message ? 'error' : undefined} message={metadataStatusErrorStatus.message} nonce={metadataStatusErrorStatus.nonce} />
        {metadataStatus && (
          <StatusMessage
            variant={metadataStatus.complete ? 'success' : 'info'}
            message={metadataStatus.complete ? t('vector.metadataStatus.complete') : t('vector.metadataStatus.incomplete')}
          />
        )}
        {metadataStatus && (
          <dl className="canada-ca-dl-columns canada-ca-dl-columns--single mb-400">
            {[
              ['totalEmbeddings', metadataStatus.totalEmbeddings],
              ['recordsRequiringMetadata', metadataStatus.recordsRequiringMetadata],
              ['recordsWithMetadata', metadataStatus.recordsWithMetadata],
              ['recordsMissingMetadata', metadataStatus.recordsMissingMetadata],
            ].map(([key, value]) => (
              <div key={key}>
                <dt>{t(`vector.metadataStatus.${key}`)}</dt>
                <dd>{fmtN(value)}</dd>
              </div>
            ))}
          </dl>
        )}
        <GcdsHeading tag="h2" id="metadata-lookup-heading">{t('vector.metadataLookup.title')}</GcdsHeading>
        <GcdsText>
          {t('vector.metadataLookup.description')}
        </GcdsText>
        {/* Same field as the admin home page's chat ID lookup. */}
        <form className="mb-200" onSubmit={handleMetadataLookup}>
          <ChatIdLookupField
            fieldId="metadata-lookup-chat-id"
            label={t('vector.chatIdLabel')}
            placeholder={t('admin.common.chatIdSearchPlaceholder')}
            value={lookupChat.chatId}
            onChange={(e) => {
              lookupChat.handleInputChange(e);
              metadataLookupErrorStatus.clear();
            }}
            disabled={lookupChat.loading || metadataLookupLoading}
            hasError={lookupChat.hasError}
            errorMessage={lookupChat.inlineErrorMessage}
            errorCount={lookupChat.errorCount}
            errorRef={lookupChat.errorRef}
            buttonLabel={lookupChat.loading || metadataLookupLoading ? t('vector.metadataLookup.loading') : t('vector.metadataLookup.lookup')}
            describedById="metadata-lookup-heading"
            matches={lookupChat.matches}
            {...buildChatIdMatchesLabels(t, lookupChat.matches, lookupChat.matchesTruncated)}
            onSelectMatch={handleSelectMetadataLookupMatch}
          />
        </form>
        {/* "No chat found" (info) or a failed search (error), from the shared search. */}
        {/* Focused, not announced, after a failed pick - see metadataLookupFromPick. */}
        <StatusMessage
          ref={lookupChatStatusRef}
          tabIndex={-1}
          className="focus-target"
          announce={!(metadataLookupFromPick && lookupChat.status)}
          announcedVia={metadataLookupFromPick && lookupChat.status ? 'focus' : undefined}
          variant={lookupChat.status?.variant}
          message={lookupChat.status?.text}
          nonce={lookupChat.statusNonce}
        />
        <StatusMessage
          ref={metadataLookupErrorRef}
          tabIndex={-1}
          className="focus-target"
          announce={!(metadataLookupFromPick && metadataLookupErrorStatus.message)}
          announcedVia={metadataLookupFromPick && metadataLookupErrorStatus.message ? 'focus' : undefined}
          variant={metadataLookupErrorStatus.message ? 'error' : undefined}
          message={metadataLookupErrorStatus.message}
          nonce={metadataLookupErrorStatus.nonce}
        />
        {metadataLookupResult?.chat && (
          <div className="mb-400">
            <p id="metadata-lookup-result" ref={metadataLookupResultRef} tabIndex={-1} className="focus-target">
              <span>{t('vector.metadataLookup.chatSummary.chatId')} {metadataLookupResult.chat.chatId}</span>
              <span> {t('vector.metadataLookup.chatSummary.pageLanguage')} {metadataLookupResult.chat.pageLanguage || t('vector.metadataBatchResults.emptyValue')}</span>
              <span> {t('vector.metadataLookup.chatSummary.interactions')} {fmtN(metadataLookupResult.chat.interactionCount)}</span>
              <span> {t('vector.metadataLookup.chatSummary.embeddings')} {fmtN(metadataLookupResult.chat.embeddingCount)}</span>
            </p>
            {/* Same static-table treatment as ChatViewer.js's pipeline step timeline
                (see the DocDB capability table above). */}
            <div className="table-scroll dt-container" tabIndex={0}>
            <table className="dataTable table-slim-padding">
              <caption className="sr-only">{t('vector.metadataLookup.title')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('vector.metadataLookup.columns.row')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.status')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.interactionObjectId')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.interactionDisplayId')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.embeddingId')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.embeddingInteractionId')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.attachedExpertFeedbackId')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.metadataExpertFeedbackId')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.attachedScore')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.metadataScore')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.chatPageLanguage')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.metadataPageLanguage')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.interactionLanguage')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.metadataInteractionLanguage')}</th>
                  <th scope="col">{t('vector.metadataLookup.columns.neverStale')}</th>
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
          </div>
        )}
        <GcdsHeading tag="h2" id="similar-chats-heading">{t('vector.similarChats')}</GcdsHeading>
        <GcdsText>
          {t('vector.similarChatsDescription')}
        </GcdsText>

        <SimilarChatsDashboard lang={activeLang} describedById="similar-chats-heading" />

      </div>
    </GcdsContainer>
  );
};

export default VectorPage;
