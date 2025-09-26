import React, { useState } from 'react';
import { GcdsContainer, GcdsText, GcdsButton, GcdsDetails, GcdsLink } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
// Removed unused imports
import EvaluationService from '../services/EvaluationService.js';

const EvalPage = () => {
  const { t } = useTranslations();
  const { language } = usePageContext();
  const [evalProgress, setEvalProgress] = useState(null);
  const [isAutoProcessingEvals, setIsAutoProcessingEvals] = useState(false);
  const [isRegeneratingAll] = useState(false);
  const [isEvalRequestInProgress, setIsEvalRequestInProgress] = useState(false);
  const [expertFeedbackCount, setExpertFeedbackCount] = useState(null);
  const [nonEmptyEvalCount, setNonEmptyEvalCount] = useState(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  React.useEffect(() => {
    EvaluationService.getExpertFeedbackCount()
      .then(setExpertFeedbackCount)
      .catch(() => setExpertFeedbackCount('Error'));
    EvaluationService.getEvalNonEmptyCount()
      .then(setNonEmptyEvalCount)
      .catch(() => setNonEmptyEvalCount('Error'));
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
        <h2>Similarity-Based Expert Feedback Transfer</h2>
        <GcdsText>
          This approach automatically evaluates new interactions by finding similar expert-evaluated interactions and transferring feedback scores and explanations. If sentence-level matching fails, the system will fall back to using a highly similar question+answer match with a high expert score.
        </GcdsText>
        {expertFeedbackCount !== null && (
          <GcdsText>
            <strong>Expert Evaluations in System:</strong> {expertFeedbackCount}
          </GcdsText>
        )}
        {nonEmptyEvalCount !== null && (
          <GcdsText>
            <strong>Non-Empty Evaluations in System:</strong> {nonEmptyEvalCount}
          </GcdsText>
        )}
        <GcdsDetails detailsTitle="Detailed Evaluation Process" className="mt-400">
          <ol className="mb-200">
            <li><strong>Initial Validation:</strong> The system first validates that the interaction has question and answer content, then checks if an evaluation already exists.</li>
            <li><strong>Embedding Retrieval:</strong> Finds vector embeddings for the interaction (question+answer combined, answer-only, and sentence-level).</li>
            <li><strong>Finding Similar Content:</strong> Searches for interactions with:
              <ul>
                <li>Existing expert feedback</li>
                <li>Question(s)+answer similarity above threshold (e.g., 0.85)</li>
                <li>Returns up to 20 closest matches</li>
              </ul>
            </li>
            <li><strong>Sentence-Level Matching:</strong>
              <ul>
                <li>For each sentence in the new interaction, finds the most similar sentence in each potential match</li>
                <li>Keeps matches above the sentence similarity threshold</li>
                <li>If all sentences are matched, transfers sentence-level feedback and creates a detailed evaluation</li>
              </ul>
            </li>
            <li><strong>QA High Score Fallback:</strong>
              <ul>
                <li>If sentence-level matching fails, checks the top 10 QA matches for an expert feedback score above 90</li>
                <li>If found, creates an evaluation using only the QA match (without sentence-level feedback)</li>
                <li>Records that the evaluation used the QA high score fallback</li>
              </ul>
            </li>
            <li><strong>No Match Case:</strong>
              <ul>
                <li>If neither sentence-level nor QA fallback matches are found, records a no-match evaluation with reasons</li>
              </ul>
            </li>
            <li><strong>Evaluation Creation:</strong>
              <ul>
                <li>Creates a new expert feedback object based on the matched interaction's feedback</li>
                <li>Maps feedback to the new interaction (sentence-level or QA-only)</li>
                <li>Records similarity scores and evaluation type</li>
                <li>Updates the interaction with the new evaluation reference</li>
              </ul>
            </li>
          </ol>
        </GcdsDetails>
        <br/>
        <div style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
          <label>
            Start Date:
            <input
              type="date"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              style={{ marginLeft: "0.5rem" }}
            />
          </label>
          <label>
            End Date:
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
            {evalProgress?.loading && !isAutoProcessingEvals && !isRegeneratingAll ? 'Processing...' : 'Generate Evaluations'}
          </GcdsButton>
          <GcdsButton 
            onClick={handleDeleteEvals}
            disabled={evalProgress?.loading || isAutoProcessingEvals}
            variant="danger"
            className="mb-200 mr-200"
          >
            Delete Evaluations
          </GcdsButton>
          <GcdsButton 
            onClick={handleDeleteEmptyEvals}
            disabled={evalProgress?.loading || isAutoProcessingEvals}
            variant="danger"
            className="mb-200"
          >
            Delete Empty Evaluations
          </GcdsButton>
        </div>
          {evalProgress && (
          <div className="mb-200">
            <p>
              {evalProgress.processed !== undefined && (
                <span> • Processed: {evalProgress.processed}</span>
              )}
              {evalProgress.failed !== undefined && (
                <span> • Failed: {evalProgress.failed}</span>
              )}
              {evalProgress.remaining !== undefined && (
                <span> • Remaining: {evalProgress.remaining}</span>
              )}
              {evalProgress.duration !== undefined && (
                <span> • Duration: {evalProgress.duration}s</span>
              )}
              {isAutoProcessingEvals && !isRegeneratingAll && (
                <span> • <strong>Auto-processing active</strong></span>
              )}
              {isRegeneratingAll && (
                <span> • <strong>Regenerating all evaluations</strong></span>
              )}
            </p>
          </div>
        )}
      </div>
    </GcdsContainer>
  );
};

export default EvalPage;
