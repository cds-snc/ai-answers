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

const EvalPanel = ({ message, t, reviewMode }) => {
  // Show panel in review mode as requested (no longer hidden)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [reRunning, setReRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const getInteractionId = () => (message.interaction && (message.interaction._id || message.interaction.id)) || message.id;

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
    }, [message]);

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
  }, [message]);

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
  }, [message]);

  if (!message) return null;

  const evalObj = data || message.interaction?.eval || message.eval || null;
  const sentenceTrace = Array.isArray(evalObj?.sentenceMatchTrace) ? evalObj.sentenceMatchTrace : [];
  const sim = evalObj?.similarityScores || {};

  return (
    <GcdsDetails
      detailsTitle={t('reviewPanels.autoEvalTitle') || t('reviewPanels.evaluation') || 'Automated evaluation'}
      className="review-details"
      tabIndex="0"
      onGcdsClick={handleToggle}
    >
      <div className="review-panel eval-panel">
        {loading && <div>{t('common.loading') || 'Loading...'}</div>}
        {error && <div className="error">{t('common.error') || 'Error'}: {error}</div>}

        {evalObj ? (
          <>
            <div className="eval-summary">
              <div><strong>{t('reviewPanels.processed') || 'Processed'}:</strong> {evalObj.processed ? (t('common.yes') || 'yes') : (t('common.no') || 'no')}</div>
              <div><strong>{t('reviewPanels.hasMatches') || 'Has matches'}:</strong> {evalObj.hasMatches ? (t('common.yes') || 'yes') : (t('common.no') || 'no')}</div>
              <div><strong>{t('reviewPanels.fallback') || 'Fallback'}:</strong> {evalObj.fallbackType || (t('reviewPanels.none') || 'none')}</div>
              {evalObj.expertFeedback ? (
                <div><strong>{t('reviewPanels.expertFeedbackId') || 'Expert feedback id'}:</strong> {String(evalObj.expertFeedback)}</div>
              ) : null}
              {evalObj.noMatchReasonType || evalObj.noMatchReasonMsg ? (
                <div><strong>{t('reviewPanels.noMatchReason') || 'No-match reason'}:</strong> {evalObj.noMatchReasonType || ''} {evalObj.noMatchReasonMsg ? `- ${evalObj.noMatchReasonMsg}` : ''}</div>
              ) : null}
              {evalObj.fallbackSourceChatId ? (<div><strong>{t('reviewPanels.fallbackSourceChatId') || 'Fallback source chatId'}:</strong> {renderChatLink(evalObj.fallbackSourceChatId)}</div>) : null}
              {evalObj.matchedCitationInteractionId ? (<div><strong>{t('reviewPanels.matchedCitationInteractionId') || 'Matched citation interactionId'}:</strong> {evalObj.matchedCitationInteractionId}</div>) : null}
              {evalObj.matchedCitationChatId ? (<div><strong>{t('reviewPanels.matchedCitationChatId') || 'Matched citation chatId'}:</strong> {renderChatLink(evalObj.matchedCitationChatId)}</div>) : null}
              <div><strong>{t('reviewPanels.createdAt') || 'Created at'}:</strong> {formatDate(evalObj.createdAt)}</div>
              <div><strong>{t('reviewPanels.updatedAt') || 'Updated at'}:</strong> {formatDate(evalObj.updatedAt)}</div>
            </div>
            {/* Actions below timestamps */}
            {/* Actions below timestamps */}
            <div className="mt-200" style={{ display: 'flex', gap: '0.5rem' }}>
              <GcdsButton onClick={handleReRun} disabled={reRunning} className="hydrated">
                {reRunning ? (t('common.processing') || 'Processing...') : (t('reviewPanels.reEvaluate') || 'Re-evaluate')}
              </GcdsButton>
              <GcdsButton onClick={handleDelete} variant="danger" disabled={deleting} className="hydrated">
                {deleting ? (t('common.deleting') || 'Deleting...') : (t('reviewPanels.deleteEvaluation') || 'Delete Evaluation')}
              </GcdsButton>
            </div>

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
                        <td>{typeof s.similarity !== 'undefined' ? s.similarity : ''}</td>
                        <td>{typeof s.matchedExpertFeedbackSentenceScore !== 'undefined' ? s.matchedExpertFeedbackSentenceScore : ''}</td>
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
                            <td>{typeof v === 'object' && v !== null && 'p' in v ? String(v.p) : ''}</td>
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
                            <td>{typeof c.similarity !== 'undefined' ? c.similarity : ''}</td>
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
                      <td>{val}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>{t('reviewPanels.citation') || 'Citation'}</td>
                    <td>{typeof sim.citation !== 'undefined' ? sim.citation : (t('reviewPanels.notAvailable') || 'N/A')}</td>
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
                          <td>{typeof v === 'object' && v !== null && 'p' in v ? String(v.p) : ''}</td>
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
