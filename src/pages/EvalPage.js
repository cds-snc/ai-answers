import React, { useState } from 'react';
import { getApiUrl } from '../utils/apiToUrl.js';
import { GcdsContainer, GcdsText, GcdsButton, GcdsDetails, GcdsLink } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import DataStoreService from '../services/DataStoreService.js';

const EvalPage = () => {
  const { t } = useTranslations();
  const { language } = usePageContext();
  const [embeddingProgress, setEmbeddingProgress] = useState(null);
  const [evalProgress, setEvalProgress] = useState(null);
  const [isAutoProcessingEmbeddings, setIsAutoProcessingEmbeddings] = useState(false);
  const [isAutoProcessingEvals, setIsAutoProcessingEvals] = useState(false);
  const [isRegeneratingAll, setIsRegeneratingAll] = useState(false);
  const [isRegeneratingEmbeddings] = useState(false);
  const [isRequestInProgress, setIsRequestInProgress] = useState(false);
  const [isEvalRequestInProgress, setIsEvalRequestInProgress] = useState(false);
  const [expertFeedbackCount, setExpertFeedbackCount] = useState(null);
  const [nonEmptyEvalCount, setNonEmptyEvalCount] = useState(null);
  // Add state for time range selectors
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  React.useEffect(() => {
    DataStoreService.getExpertFeedbackCount()
      .then(setExpertFeedbackCount)
      .catch(() => setExpertFeedbackCount('Error'));
    DataStoreService.getEvalNonEmptyCount()
      .then(setNonEmptyEvalCount)
      .catch(() => setNonEmptyEvalCount('Error'));
  }, []);

  const handleGenerateEmbeddings = async (isAutoProcess = false, regenerateAll = false, lastId = null) => {
    if (isRequestInProgress) {
      return; // Skip if a request is already in progress
    }

    try {
      setIsRequestInProgress(true);
      if (!isAutoProcess) {
        setIsAutoProcessingEmbeddings(true);
      }

      const result = await DataStoreService.generateEmbeddings({ lastProcessedId: lastId, regenerateAll });
      // Only update progress if we got a valid response
      if (typeof result.remaining === 'number') {
        setEmbeddingProgress({
          remaining: result.remaining,
          lastProcessedId: result.lastProcessedId
        });
        // Only continue processing if there are actually items remaining
        if (result.remaining > 0) {
          handleGenerateEmbeddings(true, false, result.lastProcessedId);
        } else {
          setIsAutoProcessingEmbeddings(false);
          if (!isAutoProcess) {
            alert('All embeddings have been generated!');
          }
        }
      } else {
        // If we don't get a valid remaining count, stop processing
        setIsAutoProcessingEmbeddings(false);
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Error generating embeddings:', error);
      if (!isAutoProcess) {
        alert('Failed to generate embeddings. Check the console for details.');
      }
      setIsAutoProcessingEmbeddings(false);
    } finally {
      setIsRequestInProgress(false);
    }
  };

  const handleGenerateEvals = async (isAutoProcess = false, regenerateAll = false, lastId = null, skipEmptyCleanup = false) => {
    if (isEvalRequestInProgress) {
      return; // Skip if a request is already in progress
    }

    try {
      setIsEvalRequestInProgress(true);
      if (!isAutoProcess) {
        setIsAutoProcessingEvals(true);
        if (regenerateAll) {
          setIsRegeneratingAll(true);
        }
      }
      setEvalProgress(prev => ({ ...prev, loading: true }));
      // Pass startTime and endTime in the payload
      const result = await DataStoreService.generateEvals({
        lastProcessedId: lastId,
        regenerateAll,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        skipEmptyCleanup
      });
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
          handleGenerateEvals(true, false, result.lastProcessedId);
        } else {
          setIsAutoProcessingEvals(false);
          setIsRegeneratingAll(false);
          if (!isAutoProcess) {
            alert(`All evaluations have been generated! Final totals: ${result.processed || 0} successful, ${result.failed || 0} failed.`);
          }
        }
      } else {
        // If we don't get a valid remaining count, stop processing
        setIsAutoProcessingEvals(false);
        setIsRegeneratingAll(false);
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Error generating evals:', error);
      if (!isAutoProcess) {
        alert('Failed to generate evals. Check the console for details.');
      }
      setIsAutoProcessingEvals(false);
      setIsRegeneratingAll(false);
    } finally {
      setIsEvalRequestInProgress(false);
    }
  };


  // Delete evaluations in date range
  const handleDeleteEvals = async () => {
    const confirmed = window.confirm(
      'This will delete all evaluations (and associated expert feedback) within the selected date range. This operation cannot be undone. Are you sure you want to continue?'
    );
    if (!confirmed) return;
    try {
      const result = await DataStoreService.deleteEvals({ startTime: startTime || undefined, endTime: endTime || undefined });
      alert(`Deleted ${result.deleted} evaluations and ${result.expertFeedbackDeleted} expert feedback records.`);
    } catch (error) {
      alert('Failed to delete evaluations. Check the console for details.');
    }
  };

  const handleRegenerateEmbeddings = () => {
    const confirmed = window.confirm(
      'This will delete all existing embeddings and regenerate them from scratch. This operation cannot be undone. Are you sure you want to continue?'
    );
    
    if (confirmed) {
      handleGenerateEmbeddings(false, true, null);
    }
  };


  return (
    <GcdsContainer size="xl" centered>
      <h1>Evaluation Tools</h1>
      
      <nav className="mb-400">
        <GcdsText>
          <GcdsLink href={`/${language}/admin`}>{t('common.backToAdmin', 'Back to Admin')}</GcdsLink>
        </GcdsText>
      </nav>

      <div className="mb-400">
        <h2>Generate Embeddings</h2>
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
        <GcdsText>
          Process interactions to generate embeddings.
        </GcdsText>
        <div className="button-group">
          <GcdsButton 
            onClick={() => handleGenerateEmbeddings(false)}
            disabled={embeddingProgress?.loading || isAutoProcessingEmbeddings}
            className="mb-200 mr-200"
          >
            {embeddingProgress?.loading && !isAutoProcessingEmbeddings ? 'Processing...' : 'Generate Embeddings'}
          </GcdsButton>
          
          <GcdsButton 
            onClick={handleRegenerateEmbeddings}
            disabled={embeddingProgress?.loading || isAutoProcessingEmbeddings}
            variant="danger"
            className="mb-200 mr-200"
          >
            {isRegeneratingEmbeddings ? 'Regenerating...' : 'Regenerate Embeddings'}
          </GcdsButton>
        </div>
        
        {embeddingProgress && (
          <div className="mb-200">
            <p>
              {embeddingProgress.remaining !== undefined && (
                <span> • Remaining: {embeddingProgress.remaining}</span>
              )}
              {isAutoProcessingEmbeddings && (
                <span> • <strong>Auto-processing active</strong></span>
              )}
            </p>
          </div>
        )}
      </div>
      
      <div className="mb-400">
        <h2>Similarity-Based Expert Feedback Transfer</h2>
        <GcdsText>
          This approach automatically evaluates new interactions by finding similar expert-evaluated interactions and transferring the feedback scores and explanations.
        </GcdsText>
        <GcdsDetails detailsTitle="Detailed Evaluation Process" className="mt-400">
          <ol className="mb-200">
            <li><strong>Initial Validation:</strong> The system first validates that the interaction has question and answer content, then checks if an evaluation already exists</li>
            <li><strong>Embedding Retrieval:</strong> Finds vector embeddings for the interaction (question+answer combined, answer-only, and sentence-level)</li>
            <li><strong>Finding Similar Content:</strong> Searches for interactions with:
              <ul>
                <li>Existing expert feedback</li>
                <li>Question(s)+answer similarity above threshold (0.85)</li>
                <li>Returns up to 20 closest matches</li>
              </ul>
            </li>
            <li><strong>Determining Best Matches:</strong> 
              <ul>
                <li>Calculates answer similarity for each potential match</li>
                <li>Applies a sentence count penalty (0.05 per sentence difference)</li>
                <li>Applies recency bias to favor newer examples</li>
                <li>Selects top 5 answer matches</li>
              </ul>
            </li>
            <li><strong>Sentence-Level Matching:</strong> 
              <ul>
                <li>For each sentence in the new interaction, finds the most similar sentence in each potential match</li>
                <li>Keeps matches above the sentence similarity threshold</li>
              </ul>
            </li>
            <li><strong>Final Match Selection:</strong> Combines overall similarity scores to select the best overall match with good sentence alignment</li>
            <li><strong>Evaluation Creation:</strong> 
              <ul>
                <li>Creates a new expert feedback object based on the matched interaction's feedback</li>
                <li>Maps sentence-specific feedback to corresponding sentences in the new interaction</li>
                <li>Records similarity scores at question, answer, and sentence levels</li>
                <li>Updates the interaction with the new evaluation reference</li>
              </ul>
            </li>
            
          </ol>
        </GcdsDetails>
        <br/>
        {/* Date range selectors above the button group */}
        <div style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
          <label>
            Start Time:
            <input
              type="datetime-local"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              style={{ marginLeft: "0.5rem" }}
            />
          </label>
          <label>
            End Time:
            <input
              type="datetime-local"
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
            onClick={() => handleGenerateEvals(false, false, null, true)}
            disabled={evalProgress?.loading || isAutoProcessingEvals || isRegeneratingAll}
            className="mb-200 mr-200"
          >
            Continue Generate
          </GcdsButton>
          <GcdsButton 
            onClick={handleDeleteEvals}
            disabled={evalProgress?.loading || isAutoProcessingEvals}
            variant="danger"
            className="mb-200 mr-200"
          >
            Delete Evaluations
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