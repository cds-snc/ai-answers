import React, { useState } from 'react';
import { getApiUrl } from '../utils/apiToUrl.js';
import { GcdsContainer, GcdsText, GcdsButton } from '@cdssnc/gcds-components-react';

const EvalPage = () => {
  const [embeddingProgress, setEmbeddingProgress] = useState(null);
  const [evalProgress, setEvalProgress] = useState(null);
  const [isAutoProcessingEmbeddings, setIsAutoProcessingEmbeddings] = useState(false);
  const [isAutoProcessingEvals, setIsAutoProcessingEvals] = useState(false);
  const [evalLastProcessedId, setEvalLastProcessedId] = useState(null);
  const [isRegeneratingAll, setIsRegeneratingAll] = useState(false);
  const [isRegeneratingEmbeddings, setIsRegeneratingEmbeddings] = useState(false);
  const [isRequestInProgress, setIsRequestInProgress] = useState(false);
  const [isEvalRequestInProgress, setIsEvalRequestInProgress] = useState(false);

  const handleGenerateEmbeddings = async (isAutoProcess = false, regenerateAll = false, lastId = null) => {
    if (isRequestInProgress) {
      return; // Skip if a request is already in progress
    }

    try {
      setIsRequestInProgress(true);
      if (!isAutoProcess) {
        setIsAutoProcessingEmbeddings(true);
      }

      const response = await fetch(getApiUrl('db-generate-embeddings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          lastProcessedId: lastId,
          regenerateAll: regenerateAll 
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate embeddings');
      }

      const result = await response.json();
      
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

  const handleGenerateEvals = async (isAutoProcess = false, regenerateAll = false, lastId = null) => {
    if (isEvalRequestInProgress) {
      return; // Skip if a request is already in progress
    }

    try {
      setIsEvalRequestInProgress(true);
      if (!isAutoProcess) {
        setIsAutoProcessingEvals(true);
        setEvalLastProcessedId(null);
        if (regenerateAll) {
          setIsRegeneratingAll(true);
        }
      }

      setEvalProgress(prev => ({ ...prev, loading: true }));
      const response = await fetch(getApiUrl('db-generate-evals'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          lastProcessedId: lastId,
          regenerateAll: regenerateAll 
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate evals');
      }

      const result = await response.json();
      
      // Only update progress if we got a valid response
      if (typeof result.remaining === 'number') {
        setEvalLastProcessedId(result.lastProcessedId);
        setEvalProgress({
          remaining: result.remaining,
          lastProcessedId: result.lastProcessedId
        });
        
        // Only continue processing if there are actually items remaining
        if (result.remaining > 0) {
          handleGenerateEvals(true, false, result.lastProcessedId);
        } else {
          setIsAutoProcessingEvals(false);
          setEvalLastProcessedId(null);
          setIsRegeneratingAll(false);
          if (!isAutoProcess) {
            alert('All evaluations have been generated!');
          }
        }
      } else {
        // If we don't get a valid remaining count, stop processing
        setIsAutoProcessingEvals(false);
        setEvalLastProcessedId(null);
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

  const handleRegenerateAllEvals = () => {
    const confirmed = window.confirm(
      'This will delete all existing evaluations and regenerate them from scratch. This operation cannot be undone. Are you sure you want to continue?'
    );
    
    if (confirmed) {
      handleGenerateEvals(false, true);
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

  const handleProcessInteractions = async () => {
    try {
      const response = await fetch(getApiUrl('db-process-interactions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to process interactions');
      }

      const result = await response.json();
      alert(`Processed ${result.completed} interactions out of ${result.total}. ${result.remaining || 0} remaining.`);
    } catch (error) {
      console.error('Error processing interactions:', error);
      alert('Failed to process interactions. Check the console for details.');
    }
  };

  return (
    <GcdsContainer size="xl" centered>
      <h1>Evaluation Tools</h1>
      
      <div className="mb-400">
        <h2>Generate Embeddings</h2>
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
        <h2>Generate Evaluations</h2>
        <GcdsText>
          Process interactions to generate evaluations.
        </GcdsText>
        <div className="button-group">
          <GcdsButton 
            onClick={() => handleGenerateEvals(false)}
            disabled={evalProgress?.loading || isAutoProcessingEvals || isRegeneratingAll}
            className="mb-200 mr-200"
          >
            {evalProgress?.loading && !isAutoProcessingEvals && !isRegeneratingAll ? 'Processing...' : 'Generate Evaluations'}
          </GcdsButton>
          
          <GcdsButton 
            onClick={handleRegenerateAllEvals}
            disabled={evalProgress?.loading || isAutoProcessingEvals || isRegeneratingAll}
            variant="danger"
            className="mb-200 mr-200"
          >
            {isRegeneratingAll ? 'Regenerating All...' : 'Regenerate All Evaluations'}
          </GcdsButton>
        </div>
        
        {evalProgress && (
          <div className="mb-200">
            <p>
              {evalProgress.successful !== undefined && (
                <span> • Successful: {evalProgress.successful}</span>
              )}
              {evalProgress.remaining !== undefined && (
                <span> • Remaining: {evalProgress.remaining}</span>
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