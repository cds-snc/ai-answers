import React, { useCallback, useEffect, useId, useState } from 'react';
import { GcdsButton, GcdsLink } from '@gcds-core/components-react';
import EvaluationService from '../../../services/EvaluationService.js';
import { formatDecimal, formatNumber } from '../../../utils/numberFormat.js';
import { useAnswerNumberLabel } from '../../../hooks/useAnswerNumberLabel.js';
import { useFocusOnChange } from '../../../hooks/useFocusOnChange.js';
import StatusMessage from '../../admin/StatusMessage.js';

const formatDate = (d) => {
  if (!d) return '';
  try {
    const dt = typeof d === 'string' ? new Date(d) : d;
    return isNaN(dt.getTime()) ? '' : dt.toLocaleString();
  } catch (_) { return ''; }
};

const renderChatLink = (chatId) => {
  if (chatId === null || typeof chatId === 'undefined') {
    return null;
  }
  const strId = String(chatId);
  if (!strId.length) {
    return null;
  }
  const url = `/en?chat=${encodeURIComponent(strId)}&review=1`;
  return (
    <GcdsLink href={url} target="_blank" lang="en">
      {strId}
    </GcdsLink>
  );
};

const EvalPanel = ({ message, t, lang = 'en', answerNumber }) => {
  // Show panel in review mode as requested (no longer hidden)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [reRunning, setReRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Set only on a successful delete - lets the render guard below fall
  // through to a minimal sr-only landing spot instead of unmounting the
  // whole panel (see that guard's own comment for why).
  const [justDeleted, setJustDeleted] = useState(false);
  // Boolean (not a counter) is fine here, unlike useFocusOnChange's usual
  // re-trigger caveat - justDeleted only ever goes false -> true once per
  // panel instance, there's no eval left afterward to delete again.
  const deletedHeadingRef = useFocusOnChange(justDeleted);
  // Namespaces the eval-summary dl's label id so multiple EvalPanel
  // instances (one per message) can render on one page without id
  // collisions - same reasoning as ExpertFeedbackPanel.js's own uid.
  const uid = useId();

  const { withAnswerNumber } = useAnswerNumberLabel(t, answerNumber);

  const getInteractionId = useCallback(() => (
    (message.interaction && (message.interaction._id || message.interaction.id)) || message.id
  ), [message]);

  const loadEval = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const interactionId = getInteractionId();
      const result = await EvaluationService.getEvaluation({ interactionId });
      setData(result?.evaluation || null);
    } catch (err) {
      setError(err.message || String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [getInteractionId]);

  // Fetch eagerly on mount rather than waiting for the reviewer to expand
  // the panel - same reasoning as PublicFeedbackPanel.js's own eager fetch:
  // db-chat.js's populate() list never includes autoEval, so before this,
  // message.interaction.autoEval is just a raw ObjectId (truthy, but no
  // .expertFeedback.totalScore) - the summary's score pill stayed blank
  // until the reviewer opened (and re-closed) the panel once, which read as
  // broken rather than as a real value.
  useEffect(() => {
    if (!message) return;
    const interactionForFetch = message.interaction || {};
    if (!interactionForFetch.autoEval && !message.autoEval) return;
    loadEval();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  const handleToggle = useCallback(async (e) => {
    try {
      // The eager-mount effect above already fetches once - without this
      // guard (matching PublicFeedbackPanel.js's own handleToggle), opening
      // the panel shortly after mount double-fetches the same data.
      if (data) return;
      // Load on open
      if (e && e.target && !e.target.open) {
        await loadEval();
      } else {
        await loadEval();
      }
    } catch (_) { /* noop */ }
  }, [data, loadEval]);

  const handleReRun = useCallback(async () => {
    try {
      setReRunning(true);
      setError(null);
      setData(null);
      setLoading(true);
      const interactionId = getInteractionId();
      await EvaluationService.reEvaluate({ interactionId });
      // Fetch fresh evaluation from DB to ensure all fields (including nested) are present
      await loadEval();
      // Attach to message reference for downstream consumers
      if (message.interaction) {
        // autoEval id updated on server; we keep it as-is or refresh elsewhere
      } else {
        // no-op
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setReRunning(false);
      setLoading(false);
    }
  }, [getInteractionId, loadEval, message]);

  const handleDelete = useCallback(async () => {
    // Note: window.confirm()'s OK/Cancel buttons render in the browser/OS
    // language, not the app's selected locale — only the message text above
    // is translated. Matches existing precedent (VectorPage.js, UsersPage.js
    // also use window.confirm() for destructive actions). Flagged as a known
    // limitation, out of scope for this PR.
    if (!window.confirm(t('common.confirmDelete'))) {
      return;
    }
    try {
      setDeleting(true);
      setError(null);
      const interactionId = getInteractionId();
      await EvaluationService.deleteEvaluation({ interactionId });
      setData(null);
      if (message.interaction) {
        message.interaction.autoEval = undefined;
      } else {
        message.autoEval = undefined;
      }
      setJustDeleted(true);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setDeleting(false);
    }
  }, [getInteractionId, message, t]);

  if (!message) return null;

  const evalObj = data || message.interaction?.autoEval || message.autoEval || null;
  const sentenceTrace = Array.isArray(evalObj?.sentenceMatchTrace) ? evalObj.sentenceMatchTrace : [];
  const sim = evalObj?.similarityScores || {};
  const noMatch = evalObj?.hasMatches === false;
  const noMatchReasonType = evalObj?.noMatchReasonType || '';
  const noMatchReason = noMatch
    ? (noMatchReasonType
        ? t(`eval.noMatchReasonTypes.${noMatchReasonType}`, noMatchReasonType)
        : evalObj?.noMatchReasonMsg || t('eval.noMatchReasonTypes.unknown'))
    : '';

  const fmt = (v) => formatDecimal(v, lang);

  // Translation helper: if the translator returns the raw key (meaning missing),
  // fall back to an alternate key or provided default string.
  const tr = (key, fallbackKeyOrString) => {
    try {
      const res = t(key);
      if (typeof res === 'string' && (res === key || res.length === 0)) {
        // Try fallbackKeyOrString as a key first, then literal string
        const fb = typeof fallbackKeyOrString === 'string' ? t(fallbackKeyOrString) : '';
        if (fb && fb !== fallbackKeyOrString) return fb;
        return typeof fallbackKeyOrString === 'string' ? fallbackKeyOrString : key;
      }
      return res;
    } catch (e) {
      return typeof fallbackKeyOrString === 'string' ? fallbackKeyOrString : key;
    }
  };

  // Text, not a bare glyph or color alone — a checkmark with no label isn't
  // reliably announced by screen readers (WCAG 1.4.1/4.1.2). Same
  // .label.normal pill pattern used for ExpertFeedbackPanel.js's score pill.
  const baseEvalTitle = t('reviewPanels.autoEvalTitle') || t('reviewPanels.evaluation');
  const evalScore = evalObj && evalObj.expertFeedback && typeof evalObj.expertFeedback.totalScore !== 'undefined' && evalObj.expertFeedback.totalScore !== null
    ? evalObj.expertFeedback.totalScore
    : null;
  const evalTitle = withAnswerNumber(baseEvalTitle);

  // A successful delete nulls evalObj, which would otherwise unmount this
  // whole component (summary included) with nothing left to catch focus -
  // the disappearing-controls-drop-focus pattern (see FilterPanel.js/
  // BatchList.js). Whether this panel should instead fall through to a
  // persistent "Run evaluation" empty state is a product question for the
  // team, out of scope here - this only lands focus + an announcement,
  // with no visible change from today's (invisible) deleted state.
  // announce={false} + announcedVia="focus": focus itself reads the
  // message, so the shared live announcer doesn't also speak it.
  if (!evalObj) {
    if (justDeleted) {
      return (
        <StatusMessage
          ref={deletedHeadingRef}
          tag="h4"
          className="sr-only"
          tabIndex={-1}
          announce={false}
          announcedVia="focus"
          message={withAnswerNumber(t('reviewPanels.autoEvalDeletedAnnouncement'))}
        />
      );
    }
    return null;
  }

  return (
    <details
      className="review-details"
      onToggle={handleToggle}
    >
      <summary>
        {evalTitle}
        {evalScore !== null && (
          <span className="label label--summary-status normal">
            {t('reviewPanels.scoreSuffix').replace('{score}', () => formatNumber(evalScore, lang))}
          </span>
        )}
      </summary>
      <div className="review-panel eval-panel">
        <div className="actions" style={{ marginBottom: '1rem' }}>
          <GcdsButton
            onClick={handleReRun}
            disabled={reRunning || deleting}
            className="hydrated"
            aria-label={withAnswerNumber(reRunning ? t('eval.reRunning') : t('eval.reRun'))}
          >
            {reRunning ? t('eval.reRunning') : t('eval.reRun')}
          </GcdsButton>
          <GcdsButton
            onClick={handleDelete}
            buttonRole="danger"
            disabled={deleting}
            className="hydrated"
            style={{ marginLeft: '0.5rem' }}
            aria-label={withAnswerNumber(deleting ? t('common.deleting') : t('reviewPanels.deleteEvaluation'))}
          >
            {deleting ? t('common.deleting') : t('reviewPanels.deleteEvaluation')}
          </GcdsButton>
        </div>
        {/* TODO(sync-with-loader-updates): a stale table often sits below
            this line during a refetch - once feat/scoped-loading-overlay
            merges, swap for LoadingOverlay's `scoped` prop to cover it
            instead of just announcing above it. */}
        {loading && <StatusMessage loading message={t('common.loading')} />}
        {error && (
          <StatusMessage variant="error">
            {t('common.error')}: <code lang="en">{error}</code>
          </StatusMessage>
        )}

        {evalObj ? (
          <>
            <div className="eval-summary">
        {noMatch ? (
          <p>
            <strong>{t('eval.noMatch')}</strong>
            <br />
            {noMatchReason && (
              <>
                <strong>{t('eval.reason')}:</strong> {noMatchReason}
              </>
            )}
          </p>
        ) : (
          <>
            {/* dl has no <caption>-equivalent (that's table-only) - this
                <p> is both the visible title and the dl's accessible name
                via aria-labelledby, one source of truth rather than a
                second, invisible copy. Was a visible <p><strong> before
                the table->dl conversion; got dropped in that conversion
                with nothing replacing it - restoring it here. */}
            <p id={`${uid}-eval-summary-title`}><strong>{t('eval.eval')}</strong></p>
            <dl aria-labelledby={`${uid}-eval-summary-title`}>
              {/* New fields: show above Processed */}
              {evalObj.hasMatches && evalObj.expertFeedback && typeof evalObj.expertFeedback.totalScore !== 'undefined' ? (
                <>
                  <dt>{tr('eval.totalScore')}</dt>
                  <dd>{evalObj.expertFeedback.totalScore === null || typeof evalObj.expertFeedback.totalScore === 'undefined' ? '' : String(evalObj.expertFeedback.totalScore)}</dd>
                </>
              ) : null}
              {evalObj.hasMatches && evalObj.interactionUpdatedAt ? (
                <>
                  <dt>{tr('eval.interactionUpdatedAt')}</dt>
                  <dd>{formatDate(evalObj.interactionUpdatedAt)}</dd>
                </>
              ) : null}
              {evalObj.referringUrl ? (
                <>
                  <dt>{tr('eval.referringUrl')}</dt>
                  <dd><GcdsLink href={evalObj.referringUrl} target="_blank" lang={lang}>{evalObj.referringUrl}</GcdsLink></dd>
                </>
              ) : null}

              <dt>{t('eval.processed')}</dt>
              <dd>{evalObj.processed ? t('common.yes') : t('common.no')}</dd>
              <dt>{t('eval.hasMatches')}</dt>
              <dd>{evalObj.hasMatches ? t('common.yes') : t('common.no')}</dd>
              <dt>{t('eval.fallback')}</dt>
              <dd>{evalObj.fallbackType || t('reviewPanels.none')}</dd>
              {evalObj.expertFeedback ? (
                <>
                  <dt>{t('eval.expertFeedbackId')}</dt>
                  <dd>{typeof evalObj.expertFeedback === 'object' && evalObj.expertFeedback !== null ? String(evalObj.expertFeedback._id || evalObj.expertFeedback.id || '') : String(evalObj.expertFeedback)}</dd>
                </>
              ) : null}
              {(evalObj._modelMeta && (evalObj._modelMeta.sentenceCompareModel || evalObj._modelMeta.fallbackCompareModel)) ? (
                <>
                  <dt>{tr('eval.modelData', 'Model data')}</dt>
                  <dd>
                    <ul>
                      {evalObj._modelMeta.sentenceCompareModel ? (
                        <li>{t('reviewPanels.sentenceCompare')}: {evalObj._modelMeta.sentenceCompareModel}</li>
                      ) : null}
                      {evalObj._modelMeta.fallbackCompareModel ? (
                        <li>{t('reviewPanels.fallbackCompare')}: {evalObj._modelMeta.fallbackCompareModel}</li>
                      ) : null}
                    </ul>
                  </dd>
                </>
              ) : null}
              {evalObj.noMatchReasonType || evalObj.noMatchReasonMsg ? (
                <>
                  <dt>{t('eval.noMatchReason')}</dt>
                  <dd>
                    {evalObj.noMatchReasonType
                      ? t(`eval.noMatchReasonTypes.${evalObj.noMatchReasonType}`, evalObj.noMatchReasonType)
                      : evalObj.noMatchReasonMsg || ''}
                  </dd>
                </>
              ) : null}
              {evalObj.fallbackSourceChatId ? (
                <>
                  <dt>{t('eval.fallbackSourceChatId')}</dt>
                  <dd>{renderChatLink(evalObj.fallbackSourceChatId)}</dd>
                </>
              ) : null}
              {evalObj.matchedCitationInteractionId ? (
                <>
                  <dt>{t('eval.matchedCitationInteractionId')}</dt>
                  <dd>{evalObj.matchedCitationInteractionId}</dd>
                </>
              ) : null}
              {evalObj.matchedCitationChatId ? (
                <>
                  <dt>{t('eval.matchedCitationChatId')}</dt>
                  <dd>{renderChatLink(evalObj.matchedCitationChatId)}</dd>
                </>
              ) : null}
              <dt>{t('eval.createdAt')}</dt>
              <dd>{formatDate(evalObj.createdAt)}</dd>
              <dt>{t('eval.updatedAt')}</dt>
              <dd>{formatDate(evalObj.updatedAt)}</dd>
            </dl>
          </>
        )}
      </div>
      {/* Stage timeline - collapsible */}
      <details className="review-details">
        <summary>{t('reviewPanels.stageTimeline')}</summary>
        {Array.isArray(evalObj?.stageTimeline) && evalObj.stageTimeline.length > 0 ? (
          <div>
            <table className="review-table table-slim-padding">
              <caption className="sr-only">{t('reviewPanels.stageTimeline')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('reviewPanels.timestamp')}</th>
                  <th scope="col">{t('reviewPanels.stage')}</th>
                  <th scope="col">{t('reviewPanels.status')}</th>
                  <th scope="col">{t('reviewPanels.code')}</th>
                  <th scope="col">{t('reviewPanels.message')}</th>
                  <th scope="col">{t('reviewPanels.details')}</th>
                </tr>
              </thead>
              <tbody>
                {evalObj.stageTimeline.map((s, i) => (
                  <tr key={`stage-${i}`}>
                    <td>{formatDate(s.timestamp)}</td>
                    <td>{s.stage || ''}</td>
                    <td>{s.status || ''}</td>
                    <td>{s.code || ''}</td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{s.message || ''}</td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>
                      <pre style={{ margin: 0, maxHeight: '200px', overflow: 'auto', background: 'transparent', padding: 0 }}>{JSON.stringify(s.details || {}, null, 2)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-100">
              <strong>{t('reviewPanels.rawTimeline')}:</strong>
              <pre style={{ maxHeight: '240px', overflow: 'auto', background: '#f8f8f8', padding: '0.5rem' }}>{JSON.stringify(evalObj.stageTimeline, null, 2)}</pre>
            </div>
          </div>
        ) : (
          <div>{t('reviewPanels.noStageTimeline')}</div>
        )}
      </details>
      {/* evalObj.details has no backing Eval schema field - always empty in
          production today, not just this seed data. An empty table (no
          rows, just its own outer border) rendered as a stray thin line
          between Stage timeline and Sentence match trace with nothing
          around it explaining why - guarding on there being at least one
          entry instead of rendering an empty dl every time. */}
      {Object.keys(evalObj.details || {}).length > 0 ? (
        <div className="eval-details">
          <dl>
            {Object.entries(evalObj.details).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{t(`eval.metrics.${key}`, key)}</dt>
                <dd>{String(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      ) : null}
      {/* sentenceTrace table removed — replaced by the collapsible "Sentence match trace" panel below to avoid duplication */}
      

            {/* Sentence match trace - collapsible */}
            <details className="review-details">
              <summary>{t('reviewPanels.sentenceMatchTrace')}</summary>
              {sentenceTrace.length > 0 ? (
                <table className="review-table table-slim-padding">
                  <caption className="sr-only">{t('reviewPanels.sentenceMatchTrace')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('reviewPanels.sourceSentenceIndex')}</th>
                      <th scope="col">{t('reviewPanels.sourceText')}</th>
                      <th scope="col">{t('reviewPanels.matchedChatId')}</th>
                      <th scope="col">{t('reviewPanels.matchedSentenceIndex')}</th>
                      <th scope="col">{t('reviewPanels.matchedText')}</th>
                      <th scope="col">{t('reviewPanels.similarity')}</th>
                      <th scope="col">{t('reviewPanels.matchedScore')}</th>
                      <th scope="col">{t('reviewPanels.matchStatus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentenceTrace.map((s, i) => (
                      <tr key={i}>
                        <td>{s.sourceIndex}</td>
                        <td>{s.sourceSentenceText || ''}</td>
                        <td>{renderChatLink(s.matchedChatId) || ''}</td>
                        <td>{typeof s.matchedSentenceIndex !== 'undefined' ? s.matchedSentenceIndex : ''}</td>
                        <td>{s.matchedSentenceText || ''}</td>
                        <td>{typeof s.similarity !== 'undefined' ? fmt(s.similarity) : ''}</td>
                        <td>{typeof s.matchedExpertFeedbackSentenceScore !== 'undefined' ? fmt(s.matchedExpertFeedbackSentenceScore) : ''}</td>
                        <td>{s.matchStatus || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div>{t('reviewPanels.noSentenceTraces')}</div>
              )}
            </details>

            {/* Fallback details section */}
            <details className="review-details">
              <summary>{t('reviewPanels.fallbackDetails')}</summary>
              <div>
                <dl>
                  <dt>{t('reviewPanels.fallbackType')}</dt>
                  <dd>{evalObj.fallbackType || ''}</dd>
                  <dt>{t('reviewPanels.fallbackSourceChatId')}</dt>
                  <dd>{renderChatLink(evalObj.fallbackSourceChatId) || ''}</dd>
                  <dt>{t('reviewPanels.fallbackCompareUsed')}</dt>
                  <dd>{evalObj.fallbackCompareUsed ? t('common.yes') : t('common.no')}</dd>
                </dl>

                {/* Show fallback answer text and citation first (if present) */}
                {evalObj.fallbackCandidateAnswerText ? (
                  <div className="mt-100">
                    <dl>
                      <dt className="stacked">{t('reviewPanels.fallbackCandidateAnswer')}</dt>
                      <dd className="stacked" style={{ whiteSpace: 'pre-wrap' }}>{evalObj.fallbackCandidateAnswerText}</dd>
                      {evalObj.fallbackCandidateCitation ? (
                        <>
                          <dt className="stacked">{t('reviewPanels.fallbackCandidateCitation')}</dt>
                          <dd className="stacked"><GcdsLink href={evalObj.fallbackCandidateCitation} target="_blank" lang={lang}>{evalObj.fallbackCandidateCitation}</GcdsLink></dd>
                        </>
                      ) : null}
                    </dl>
                  </div>
                ) : null}

                {evalObj.fallbackCompareMeta ? (
                  <div className="mt-200">
                    <table className="review-table table-slim-padding">
                      <caption>{t('reviewPanels.fallbackCompareMeta')}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t('reviewPanels.field')}</th>
                          <th scope="col">{t('reviewPanels.value')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(evalObj.fallbackCompareMeta).map(([k, v]) => (
                          <tr key={`fbm-${k}`}>
                            <td>{k}</td>
                            <td>{String(v)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {evalObj.fallbackCompareChecks ? (
                  <div className="mt-200">
                    <table className="review-table table-slim-padding">
                      <caption>{t('reviewPanels.fallbackCompareChecks')}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t('reviewPanels.check')}</th>
                          <th scope="col">{t('reviewPanels.pass')}</th>
                          <th scope="col">{t('reviewPanels.details')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(evalObj.fallbackCompareChecks).map(([k, v]) => (
                          <tr key={`fcc-${k}`}>
                            <td>{k}</td>
                            <td>{typeof v === 'object' && v !== null && 'p' in v ? fmt(v.p) : ''}</td>
                            <td><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}</pre></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {/* raw fallback compare data intentionally not shown */}
              </div>
            </details>

            {/* Agent candidate choices per source sentence (if available) */}
            {sentenceTrace.some(s => Array.isArray(s.candidateChoices) && s.candidateChoices.length) ? (
              <details className="review-details">
                <summary>{t('reviewPanels.agentCandidateChoices')}</summary>
                <table className="review-table table-slim-padding">
                  <caption className="sr-only">{t('reviewPanels.agentCandidateChoices')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('reviewPanels.sourceSentenceIndex')}</th>
                      <th scope="col">{t('reviewPanels.candidateIndex')}</th>
                      <th scope="col">{t('reviewPanels.matchedChatId')}</th>
                      <th scope="col">{t('reviewPanels.text')}</th>
                      <th scope="col">{t('reviewPanels.matchedSentenceIndex')}</th>
                      <th scope="col">{t('reviewPanels.similarity')}</th>
                      <th scope="col">{t('reviewPanels.numbers')}</th>
                      <th scope="col">{t('reviewPanels.dates_times')}</th>
                      <th scope="col">{t('reviewPanels.negation')}</th>
                      <th scope="col">{t('reviewPanels.entities')}</th>
                      <th scope="col">{t('reviewPanels.quantifiers')}</th>
                      <th scope="col">{t('reviewPanels.conditionals')}</th>
                      <th scope="col">{t('reviewPanels.connectives')}</th>
                      <th scope="col">{t('reviewPanels.modifiers')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentenceTrace.map((s, si) => (
                      Array.isArray(s.candidateChoices) ? s.candidateChoices.map((c, ci) => {
                        const checks = c.checks || {};
                        const cell = (key) => {
                          const obj = checks && checks[key] ? checks[key] : null;
                          if (!obj) return '';
                          const p = typeof obj.p !== 'undefined' ? String(obj.p) : '';
                          const r = obj.r ? ` - ${obj.r}` : '';
                          return `${p}${r}`;
                        };
                        return (
                          <tr key={`cand-${si}-${ci}`}>
                            <td>{s.sourceIndex}</td>
                            <td>{ci}</td>
                            <td>{renderChatLink(c.matchedChatId) || ''}</td>
                            <td>{c.text || ''}</td>
                            <td>{typeof c.matchedSentenceIndex !== 'undefined' ? c.matchedSentenceIndex : ''}</td>
                            <td>{typeof c.similarity !== 'undefined' ? fmt(c.similarity) : ''}</td>
                            <td>{cell('numbers')}</td>
                            <td>{cell('dates_times')}</td>
                            <td>{cell('negation')}</td>
                            <td>{cell('entities')}</td>
                            <td>{cell('quantifiers')}</td>
                            <td>{cell('conditionals')}</td>
                            <td>{cell('connectives')}</td>
                            <td>{cell('modifiers')}</td>
                          </tr>
                        );
                      }) : null
                    ))}
                  </tbody>
                </table>
              </details>
            ) : null}

            {/* Similarity scores - collapsible */}
            <details className="review-details">
              <summary>{t('reviewPanels.similarityScores')}</summary>
              <table className="review-table table-slim-padding">
                <caption className="sr-only">{t('reviewPanels.similarityScores')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('reviewPanels.metric')}</th>
                    <th scope="col">{t('reviewPanels.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(sim.sentences) && sim.sentences.length > 0 && sim.sentences.map((val, idx) => (
                    <tr key={`sim-s-${idx}`}>
                      <td>{t('reviewPanels.sentence')} {idx + 1}</td>
                      <td>{fmt(val)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>{t('reviewPanels.citation')}</td>
                    <td>{typeof sim.citation !== 'undefined' ? fmt(sim.citation) : t('reviewPanels.notAvailable')}</td>
                  </tr>
                </tbody>
              </table>
            </details>

            {/* Agent usage - collapsible */}
            <details className="review-details">
              <summary>{t('reviewPanels.agentUsage')}</summary>
              <div>
                <strong>{t('reviewPanels.sentenceCompareUsed')}:</strong> {evalObj.sentenceCompareUsed ? t('common.yes') : t('common.no')}
              </div>
              {evalObj.sentenceCompareMeta ? (
                <table className="review-table table-slim-padding mt-100">
                  {/* Distinct from the "Sentence compare used: Yes/No" statement right
                      above - that's a boolean fact, this table is the sentence-compare
                      agent's own metadata (provider/model/tokens/latency), a different
                      thing. Reuses reviewPanels.sentenceCompare ("Sentence-compare"),
                      already used the same way in the eval summary's Model data row,
                      rather than a caption identical to the adjacent statement's wording. */}
                  <caption className="sr-only">{t('reviewPanels.sentenceCompare')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('reviewPanels.field')}</th>
                      <th scope="col">{t('reviewPanels.value')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(evalObj.sentenceCompareMeta).map(([k, v]) => (
                      <tr key={`scm-${k}`}>
                        <td>{k}</td>
                        <td>{String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              <div className="mt-200">
                <strong>{t('reviewPanels.fallbackCompareUsed')}:</strong> {evalObj.fallbackCompareUsed ? t('common.yes') : t('common.no')}
              </div>
              {evalObj.fallbackCompareMeta ? (
                <table className="review-table table-slim-padding mt-100">
                  {/* Same reasoning as the sentence-compare table's caption above -
                      distinct from the adjacent "Fallback compare used: Yes/No"
                      statement, reusing reviewPanels.fallbackCompare ("Fallback-compare"). */}
                  <caption className="sr-only">{t('reviewPanels.fallbackCompare')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('reviewPanels.field')}</th>
                      <th scope="col">{t('reviewPanels.value')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(evalObj.fallbackCompareMeta).map(([k, v]) => (
                      <tr key={`fcm-${k}`}>
                        <td>{k}</td>
                        <td>{String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              {evalObj.fallbackCompareChecks ? (
                <div className="mt-200">
                  <table className="review-table table-slim-padding">
                    <caption>{t('reviewPanels.fallbackCompareChecks')}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('reviewPanels.check')}</th>
                        <th scope="col">{t('reviewPanels.pass')}</th>
                        <th scope="col">{t('reviewPanels.details')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(evalObj.fallbackCompareChecks).map(([k, v]) => (
                        <tr key={`fcc-${k}`}>
                          <td>{k}</td>
                          <td>{typeof v === 'object' && v !== null && 'p' in v ? fmt(v.p) : ''}</td>
                          <td><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}</pre></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {/* raw fallback compare data intentionally not shown */}
              </details>
          </>
        ) : (
          <>
            {!loading && (
              <div>
                {t('reviewPanels.noEvaluation')}
                <div className="mt-200">
                  <GcdsButton
                    onClick={handleReRun}
                    disabled={reRunning}
                    className="hydrated"
                    aria-label={withAnswerNumber(reRunning ? t('common.processing') : t('reviewPanels.runEvaluation'))}
                  >
                    {reRunning ? t('common.processing') : t('reviewPanels.runEvaluation')}
                  </GcdsButton>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
};

export default EvalPanel;
