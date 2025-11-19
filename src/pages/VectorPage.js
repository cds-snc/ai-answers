import React, { useState } from 'react';
import { GcdsContainer, GcdsText, GcdsButton, GcdsLink } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import DataStoreService from '../services/DataStoreService.js';
import VectorService from '../services/VectorService.js';
import SimilarChatsDashboard from '../components/admin/SimilarChatsDashboard.js';

const VectorPage = () => {
  const { t } = useTranslations();
  const { language } = usePageContext();
  const [vectorStats, setVectorStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Embedding functionality state
  const [embeddingProgress, setEmbeddingProgress] = useState(null);
  const [isAutoProcessingEmbeddings, setIsAutoProcessingEmbeddings] = useState(false);
  const [isRequestInProgress, setIsRequestInProgress] = useState(false);
  const [isRegeneratingEmbeddings, setIsRegeneratingEmbeddings] = useState(false);
  const [provider, setProvider] = useState("openai");

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

  const handleRegenerateEmbeddings = () => {
    const confirmed = window.confirm(
      'This will delete all existing embeddings and regenerate them from scratch. This operation cannot be undone. Are you sure you want to continue?'
    );
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
      alert('Vector index created and vector service reinitialized successfully!');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GcdsContainer size="xl" centered>
      <h1>{t('vector.title', 'Vector Administration')}</h1>
      <nav className="mb-400">
        <GcdsText>
          <GcdsLink href={`/${language}/admin`}>
            {t('common.backToAdmin', 'Back to Admin')}
          </GcdsLink>
        </GcdsText>
      </nav>
      <div className="mb-400">
        <h2>{t('vector.indexManagement', 'Vector Index Management')}</h2>
        <GcdsText>
          {t('vector.manageDescription', 'Manage vector indexes and view vector database statistics.')}
        </GcdsText>
        <div className="button-group">
          <GcdsButton onClick={fetchVectorStats} disabled={loading} className="mb-200 mr-200">
            {loading ? t('vector.loading', 'Loading...') : t('vector.fetchStats', 'Fetch Vector Stats')}
          </GcdsButton>
          <GcdsButton onClick={handleCreateVectorIndex} disabled={loading} variant="primary" className="mb-200 mr-200">
            {t('vector.reinitializeIndex', 'Reinitialize Index')}
          </GcdsButton>
        </div>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        {vectorStats && (
          <div className="mb-200">
            <pre>{JSON.stringify(vectorStats, null, 2)}</pre>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.embeddingManagement', 'Embedding Management')}</h2>
        <GcdsText>
          {t('vector.embeddingDescription', 'Process interactions to generate embeddings.')}
        </GcdsText>
        <div className="button-group">
          <select value={provider} onChange={e => setProvider(e.target.value)} style={{ marginRight: "1rem" }}>
            <option value="openai">OpenAI</option>
            <option value="azure">Azure OpenAI</option>
          </select>
          <GcdsButton 
            onClick={() => handleGenerateEmbeddings(false)}
            disabled={embeddingProgress?.loading || isAutoProcessingEmbeddings}
            className="mb-200 mr-200"
          >
            {embeddingProgress?.loading && !isAutoProcessingEmbeddings ? t('vector.processing', 'Processing...') : t('vector.generateEmbeddings', 'Generate Embeddings')}
          </GcdsButton>
          <GcdsButton 
            onClick={handleRegenerateEmbeddings}
            disabled={embeddingProgress?.loading || isAutoProcessingEmbeddings}
            variant="danger"
            className="mb-200 mr-200"
          >
            {isRegeneratingEmbeddings ? t('vector.regenerating', 'Regenerating...') : t('vector.regenerateEmbeddings', 'Regenerate Embeddings')}
          </GcdsButton>
        </div>
        {embeddingProgress && (
          <div className="mb-200">
            <p>
              {embeddingProgress.remaining !== undefined && (
                <span> • {t('vector.remaining', 'Remaining')}: {embeddingProgress.remaining}</span>
              )}
              {isAutoProcessingEmbeddings && (
                <span> • <strong>{t('vector.autoProcessingActive', 'Auto-processing active')}</strong></span>
              )}
            </p>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.similarChats')}</h2>
        <GcdsText>
          {t('vector.similarChatsDescription')}
        </GcdsText>
       
        <SimilarChatsDashboard lang={language} />
        
      </div>
    </GcdsContainer>
  );
};

export default VectorPage;
