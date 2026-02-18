import React, { useCallback, useState } from 'react';
import { GcdsDetails, GcdsButton } from '@cdssnc/gcds-components-react';
import EvaluationService from '../../../services/EvaluationService.js';

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
    <a href={url} target="_blank" rel="noopener noreferrer">
      {strId}
    </a>
  );
};

const EvalPanel = ({ message, t }) => {
  // Show panel in review mode as requested (no longer hidden)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [reRunning, setReRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleToggle = useCallback(async (e) => {
    try {
      // Load on open
      if (e && e.target && !e.target.open) {
        await loadEval();
      } else {
        await loadEval();
      }
    } catch (_) { /* noop */ }
  }, [loadEval]);

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
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setDeleting(false);
    }
  }, [getInteractionId, message]);

  if (!message) return null;

  const evalObj = data || message.interaction?.eval || message.eval || null;
  const sentenceTrace = Array.isArray(evalObj?.sentenceMatchTrace) ? evalObj.sentenceMatchTrace : [];
  const sim = evalObj?.similarityScores || {};
  const noMatch = evalObj?.hasMatches === false;
  const noMatchReason = noMatch ? (evalObj.noMatchReasonMsg || 'No reason provided') : '';

  const fmt = (v) => {
    if (v === null || typeof v === 'undefined' || v === '') return v;
    const n = Number(v);
    if (Number.isNaN(n)) return v;
    return n.toFixed(3);
  };

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

  // Build title with score indicator
  const baseEvalTitle = t('reviewPanels.autoEvalTitle') || t('reviewPanels.evaluation') || 'Automated evaluation';
  let evalTitleSuffix = '';
  if (evalObj && evalObj.expertFeedback && typeof evalObj.expertFeedback.totalScore !== 'undefined' && evalObj.expertFeedback.totalScore !== null) {
    evalTitleSuffix = ` \u2714 ${evalObj.expertFeedback.totalScore}`;
  }
  const evalTitle = baseEvalTitle + evalTitleSuffix;

  return (
    <GcdsDetails
      detailsTitle={evalTitle}
      className="review-details"
      tabIndex="0"
      onGcdsClick={handleToggle}
    >
      <div className="review-panel eval-panel">
        <div className="actions" style={{ marginBottom: '1rem' }}>
          <GcdsButton onClick={handleReRun} disabled={reRunning || deleting} className="hydrated">
            {reRunning ? t('eval.reRunning', 'Re-running...') : t('eval.reRun', 'Re-run')}
          </GcdsButton>
          <GcdsButton onClick={handleDelete} variant="danger" disabled={deleting} className="hydrated" style={{ marginLeft: '0.5rem' }}>
            {deleting ? (t('common.deleting') || 'Deleting...') : (t('reviewPanels.deleteEvaluation') || 'Delete Evaluation')}
          </GcdsButton>
        </div>
        {loading && <div>{t('common.loading') || 'Loading...'}</div>}
        {error && <div className="error">{t('common.error') || 'Error'}: {error}</div>}

        {evalObj ? (
          <>
            <div className="eval-summary">
        {noMatch ? (
          <p>
            <strong>{t('eval.noMatch', 'No match found for this interaction.')}</strong>
            <br />
            {noMatchReason && (
              <>
                <em>{t('eval.reason', 'Reason')}:</em> {noMatchReason}
              </>
            )}
          </p>
        ) : (
          <>
            <p>
              <strong>{t('eval.eval', 'Evaluation')}:</strong>
            </p>
            <table className="table">
              <tbody>
                {/* New fields: show above Processed */}
                {evalObj.hasMatches && evalObj.expertFeedback && typeof evalObj.expertFeedback.totalScore !== 'undefined' ? (
                  <tr>
                    <td>{tr('eval.totalScore', 'Score')}:</td>
                    <td>{evalObj.expertFeedback.totalScore === null || typeof evalObj.expertFeedback.totalScore === 'undefined' ? '' : String(evalObj.expertFeedback.totalScore)}</td>
                  </tr>
                ) : null}
                {evalObj.hasMatches && evalObj.interactionUpdatedAt ? (
                  <tr>
                    <td>{tr('eval.interactionUpdatedAt', 'Date of Chat')}:</td>
                    <td>{formatDate(evalObj.interactionUpdatedAt)}</td>
                  </tr>
                ) : null}
                {evalObj.referringUrl ? (
                  <tr>
                    <td>{tr('eval.referringUrl', 'Referring URL')}:</td>
                    <td><a href={evalObj.referringUrl} target="_blank" rel="noopener noreferrer">{evalObj.referringUrl}</a></td>
                  </tr>
                ) : null}

                <tr>
                  <td>{t('eval.processed', 'Processed')}:</td>
                  <td>{evalObj.processed ? (t('common.yes') || 'yes') : (t('common.no') || 'no')}</td>
                </tr>
                <tr>
                  <td>{t('eval.hasMatches', 'Has matches')}:</td>
                  <td>{evalObj.hasMatches ? (t('common.yes') || 'yes') : (t('common.no') || 'no')}</td>
                </tr>
                <tr>
                  <td>{t('eval.fallback', 'Fallback')}:</td>
                  <td>{evalObj.fallbackType || (t('reviewPanels.none') || 'none')}</td>
                </tr>
                {evalObj.expertFeedback ? (
                  <tr>
                    <td>{t('eval.expertFeedbackId', 'Expert feedback id')}:</td>
                    <td>{typeof evalObj.expertFeedback === 'object' && evalObj.expertFeedback !== null ? String(evalObj.expertFeedback._id || evalObj.expertFeedback.id || '') : String(evalObj.expertFeedback)}</td>
                  </tr>
                ) : null}
                {(evalObj._modelMeta && (evalObj._modelMeta.sentenceCompareModel || evalObj._modelMeta.fallbackCompareModel)) ? (
                  <tr>
                    <td>{tr('eval.modelData', 'Model data')}:</td>
                    <td>
                      {evalObj._modelMeta.sentenceCompareModel ? `${t('reviewPanels.sentenceCompare') || 'Sentence-compare'}: ${evalObj._modelMeta.sentenceCompareModel}` : null}
                      {evalObj._modelMeta.sentenceCompareModel && evalObj._modelMeta.fallbackCompareModel ? ' • ' : ''}
                      {evalObj._modelMeta.fallbackCompareModel ? `${t('reviewPanels.fallbackCompare') || 'Fallback-compare'}: ${evalObj._modelMeta.fallbackCompareModel}` : null}
                    </td>
                  </tr>
                ) : null}
                {evalObj.noMatchReasonType || evalObj.noMatchReasonMsg ? (
                  <tr>
                    <td>{t('eval.noMatchReason', 'No-match reason')}:</td>
                    <td>{evalObj.noMatchReasonType || ''} {evalObj.noMatchReasonMsg ? `- ${evalObj.noMatchReasonMsg}` : ''}</td>
                  </tr>
                ) : null}
                {evalObj.fallbackSourceChatId ? (
                  <tr>
                    <td>{t('eval.fallbackSourceChatId', 'Fallback source chatId')}:</td>
                    <td>{renderChatLink(evalObj.fallbackSourceChatId)}</td>
                  </tr>
                ) : null}
                {evalObj.matchedCitationInteractionId ? (
                  <tr>
                    <td>{t('eval.matchedCitationInteractionId', 'Matched citation interactionId')}:</td>
                    <td>{evalObj.matchedCitationInteractionId}</td>
                  </tr>
                ) : null}
                {evalObj.matchedCitationChatId ? (
                  <tr>
                    <td>{t('eval.matchedCitationChatId', 'Matched citation chatId')}:</td>
                    <td>{renderChatLink(evalObj.matchedCitationChatId)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td>{t('eval.createdAt', 'Created at')}:</td>
                  <td>{formatDate(evalObj.createdAt)}</td>
                </tr>
                <tr>
                  <td>{t('eval.updatedAt', 'Updated at')}:</td>
                  <td>{formatDate(evalObj.updatedAt)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>
      {/* Stage timeline - collapsible */}
      <GcdsDetails detailsTitle={t('reviewPanels.stageTimeline') || 'Stage timeline'} className="mt-200">
        {Array.isArray(evalObj?.stageTimeline) && evalObj.stageTimeline.length > 0 ? (
          <div>
            <table className="review-table">
              <thead>
                <tr>
                  <th>{t('reviewPanels.timestamp') || 'Timestamp'}</th>
                  <th>{t('reviewPanels.stage') || 'Stage'}</th>
                  <th>{t('reviewPanels.status') || 'Status'}</th>
                  <th>{t('reviewPanels.code') || 'Code'}</th>
                  <th>{t('reviewPanels.message') || 'Message'}</th>
                  <th>{t('reviewPanels.details') || 'Details'}</th>
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
              <strong>{t('reviewPanels.rawTimeline') || 'Raw timeline (JSON)'}:</strong>
              <pre style={{ maxHeight: '240px', overflow: 'auto', background: '#f8f8f8', padding: '0.5rem' }}>{JSON.stringify(evalObj.stageTimeline, null, 2)}</pre>
            </div>
          </div>
        ) : (
          <div>{t('reviewPanels.noStageTimeline') || 'No stage timeline available.'}</div>
        )}
      </GcdsDetails>
      <div className="eval-details">
        <table className="table">
          <tbody>
            {Object.entries(evalObj.details || {}).map(([key, value]) => (
              <tr key={key}>
                <td>{t(`eval.metrics.${key}`, key)}</td>
                <td>{String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* sentenceTrace table removed — replaced by the collapsible "Sentence match trace" panel below to avoid duplication */}
      

            {/* Sentence match trace - collapsible */}
            <GcdsDetails detailsTitle={t('reviewPanels.sentenceMatchTrace') || 'Sentence match trace'} className="mt-200">
              {sentenceTrace.length > 0 ? (
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>{t('reviewPanels.sourceSentenceIndex') || 'Source sentence index'}</th>
                      <th>{t('reviewPanels.sourceText') || 'Source text'}</th>
                      <th>{t('reviewPanels.matchedChatId') || 'Matched chatId'}</th>
                      <th>{t('reviewPanels.matchedSentenceIndex') || 'Matched sentence index'}</th>
                      <th>{t('reviewPanels.matchedText') || 'Matched text'}</th>
                      <th>{t('reviewPanels.similarity') || 'Similarity'}</th>
                      <th>{t('reviewPanels.matchedScore') || 'Matched score'}</th>
                      <th>{t('reviewPanels.matchStatus') || 'Match status'}</th>
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
                <div>{t('reviewPanels.noSentenceTraces') || 'No sentence match traces available.'}</div>
              )}
            </GcdsDetails>

            {/* Fallback details section */}
            <GcdsDetails detailsTitle={t('reviewPanels.fallbackDetails') || 'Fallback details'} className="mt-200">
              <div>
                <div><strong>{t('reviewPanels.fallbackType') || 'Fallback type'}:</strong> {evalObj.fallbackType || ''}</div>
                <div><strong>{t('reviewPanels.fallbackSourceChatId') || 'Fallback source chatId'}:</strong> {renderChatLink(evalObj.fallbackSourceChatId) || ''}</div>
                <div><strong>{t('reviewPanels.fallbackCompareUsed') || 'Fallback compare used'}:</strong> {evalObj.fallbackCompareUsed ? (t('common.yes') || 'yes') : (t('common.no') || 'no')}</div>

                {/* Show fallback answer text and citation first (if present) */}
                {evalObj.fallbackCandidateAnswerText ? (
                  <div className="mt-100">
                    <h5>{t('reviewPanels.fallbackCandidateAnswer') || 'Fallback candidate answer'}</h5>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{evalObj.fallbackCandidateAnswerText}</div>
                    {evalObj.fallbackCandidateCitation ? (
                      <div><strong>{t('reviewPanels.fallbackCandidateCitation') || 'Candidate citation'}:</strong> {evalObj.fallbackCandidateCitation}</div>
                    ) : null}
                  </div>
                ) : null}

                {evalObj.fallbackCompareMeta ? (
                  <div className="mt-100">
                    <h5>{t('reviewPanels.fallbackCompareMeta') || 'Fallback compare meta'}</h5>
                    <table className="review-table">
                      <thead>
                        <tr>
                          <th>{t('reviewPanels.field') || 'Field'}</th>
                          <th>{t('reviewPanels.value') || 'Value'}</th>
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
                    <h5>{t('reviewPanels.fallbackCompareChecks') || 'Fallback compare checks'}</h5>
                    <table className="review-table">
                      <thead>
                        <tr>
                          <th>{t('reviewPanels.check') || 'Check'}</th>
                          <th>{t('reviewPanels.pass') || 'Pass'}</th>
                          <th>{t('reviewPanels.details') || 'Details'}</th>
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
            </GcdsDetails>

            {/* Agent candidate choices per source sentence (if available) */}
            {sentenceTrace.some(s => Array.isArray(s.candidateChoices) && s.candidateChoices.length) ? (
              <GcdsDetails detailsTitle={t('reviewPanels.agentCandidateChoices') || 'Agent candidate choices'} className="mt-200">
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>{t('reviewPanels.sourceSentenceIndex') || 'Source sentence index'}</th>
                      <th>{t('reviewPanels.candidateIndex') || 'Candidate index'}</th>
                      <th>{t('reviewPanels.matchedChatId') || 'Matched chatId'}</th>
                      <th>{t('reviewPanels.text') || 'Text'}</th>
                      <th>{t('reviewPanels.matchedSentenceIndex') || 'Matched sentence index'}</th>
                      <th>{t('reviewPanels.similarity') || 'Similarity'}</th>
                      <th>{t('reviewPanels.numbers') || 'numbers'}</th>
                      <th>{t('reviewPanels.dates_times') || 'dates_times'}</th>
                      <th>{t('reviewPanels.negation') || 'negation'}</th>
                      <th>{t('reviewPanels.entities') || 'entities'}</th>
                      <th>{t('reviewPanels.quantifiers') || 'quantifiers'}</th>
                      <th>{t('reviewPanels.conditionals') || 'conditionals'}</th>
                      <th>{t('reviewPanels.connectives') || 'connectives'}</th>
                      <th>{t('reviewPanels.modifiers') || 'modifiers'}</th>
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
              </GcdsDetails>
            ) : null}

            {/* Similarity scores - collapsible */}
            <GcdsDetails detailsTitle={t('reviewPanels.similarityScores') || 'Similarity scores'} className="mt-200">
              <table className="review-table">
                <thead>
                  <tr>
                    <th>{t('reviewPanels.metric') || 'Metric'}</th>
                    <th>{t('reviewPanels.value') || 'Value'}</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(sim.sentences) && sim.sentences.length > 0 && sim.sentences.map((val, idx) => (
                    <tr key={`sim-s-${idx}`}>
                      <td>{(t('reviewPanels.sentence') || 'Sentence')} {idx + 1}</td>
                      <td>{fmt(val)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>{t('reviewPanels.citation') || 'Citation'}</td>
                    <td>{typeof sim.citation !== 'undefined' ? fmt(sim.citation) : (t('reviewPanels.notAvailable') || 'N/A')}</td>
                  </tr>
                </tbody>
              </table>
            </GcdsDetails>

            {/* Agent usage - collapsible */}
            <GcdsDetails detailsTitle={t('reviewPanels.agentUsage') || 'Agent usage'} className="mt-200">
              <h4>{t('reviewPanels.agentUsage') || 'Agent usage'}</h4>
              <div>
                <strong>{t('reviewPanels.sentenceCompareUsed') || 'Sentence compare used'}:</strong> {evalObj.sentenceCompareUsed ? (t('common.yes') || 'yes') : (t('common.no') || 'no')}
              </div>
              {evalObj.sentenceCompareMeta ? (
                <table className="review-table mt-100">
                  <thead>
                    <tr>
                      <th>{t('reviewPanels.field') || 'Field'}</th>
                      <th>{t('reviewPanels.value') || 'Value'}</th>
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
                <strong>{t('reviewPanels.fallbackCompareUsed') || 'Fallback compare used'}:</strong> {evalObj.fallbackCompareUsed ? (t('common.yes') || 'yes') : (t('common.no') || 'no')}
              </div>
              {evalObj.fallbackCompareMeta ? (
                <table className="review-table mt-100">
                  <thead>
                    <tr>
                      <th>{t('reviewPanels.field') || 'Field'}</th>
                      <th>{t('reviewPanels.value') || 'Value'}</th>
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
                  <h5>{t('reviewPanels.fallbackCompareChecks') || 'Fallback compare checks'}</h5>
                  <table className="review-table">
                    <thead>
                      <tr>
                        <th>{t('reviewPanels.check') || 'Check'}</th>
                        <th>{t('reviewPanels.pass') || 'Pass'}</th>
                        <th>{t('reviewPanels.details') || 'Details'}</th>
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
              </GcdsDetails>
          </>
        ) : (
          <>
            {!loading && (
              <div>
                {t('reviewPanels.noEvaluation') || 'No evaluation available.'}
                <div className="mt-200">
                  <GcdsButton onClick={handleReRun} disabled={reRunning} className="hydrated">
                    {reRunning ? (t('common.processing') || 'Processing...') : (t('reviewPanels.runEvaluation') || 'Run evaluation')}
                  </GcdsButton>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </GcdsDetails>
  );
};

export default EvalPanel;
