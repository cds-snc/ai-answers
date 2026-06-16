import React, { useState } from 'react';
import { GcdsContainer, GcdsText, GcdsButton, GcdsLink, GcdsDetails } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import DataStoreService from '../services/DataStoreService.js';
import VectorService from '../services/VectorService.js';
import SimilarChatsDashboard from '../components/admin/SimilarChatsDashboard.js';
import { formatDecimal, formatNumber, formatPercent } from '../utils/numberFormat.js';

const getDocdb8CapabilityRows = (result, t) => ([
  {
    key: 'vectorSearchBasicSupport',
    label: t('vector.docdb8Capability.capabilities.vectorSearchBasicSupport'),
    supported: result?.capabilities?.vectorSearchBasicSupport,
    test: result?.tests?.vectorSearchThenFeedbackFilter,
  },
  {
    key: 'vectorSearchScoreSupport',
    label: t('vector.docdb8Capability.capabilities.vectorSearchScoreSupport'),
    supported: result?.capabilities?.vectorSearchScoreSupport,
    test: result?.tests?.vectorSearchThenFeedbackFilter,
  },
  {
    key: 'postFilterAfterVectorSearch',
    label: t('vector.docdb8Capability.capabilities.postFilterAfterVectorSearch'),
    supported: result?.capabilities?.postFilterAfterVectorSearch,
    test: result?.tests?.vectorSearchThenFeedbackFilter,
  },
  {
    key: 'simpleMatchBeforeVectorSearch',
    label: t('vector.docdb8Capability.capabilities.simpleMatchBeforeVectorSearch'),
    supported: result?.capabilities?.simpleMatchBeforeVectorSearch,
    test: result?.tests?.simpleMatchBeforeVectorSearch,
  },
  {
    key: 'feedbackLookupFilterBeforeVectorSearch',
    label: t('vector.docdb8Capability.capabilities.feedbackLookupFilterBeforeVectorSearch'),
    supported: result?.capabilities?.feedbackLookupFilterBeforeVectorSearch,
    test: result?.tests?.feedbackFilterBeforeVectorSearch,
  },
]);

const getDocdb8RecommendationText = (recommendation, t) => {
  if (recommendation === 'lookupPreFilter') {
    return t('vector.docdb8Capability.recommendations.lookupPreFilter');
  }
  if (recommendation === 'denormalizedPreFilter') {
    return t('vector.docdb8Capability.recommendations.denormalizedPreFilter');
  }
  return t('vector.docdb8Capability.recommendations.dedicatedFeedbackCollection');
};

const formatDocdb8ScoreRange = (scoreSummary, lang, t) => {
  if (!scoreSummary?.hasNumericScores) {
    return t('vector.docdb8Capability.notAvailable');
  }
  return t('vector.docdb8Capability.scoreRange')
    .replace('{min}', formatDecimal(scoreSummary.minScore, lang, 3))
    .replace('{max}', formatDecimal(scoreSummary.maxScore, lang, 3));
};

