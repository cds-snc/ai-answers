import React, { useState } from 'react';
import { GcdsContainer, GcdsText, GcdsButton, GcdsDetails, GcdsLink } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
// Removed unused imports
import EvaluationService from '../services/EvaluationService.js';

const EvalPage = () => {
  const { language } = usePageContext();
  const { t } = useTranslations(language);
  const [evalProgress, setEvalProgress] = useState(null);
  const [isAutoProcessingEvals, setIsAutoProcessingEvals] = useState(false);
  const [isRegeneratingAll] = useState(false);
  const [isEvalRequestInProgress, setIsEvalRequestInProgress] = useState(false);
  const [expertFeedbackCount, setExpertFeedbackCount] = useState(null);
  const [nonEmptyEvalCount, setNonEmptyEvalCount] = useState(null);
  const [evalMetrics, setEvalMetrics] = useState(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  React.useEffect(() => {
    EvaluationService.getExpertFeedbackCount()
      .then(setExpertFeedbackCount)
      .catch(() => setExpertFeedbackCount('Error'));
    EvaluationService.getEvalNonEmptyCount()
      .then(setNonEmptyEvalCount)
      .catch(() => setNonEmptyEvalCount('Error'));
    // load aggregated eval metrics
    EvaluationService.getEvalMetrics()
      .then(setEvalMetrics)
      .catch(() => setEvalMetrics(null));
  }, []);

  const handleGenerateEvals = async (isAutoProcess = false, lastId = null) => {
    if (isEvalRequestInProgress) {
      return; // Skip if a request is already in progress
    }

    try {
      setIsEvalRequestInProgress(true);
      if (!isAutoProcess) {
        setIsAutoProcessingEvals(true);
      }
      setEvalProgress(prev => ({ ...prev, loading: true }));
      // Pass startTime and endTime in the payload
      const payload = {};
      if (lastId) payload.lastProcessedId = lastId;
      if (startTime) payload.startTime = startTime;
      if (endTime) payload.endTime = endTime;
      const result = await EvaluationService.generateEvals(payload);
      // Update non-empty eval count after each batch
      try {
        const updatedCount = await EvaluationService.getEvalNonEmptyCount();
        setNonEmptyEvalCount(updatedCount);
      } catch (e) {
        // Ignore error, just don't update count
      }
      // Only update progress if we got a valid response
      if (typeof result.remaining === 'number') {
        setEvalProgress({
          remaining: result.remaining,
          lastProcessedId: result.lastProcessedId,
          processed: result.processed || 0,
          failed: result.failed || 0,
          duration: result.duration || 0
        });
        // Show progress message for non-auto processes
        if (!isAutoProcess && (result.processed > 0 || result.failed > 0)) {
          console.log(`Evaluation batch completed: ${result.processed} successful, ${result.failed} failed in ${result.duration}s`);
        }
        // Only continue processing if there are actually items remaining
        if (result.remaining > 0) {
          handleGenerateEvals(true, result.lastProcessedId);
        } else {
          setIsAutoProcessingEvals(false);
          if (!isAutoProcess) {
            alert(`All evaluations have been generated! Final totals: ${result.processed || 0} successful, ${result.failed || 0} failed.`);
          }
        }
      } else {
        // If we don't get a valid remaining count, stop processing
        setIsAutoProcessingEvals(false);
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Error generating evals:', error);
      if (!isAutoProcess) {
        alert('Failed to generate evals. Check the console for details.');
      }
      setIsAutoProcessingEvals(false);
    } finally {
      setIsEvalRequestInProgress(false);
    }
  };

  const handleDeleteEvals = async () => {
    const confirmed = window.confirm(
      'This will delete all evaluations (and associated expert feedback) within the selected date range. This operation cannot be undone. Are you sure you want to continue?'
    );
    if (!confirmed) return;
    try {
      const result = await EvaluationService.deleteEvals({ startTime: startTime || undefined, endTime: endTime || undefined });
      alert(`Deleted ${result.deleted} evaluations and ${result.expertFeedbackDeleted} expert feedback records.`);
    } catch (error) {
      alert('Failed to delete evaluations. Check the console for details.');
    }
  };

  // New handler for deleting only empty evals
  const handleDeleteEmptyEvals = async () => {
    const confirmed = window.confirm(
      'This will delete only EMPTY evaluations (and associated expert feedback) within the selected date range. This operation cannot be undone. Are you sure you want to continue?'
    );
    if (!confirmed) return;
    try {
      const result = await EvaluationService.deleteEvals({ startTime: startTime || undefined, endTime: endTime || undefined, onlyEmpty: true });
      alert(`Deleted ${result.deleted} empty evaluations and ${result.expertFeedbackDeleted} expert feedback records.`);
    } catch (error) {
      alert('Failed to delete empty evaluations. Check the console for details.');
    }
  };

  return (
    <GcdsContainer size="xl" centered>
      <h1 className="mb-400">{t('admin.navigation.eval', 'Evaluation Administration')}</h1>
      
      <nav className="mb-400">
        <GcdsText>
          <GcdsLink href={`/${language}/admin`}>{t('common.backToAdmin', 'Back to Admin')}</GcdsLink>
        </GcdsText>
      </nav>

      <div className="mb-400">
        <h2>{t('admin.evalPage.similarityTitle', 'Similarity-Based Expert Feedback Transfer')}</h2>
        <GcdsText>
          {t('admin.evalPage.similarityDescription', 'This approach automatically evaluates new interactions by finding similar expert-evaluated interactions and transferring feedback scores and explanations. If sentence-level matching fails, the system will fall back to using a highly similar question+answer match with a high expert score.')}
        </GcdsText>
        {expertFeedbackCount !== null && (
          <GcdsText>
            <strong>{t('admin.evalPage.label.expertEvaluations', 'Expert Evaluations in System:')}</strong> {expertFeedbackCount}
          </GcdsText>
        )}
        {nonEmptyEvalCount !== null && (
          <GcdsText>
            <strong>{t('admin.evalPage.label.nonEmptyEvaluations', 'Non-Empty Evaluations in System:')}</strong> {nonEmptyEvalCount}
          </GcdsText>
        )}
        <GcdsDetails detailsTitle={t('admin.evalPage.detailsTitle', 'Detailed Evaluation Process')} className="mt-400">
          <ol className="mb-200">
            <li>
              <strong>{t('admin.evalPage.step.initialValidation.title', 'Initial Validation')}:</strong>
              {' '}
              {t('admin.evalPage.step.initialValidation.description', 'The system first validates that the interaction has question and answer content, then checks if an evaluation already exists.')}
            </li>
            <li>
              <strong>{t('admin.evalPage.step.embeddingRetrieval.title', 'Embedding Retrieval')}:</strong>
              {' '}
              {t('admin.evalPage.step.embeddingRetrieval.description', 'Finds vector embeddings for the interaction (question+answer combined, answer-only, and sentence-level).')}
            </li>
            <li>
              <strong>{t('admin.evalPage.step.findingSimilar.title', 'Finding Similar Content')}:</strong>
              {' '}
              {t('admin.evalPage.step.findingSimilar.description', 'Searches for interactions with existing expert feedback and strong QA similarity; returns up to 20 closest matches. Filters out results from the same chat and ensures sentence embeddings exist for candidates.')}
              <ul>
                <li>{t('admin.evalPage.step.findingSimilar.item.expertFeedback', 'Existing expert feedback')}</li>
                <li>{t('admin.evalPage.step.findingSimilar.item.qaSimilarity', 'Question(s)+answer similarity above threshold (e.g., 0.85)')}</li>
                <li>{t('admin.evalPage.step.findingSimilar.item.maxMatches', 'Returns up to 20 closest matches (candidates are re-sorted by similarity)')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.sentenceMatching.title', 'Sentence-Level Matching')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.sentenceMatching.item.findMostSimilar', 'For each sentence in the new interaction, find the most similar sentence in each potential match (vector search with per-sentence threshold)')}</li>
                <li>{t('admin.evalPage.step.sentenceMatching.item.threshold', 'Keep matches above the sentence similarity threshold and prefer highest-similarity neighbors')}</li>
                <li>{t('admin.evalPage.step.sentenceMatching.item.transfer', 'If all or a sufficient number of sentences are matched, transfer sentence-level feedback and create a detailed evaluation')}</li>
                <li>{t('admin.evalPage.step.sentenceMatching.item.telemetry', 'Optionally run a sentence-compare agent for extra verification and capture telemetry (provider/model/latency/tokens)')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.citationMatch.title', 'Citation Matching')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.citationMatch.item.compare', 'Compare the source citation URL with candidate interactions to find an exact or high-confidence citation match')}</li>
                <li>{t('admin.evalPage.step.citationMatch.item.score', 'Score and record a citation match (score, explanation, matched interaction/chat ids)')}</li>
                <li>{t('admin.evalPage.step.citationMatch.item.searchPage', 'Search page citations may be handled specially and scored zero')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.qaFallback.title', 'QA High Score Fallback')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.qaFallback.item.checkTop', 'If sentence-level matching fails, check the top QA matches (configurable top-N) for those with high expert feedback scores')}</li>
                <li>{t('admin.evalPage.step.qaFallback.item.citationCheck', 'For candidates, perform a citation match and optionally run a fallback compare agent to ensure the candidate answer sufficiently covers the source')}</li>
                <li>{t('admin.evalPage.step.qaFallback.item.useQaOnly', 'If a candidate passes checks, create an evaluation using the QA match (QA-high-score fallback) and record fallback metadata and candidate traces')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.fallbackCompare.title', 'Fallback Compare Checks')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.fallbackCompare.item.agent', 'A small compare agent can be invoked to verify that a fallback candidate sufficiently matches the source answer; results, raw output and parsed checks are recorded')}</li>
                <li>{t('admin.evalPage.step.fallbackCompare.item.record', 'Whether compare was used and its meta (provider/model/latency/tokens) are stored on the evaluation for traceability')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.creation.title', 'Evaluation Creation & Scoring')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.creation.item.createFeedback', "Create a new expert feedback object based on the matched interaction's feedback or generated fallback feedback (type 'ai')")}</li>
                <li>{t('admin.evalPage.step.creation.item.computeScore', 'Compute total score from per-sentence scores and citation score (default weights applied). If no ratings exist, totalScore may be null.')}</li>
                <li>{t('admin.evalPage.step.creation.item.mapFeedback', 'Map feedback to the new interaction (sentence-level or QA-only) and save sentence match trace and similarity scores')}</li>
                <li>{t('admin.evalPage.step.creation.item.recordSimilarities', 'Record similarity scores, matched citation interaction/chat ids, fallback metadata, and a detailed stage timeline for auditing')}</li>
                <li>{t('admin.evalPage.step.creation.item.updateInteraction', 'Update the interaction with the new evaluation reference (autoEval)')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.noMatch.title', 'No Match / Rejection Cases')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.noMatch.item.recordNoMatch', 'If neither sentence-level nor QA fallback matches are accepted, create a no-match evaluation recording reason types and per-sentence rejection causes')}</li>
                <li>{t('admin.evalPage.step.noMatch.item.trace', 'No-match evaluations include a sentence-trace and timeline so operators can inspect why candidates were rejected')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.timeline.title', 'Stage Timeline & Telemetry')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.timeline.item.record', 'The worker records a stage-by-stage timeline (stage, status, code, message, timestamp) to the evaluation for diagnostics')}</li>
                <li>{t('admin.evalPage.step.timeline.item.telemetry', 'Agent and VectorService telemetry (latency, tokens, model) are captured where applicable')}</li>
              </ul>
            </li>
          </ol>
        </GcdsDetails>
        <br/>
        {/* Evaluation metrics summary */}
        <div className="mt-400">
          <h3>{t('admin.evalPage.metrics.title', 'Evaluation metrics')}</h3>
          {evalMetrics ? (
            <div>
              <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{t('admin.evalPage.metrics.total', 'Total evaluations')}</td>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{evalMetrics.total}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{t('admin.evalPage.metrics.processed', 'Processed evaluations')}</td>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{evalMetrics.processed}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{t('admin.evalPage.metrics.hasMatches', 'Evaluations with matches')}</td>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{evalMetrics.hasMatches}</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-200">
                <h4>{t('admin.evalPage.metrics.noMatchReasons', 'No-match reasons')}</h4>
                  {evalMetrics.noMatchByReason && Object.keys(evalMetrics.noMatchByReason).length > 0 ? (
                  <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>{t('admin.evalPage.metrics.reasonLabel', 'Reason')}</th>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>{t('admin.evalPage.metrics.countLabel', 'Count')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(evalMetrics.noMatchByReason).map(([k, v]) => (
                        <tr key={`nm-${k}`}>
                          <td style={{ border: '1px solid #ddd', padding: '8px' }}>{k || t('admin.evalPage.metrics.unknown', 'unknown')}</td>
                          <td style={{ border: '1px solid #ddd', padding: '8px' }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div>{t('admin.evalPage.metrics.noMatchNone', 'No no-match reason data available.')}</div>
                )}
              </div>

              <div className="mt-200">
                <h4>{t('admin.evalPage.metrics.fallbackTypes', 'Fallback types')}</h4>
                {evalMetrics.fallbackByType && Object.keys(evalMetrics.fallbackByType).length > 0 ? (
                  <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>{t('admin.evalPage.metrics.fallbackLabel', 'Fallback')}</th>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>{t('admin.evalPage.metrics.countLabel', 'Count')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(evalMetrics.fallbackByType).map(([k, v]) => (
                        <tr key={`fb-${k}`}>
                          <td style={{ border: '1px solid #ddd', padding: '8px' }}>{k || t('admin.evalPage.metrics.unknown', 'unknown')}</td>
                          <td style={{ border: '1px solid #ddd', padding: '8px' }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div>{t('admin.evalPage.metrics.fallbackNone', 'No fallback usage data available.')}</div>
                )}
              </div>

              <div className="mt-200">
                <button onClick={() => {
                  EvaluationService.getEvalMetrics().then(setEvalMetrics).catch(() => {});
                }}>{t('admin.evalPage.metrics.refresh', 'Refresh metrics')}</button>
              </div>
            </div>
          ) : (
            <div>{t('admin.evalPage.metrics.loading', 'Loading metrics...')}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
          <label>
            {t('admin.evalPage.date.startLabel', 'Start Date')}:
            <input
              type="date"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              style={{ marginLeft: "0.5rem" }}
            />
          </label>
          <label>
            {t('admin.evalPage.date.endLabel', 'End Date')}:
            <input
              type="date"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              style={{ marginLeft: "0.5rem" }}
            />
          </label>
        </div>
        <div className="button-group">
          <GcdsButton 
            onClick={() => handleGenerateEvals(false)}
            disabled={evalProgress?.loading || isAutoProcessingEvals || isRegeneratingAll}
            className="mb-200 mr-200"
          >
            {evalProgress?.loading && !isAutoProcessingEvals && !isRegeneratingAll ? t('admin.evalPage.button.processing', 'Processing...') : t('admin.evalPage.button.generate', 'Generate Evaluations')}
          </GcdsButton>
          <GcdsButton 
            onClick={handleDeleteEvals}
            disabled={evalProgress?.loading || isAutoProcessingEvals}
            variant="danger"
            className="mb-200 mr-200"
          >
            {t('admin.evalPage.button.deleteAll', 'Delete Evaluations')}
          </GcdsButton>
          <GcdsButton 
            onClick={handleDeleteEmptyEvals}
            disabled={evalProgress?.loading || isAutoProcessingEvals}
            variant="danger"
            className="mb-200"
          >
            {t('admin.evalPage.button.deleteEmpty', 'Delete Empty Evaluations')}
          </GcdsButton>
        </div>
          {evalProgress && (
          <div className="mb-200">
            <p>
              {evalProgress.processed !== undefined && (
                <span> • {t('admin.evalPage.progress.processed', 'Processed')}: {evalProgress.processed}</span>
              )}
              {evalProgress.failed !== undefined && (
                <span> • {t('admin.evalPage.progress.failed', 'Failed')}: {evalProgress.failed}</span>
              )}
              {evalProgress.remaining !== undefined && (
                <span> • {t('admin.evalPage.progress.remaining', 'Remaining')}: {evalProgress.remaining}</span>
              )}
              {evalProgress.duration !== undefined && (
                <span> • {t('admin.evalPage.progress.duration', 'Duration')}: {evalProgress.duration}s</span>
              )}
              {isAutoProcessingEvals && !isRegeneratingAll && (
                <span> • <strong>{t('admin.evalPage.progress.autoProcessing', 'Auto-processing active')}</strong></span>
              )}
              {isRegeneratingAll && (
                <span> • <strong>{t('admin.evalPage.progress.regeneratingAll', 'Regenerating all evaluations')}</strong></span>
              )}
            </p>
          </div>
        )}
      </div>
    </GcdsContainer>
  );
};

export default EvalPage;
