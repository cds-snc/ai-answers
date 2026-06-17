import React, { useRef, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsButton, GcdsLink, GcdsDetails } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import DataStoreService from '../services/DataStoreService.js';
import VectorService from '../services/VectorService.js';
import SimilarChatsDashboard from '../components/admin/SimilarChatsDashboard.js';
import { formatDecimal, formatNumber } from '../utils/numberFormat.js';

const METADATA_BACKFILL_DELAY_MS = 500;

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

const VectorPage = ({ lang = 'en' }) => {
  const { language } = usePageContext();
  const activeLang = lang || language;
  const { t } = useTranslations(activeLang);
  const fmtN = (n) => formatNumber(n, activeLang);
  const [vectorStats, setVectorStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [docdb8CapabilityResults, setDocdb8CapabilityResults] = useState({});
  const [docdb8CapabilityLoadingProbe, setDocdb8CapabilityLoadingProbe] = useState(null);
  const [docdb8CapabilityErrors, setDocdb8CapabilityErrors] = useState({});

  // Embedding functionality state
  const [embeddingProgress, setEmbeddingProgress] = useState(null);
  const [isAutoProcessingEmbeddings, setIsAutoProcessingEmbeddings] = useState(false);
  const [isRequestInProgress, setIsRequestInProgress] = useState(false);
  const [isRegeneratingEmbeddings, setIsRegeneratingEmbeddings] = useState(false);
  const [provider, setProvider] = useState('openai');
  const [metadataProgress, setMetadataProgress] = useState(null);
  const [isBackfillingMetadata, setIsBackfillingMetadata] = useState(false);
  const [stopMetadataBackfill, setStopMetadataBackfill] = useState(false);
  const stopMetadataBackfillRef = useRef(false);

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
    } catch (generateError) {
      console.error('Error generating embeddings:', generateError);
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

  const handleBackfillMetadata = async (lastId = metadataProgress?.lastProcessedId || null) => {
    if (isBackfillingMetadata) return;
    setIsBackfillingMetadata(true);
    setStopMetadataBackfill(false);
    stopMetadataBackfillRef.current = false;
    let nextLastId = lastId;
    try {
      while (true) {
        const result = await VectorService.backfillMetadata({ lastProcessedId: nextLastId, limit: 100 });
        setMetadataProgress(result);
        nextLastId = result.lastProcessedId || nextLastId;
        if (result.remaining <= 0 || stopMetadataBackfillRef.current) break;
        await new Promise(resolve => setTimeout(resolve, METADATA_BACKFILL_DELAY_MS));
      }
    } catch (err) {
      console.error('Error backfilling embedding metadata:', err);
      alert(t('vector.metadataBackfillFailed'));
    } finally {
      setIsBackfillingMetadata(false);
    }
  };

  const handleStopMetadataBackfill = () => {
    stopMetadataBackfillRef.current = true;
    setStopMetadataBackfill(true);
  };

  const handleRunDocdb8CapabilityTest = async (probe) => {
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
    } catch (err) {
      setDocdb8CapabilityErrors((current) => ({
        ...current,
        [probe]: err.message,
      }));
    } finally {
      setDocdb8CapabilityLoadingProbe(null);
    }
  };

  const docdb8ProbeDefinitions = getDocdb8ProbeDefinitions(t);
  const loadedDocdb8Results = docdb8ProbeDefinitions
    .map(({ key, label }) => ({
      key,
      label,
      result: docdb8CapabilityResults[key],
      error: docdb8CapabilityErrors[key],
    }))
    .filter((entry) => entry.result || entry.error);

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
        {error && <div className="error-message">{error}</div>}
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
        <div className="button-group">
          {docdb8ProbeDefinitions.map((probe) => (
            <GcdsButton
              key={probe.key}
              onClick={() => handleRunDocdb8CapabilityTest(probe.key)}
              disabled={docdb8CapabilityLoadingProbe === probe.key}
              className="mb-200 mr-200"
            >
              {docdb8CapabilityLoadingProbe === probe.key ? t('vector.docdb8Capability.running') : probe.label}
            </GcdsButton>
          ))}
        </div>
        <GcdsText>
          {t('vector.docdb8Capability.singleProbeDescription')}
        </GcdsText>
        {loadedDocdb8Results.length > 0 && (
          <div className="mb-400">
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
                {loadedDocdb8Results.map(({ key, label, result, error: probeError }) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{result?.test?.supported ? t('vector.docdb8Capability.pass') : t('vector.docdb8Capability.fail')}</td>
                    <td>{fmtN(result?.test?.resultCount)}</td>
                    <td>{result?.test?.metadata?.candidateReductionBeforeVectorSearch ? t('vector.docdb8Capability.yes') : t('vector.docdb8Capability.no')}</td>
                    <td>{formatDocdb8ScoreRange(result?.test?.scoreSummary, activeLang, t)}</td>
                    <td>{t('vector.docdb8Capability.durationMs').replace('{ms}', fmtN(result?.test?.durationMs))}</td>
                    <td>{probeError || result?.test?.error?.message || t('vector.docdb8Capability.noError')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <GcdsDetails detailsTitle={t('vector.docdb8Capability.rawResults')} className="mb-400" tabIndex="0">
              <pre>{JSON.stringify(docdb8CapabilityResults, null, 2)}</pre>
            </GcdsDetails>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.embeddingManagement')}</h2>
        <GcdsText>
          {t('vector.embeddingDescription')}
        </GcdsText>
        <div className="button-group">
          <select value={provider} onChange={e => setProvider(e.target.value)} className="mr-200">
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
                <span> {t('vector.remaining')}: {fmtN(embeddingProgress.remaining)}</span>
              )}
              {isAutoProcessingEmbeddings && (
                <span> <strong>{t('vector.autoProcessingActive')}</strong></span>
              )}
            </p>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.metadataBackfillTitle')}</h2>
        <GcdsText>
          {t('vector.metadataBackfillDescription')}
        </GcdsText>
        <div className="button-group">
          <GcdsButton
            onClick={() => handleBackfillMetadata()}
            disabled={isBackfillingMetadata}
            className="mb-200 mr-200"
          >
            {metadataProgress?.lastProcessedId ? t('vector.resumeMetadataBackfill') : t('vector.startMetadataBackfill')}
          </GcdsButton>
          <GcdsButton
            onClick={handleStopMetadataBackfill}
            disabled={!isBackfillingMetadata}
            variant="secondary"
            className="mb-200 mr-200"
          >
            {t('vector.stopMetadataBackfill')}
          </GcdsButton>
        </div>
        {metadataProgress && (
          <div className="mb-200">
            <p>
              <span>{t('vector.metadataProcessed')}: {fmtN(metadataProgress.processed)}</span>
              <span> {t('vector.remaining')}: {fmtN(metadataProgress.remaining)}</span>
              {isBackfillingMetadata && (
                <span> <strong>{t('vector.autoProcessingActive')}</strong></span>
              )}
              {stopMetadataBackfill && !isBackfillingMetadata && (
                <span> <strong>{t('vector.metadataBackfillStopped')}</strong></span>
              )}
            </p>
          </div>
        )}
        <hr className="mb-400" />
        <h2>{t('vector.similarChats')}</h2>
        <GcdsText>
          {t('vector.similarChatsDescription')}
        </GcdsText>

        <SimilarChatsDashboard lang={activeLang} />

      </div>
    </GcdsContainer>
  );
};

export default VectorPage;