const VectorPage = ({ lang = 'en' }) => {
  const { language } = usePageContext();
  const activeLang = lang || language;
  const { t } = useTranslations(activeLang);
  const [vectorStats, setVectorStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [docdb8CapabilityResult, setDocdb8CapabilityResult] = useState(null);
  const [docdb8CapabilityLoading, setDocdb8CapabilityLoading] = useState(false);
  const [docdb8CapabilityError, setDocdb8CapabilityError] = useState(null);

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
            alert(t('vector.allEmbeddingsGenerated'));
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
        alert(t('vector.generateEmbeddingsFailed'));
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
    setError(null);
    try {
      await VectorService.reinitialize();
      alert(t('vector.indexCreatedSuccess'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunDocdb8CapabilityTest = async () => {
    setDocdb8CapabilityLoading(true);
    setDocdb8CapabilityError(null);
    try {
      const data = await VectorService.runDocdb8CapabilityTest();
      setDocdb8CapabilityResult(data);
    } catch (err) {
      setDocdb8CapabilityError(err.message);
    } finally {
      setDocdb8CapabilityLoading(false);
    }
  };

  const capabilityRows = getDocdb8CapabilityRows(docdb8CapabilityResult, t);
  const counts = docdb8CapabilityResult?.counts;
  const feedbackSelectivityPercent = typeof counts?.estimatedFeedbackSelectivity === 'number'
    ? formatPercent(Math.round(counts.estimatedFeedbackSelectivity * 100), activeLang)
    : t('vector.docdb8Capability.notAvailable');
  const estimatedCandidates = counts?.estimatedCandidatesForTenFeedbackResults
    ? formatNumber(counts.estimatedCandidatesForTenFeedbackResults, activeLang)
    : t('vector.docdb8Capability.notAvailable');

  return (
    <GcdsContainer layout="page">
      <h1>{t('vector.title')}</h1>
      <nav className="mb-400">
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
          <GcdsButton onClick={handleCreateVectorIndex} disabled={loading} variant="primary" className="mb-200 mr-200">
            {t('vector.reinitializeIndex')}
          </GcdsButton>
        </div>
        {error && <div style={{ color: 'red' }}>{error}</div>}
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
        <GcdsButton onClick={handleRunDocdb8CapabilityTest} disabled={docdb8CapabilityLoading} className="mb-200 mr-200">
          {docdb8CapabilityLoading ? t('vector.docdb8Capability.running') : t('vector.docdb8Capability.run')}
        </GcdsButton>
        {docdb8CapabilityError && <p>{docdb8CapabilityError}</p>}
        {docdb8CapabilityResult && (
          <div className="mb-400">
            <p>
              <strong>{t('vector.docdb8Capability.estimatedFeedbackSelectivity')}:</strong> {feedbackSelectivityPercent}
            </p>
            {counts && (
              <dl>
                <dt>{t('vector.docdb8Capability.counts.totalEmbeddings')}</dt>
                <dd>{formatNumber(counts.totalEmbeddings, activeLang)}</dd>
                <dt>{t('vector.docdb8Capability.counts.embeddingsWithInteraction')}</dt>
                <dd>{formatNumber(counts.embeddingsWithInteraction, activeLang)}</dd>
                <dt>{t('vector.docdb8Capability.counts.interactionsWithFeedback')}</dt>
                <dd>{formatNumber(counts.interactionsWithFeedback, activeLang)}</dd>
                <dt>{t('vector.docdb8Capability.counts.embeddingsWithFeedbackInteraction')}</dt>
                <dd>{formatNumber(counts.embeddingsWithFeedbackInteraction, activeLang)}</dd>
                <dt>{t('vector.docdb8Capability.counts.estimatedCandidatesForTenFeedbackResults')}</dt>
                <dd>{estimatedCandidates}</dd>
              </dl>
            )}
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
                {capabilityRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{row.supported ? t('vector.docdb8Capability.pass') : t('vector.docdb8Capability.fail')}</td>
                    <td>{formatNumber(row.test?.resultCount, activeLang)}</td>
                    <td>{row.test?.metadata?.candidateReductionBeforeVectorSearch ? t('vector.docdb8Capability.yes') : t('vector.docdb8Capability.no')}</td>
                    <td>{formatDocdb8ScoreRange(row.test?.scoreSummary, activeLang, t)}</td>
                    <td>{t('vector.docdb8Capability.durationMs').replace('{ms}', formatNumber(row.test?.durationMs, activeLang))}</td>
                    <td>{row.test?.error?.message || t('vector.docdb8Capability.noError')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              {t('vector.docdb8Capability.oversamplingHint')
                .replace('{selectivity}', feedbackSelectivityPercent)
                .replace('{candidates}', estimatedCandidates)}
            </p>
            <p>
              <strong>{t('vector.docdb8Capability.recommendedStrategy')}:</strong>{' '}
              {getDocdb8RecommendationText(docdb8CapabilityResult.recommendation, t)}
            </p>
            <GcdsDetails detailsTitle={t('vector.docdb8Capability.rawResults')} className="mb-400" tabIndex="0">
              <pre>{JSON.stringify(docdb8CapabilityResult.tests, null, 2)}</pre>
            </GcdsDetails>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.embeddingManagement')}</h2>
        <GcdsText>
          {t('vector.embeddingDescription')}
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
            {embeddingProgress?.loading && !isAutoProcessingEmbeddings ? t('vector.processing') : t('vector.generateEmbeddings')}
          </GcdsButton>
          <GcdsButton 
            onClick={handleRegenerateEmbeddings}
            disabled={embeddingProgress?.loading || isAutoProcessingEmbeddings}
            variant="danger"
            className="mb-200 mr-200"
          >
            {isRegeneratingEmbeddings ? t('vector.regenerating') : t('vector.regenerateEmbeddings')}
          </GcdsButton>
        </div>
        {embeddingProgress && (
          <div className="mb-200">
            <p>
              {embeddingProgress.remaining !== undefined && (
                <span> • {t('vector.remaining')}: {embeddingProgress.remaining}</span>
              )}
              {isAutoProcessingEmbeddings && (
                <span> • <strong>{t('vector.autoProcessingActive')}</strong></span>
              )}
            </p>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.similarChats')}</h2>
        <GcdsText>
          {t('vector.similarChatsDescription')}
        </GcdsText>
       
        <SimilarChatsDashboard lang={lang || language} />
        
      </div>
    </GcdsContainer>
  );
};

export default VectorPage;
