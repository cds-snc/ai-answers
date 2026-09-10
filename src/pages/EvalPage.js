import React, { useState } from 'react';
import { GcdsContainer, GcdsText, GcdsButton, GcdsDetails, GcdsLink } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
// Removed unused imports
import EvaluationService from '../services/EvaluationService.js';
import StatusMessage from '../components/admin/StatusMessage.js';

const EvalPage = ({ lang = 'en' }) => {
  const { language } = usePageContext();
  const { t } = useTranslations(lang);
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
            alert(t('eval.allEvalsGenerated').replace('{processed}', result.processed || 0).replace('{failed}', result.failed || 0));
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
        alert(t('eval.generateEvalsFailed'));
      }
      setIsAutoProcessingEvals(false);
    } finally {
      setIsEvalRequestInProgress(false);
    }
  };

  const handleDeleteEvals = async () => {
    const confirmed = window.confirm(t('eval.deleteEvalsConfirm'));
    if (!confirmed) return;
    try {
      const result = await EvaluationService.deleteEvals({ startTime: startTime || undefined, endTime: endTime || undefined });
      alert(t('eval.deleteEvalsSuccess').replace('{deleted}', result.deleted).replace('{expertFeedbackDeleted}', result.expertFeedbackDeleted));
    } catch (error) {
      alert(t('eval.deleteEvalsFailed'));
    }
  };

  // New handler for deleting only empty evals
  const handleDeleteEmptyEvals = async () => {
    const confirmed = window.confirm(t('eval.deleteEmptyEvalsConfirm'));
    if (!confirmed) return;
    try {
      const result = await EvaluationService.deleteEvals({ startTime: startTime || undefined, endTime: endTime || undefined, onlyEmpty: true });
      alert(t('eval.deleteEmptyEvalsSuccess').replace('{deleted}', result.deleted).replace('{expertFeedbackDeleted}', result.expertFeedbackDeleted));
    } catch (error) {
      alert(t('eval.deleteEmptyEvalsFailed'));
    }
  };

  return (
    <GcdsContainer layout="page">
      <h1 className="mb-400">{t('admin.navigation.eval')}</h1>
      
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      <div className="mb-400">
        <h2>{t('admin.evalPage.similarityTitle')}</h2>
        <GcdsText>
          {t('admin.evalPage.similarityDescription')}
        </GcdsText>
        {expertFeedbackCount !== null && (
          <GcdsText>
            <strong>{t('admin.evalPage.label.expertEvaluations')}</strong> {expertFeedbackCount}
          </GcdsText>
        )}
        {nonEmptyEvalCount !== null && (
          <GcdsText>
            <strong>{t('admin.evalPage.label.nonEmptyEvaluations')}</strong> {nonEmptyEvalCount}
          </GcdsText>
        )}
        <GcdsDetails detailsTitle={t('admin.evalPage.detailsTitle')} className="mt-400">
          <ol className="mb-200">
            <li>
              <strong>{t('admin.evalPage.step.initialValidation.title')}:</strong>
              {' '}
              {t('admin.evalPage.step.initialValidation.description')}
            </li>
            <li>
              <strong>{t('admin.evalPage.step.embeddingRetrieval.title')}:</strong>
              {' '}
              {t('admin.evalPage.step.embeddingRetrieval.description')}
            </li>
            <li>
              <strong>{t('admin.evalPage.step.findingSimilar.title')}:</strong>
              {' '}
              {t('admin.evalPage.step.findingSimilar.description')}
              <ul>
                <li>{t('admin.evalPage.step.findingSimilar.item.expertFeedback')}</li>
                <li>{t('admin.evalPage.step.findingSimilar.item.qaSimilarity')}</li>
                <li>{t('admin.evalPage.step.findingSimilar.item.maxMatches')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.sentenceMatching.title')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.sentenceMatching.item.findMostSimilar')}</li>
                <li>{t('admin.evalPage.step.sentenceMatching.item.threshold')}</li>
                <li>{t('admin.evalPage.step.sentenceMatching.item.transfer')}</li>
                <li>{t('admin.evalPage.step.sentenceMatching.item.telemetry')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.citationMatch.title')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.citationMatch.item.compare')}</li>
                <li>{t('admin.evalPage.step.citationMatch.item.score')}</li>
                <li>{t('admin.evalPage.step.citationMatch.item.searchPage')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.qaFallback.title')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.qaFallback.item.checkTop')}</li>
                <li>{t('admin.evalPage.step.qaFallback.item.citationCheck')}</li>
                <li>{t('admin.evalPage.step.qaFallback.item.useQaOnly')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.fallbackCompare.title')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.fallbackCompare.item.agent')}</li>
                <li>{t('admin.evalPage.step.fallbackCompare.item.record')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.creation.title')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.creation.item.createFeedback')}</li>
                <li>{t('admin.evalPage.step.creation.item.computeScore')}</li>
                <li>{t('admin.evalPage.step.creation.item.mapFeedback')}</li>
                <li>{t('admin.evalPage.step.creation.item.recordSimilarities')}</li>
                <li>{t('admin.evalPage.step.creation.item.updateInteraction')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.noMatch.title')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.noMatch.item.recordNoMatch')}</li>
                <li>{t('admin.evalPage.step.noMatch.item.trace')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.timeline.title')}:</strong>
              <ul>
                <li>{t('admin.evalPage.step.timeline.item.record')}</li>
                <li>{t('admin.evalPage.step.timeline.item.telemetry')}</li>
              </ul>
            </li>
          </ol>
        </GcdsDetails>
        <br/>
        {/* Evaluation metrics summary */}
        <div className="mt-400">
          <h3>{t('admin.evalPage.metrics.title')}</h3>
          {evalMetrics ? (
            <div>
              <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">{t('reviewPanels.metric')}</span></th>
                    <th scope="col"><span className="sr-only">{t('reviewPanels.value')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{t('admin.evalPage.metrics.total')}</td>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{evalMetrics.total}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{t('admin.evalPage.metrics.processed')}</td>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{evalMetrics.processed}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{t('admin.evalPage.metrics.hasMatches')}</td>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{evalMetrics.hasMatches}</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-200">
                <h4>{t('admin.evalPage.metrics.noMatchReasons')}</h4>
                  {evalMetrics.noMatchByReason && Object.keys(evalMetrics.noMatchByReason).length > 0 ? (
                  <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th scope="col" style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>{t('admin.evalPage.metrics.reasonLabel')}</th>
                        <th scope="col" style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>{t('admin.evalPage.metrics.countLabel')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(evalMetrics.noMatchByReason).map(([k, v]) => (
                        <tr key={`nm-${k}`}>
                          <td style={{ border: '1px solid #ddd', padding: '8px' }}>{k ? t(`eval.noMatchReasonTypes.${k}`, k) : t('admin.evalPage.metrics.unknown')}</td>
                          <td style={{ border: '1px solid #ddd', padding: '8px' }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div>{t('admin.evalPage.metrics.noMatchNone')}</div>
                )}
              </div>

              <div className="mt-200">
                <h4>{t('admin.evalPage.metrics.fallbackTypes')}</h4>
                {evalMetrics.fallbackByType && Object.keys(evalMetrics.fallbackByType).length > 0 ? (
                  <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th scope="col" style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>{t('admin.evalPage.metrics.fallbackLabel')}</th>
                        <th scope="col" style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>{t('admin.evalPage.metrics.countLabel')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(evalMetrics.fallbackByType).map(([k, v]) => (
                        <tr key={`fb-${k}`}>
                          <td style={{ border: '1px solid #ddd', padding: '8px' }}>{k || t('admin.evalPage.metrics.unknown')}</td>
                          <td style={{ border: '1px solid #ddd', padding: '8px' }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div>{t('admin.evalPage.metrics.fallbackNone')}</div>
                )}
              </div>

              <div className="mt-200">
                <button onClick={() => {
                  EvaluationService.getEvalMetrics().then(setEvalMetrics).catch(() => {});
                }}>{t('admin.evalPage.metrics.refresh')}</button>
              </div>
            </div>
          ) : (
            <div>{t('admin.common.metricsLoading')}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
          <label>
            {t('admin.evalPage.date.startLabel')}:
            <input
              type="date"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              style={{ marginLeft: "0.5rem" }}
            />
          </label>
          <label>
            {t('admin.evalPage.date.endLabel')}:
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
            {evalProgress?.loading && !isAutoProcessingEvals && !isRegeneratingAll ? t('admin.evalPage.button.processing') : t('admin.evalPage.button.generate')}
          </GcdsButton>
          <GcdsButton 
            onClick={handleDeleteEvals}
            disabled={evalProgress?.loading || isAutoProcessingEvals}
            buttonRole="danger"
            className="mb-200 mr-200"
          >
            {t('admin.evalPage.button.deleteAll')}
          </GcdsButton>
          <GcdsButton 
            onClick={handleDeleteEmptyEvals}
            disabled={evalProgress?.loading || isAutoProcessingEvals}
            buttonRole="danger"
            className="mb-200"
          >
            {t('admin.evalPage.button.deleteEmpty')}
          </GcdsButton>
        </div>
          {evalProgress && (
          <StatusMessage tag="div" className="mb-200">
            <p>
              {evalProgress.processed !== undefined && (
                <span> • {t('admin.evalPage.progress.processed')}: {evalProgress.processed}</span>
              )}
              {evalProgress.failed !== undefined && (
                <span> • {t('admin.evalPage.progress.failed')}: {evalProgress.failed}</span>
              )}
              {evalProgress.remaining !== undefined && (
                <span> • {t('admin.evalPage.progress.remaining')}: {evalProgress.remaining}</span>
              )}
              {evalProgress.duration !== undefined && (
                <span> • {t('admin.evalPage.progress.duration')}: {evalProgress.duration}s</span>
              )}
              {isAutoProcessingEvals && !isRegeneratingAll && (
                <span> • <strong>{t('admin.evalPage.progress.autoProcessing')}</strong></span>
              )}
              {isRegeneratingAll && (
                <span> • <strong>{t('admin.evalPage.progress.regeneratingAll')}</strong></span>
              )}
            </p>
          </StatusMessage>
        )}
      </div>
    </GcdsContainer>
  );
};

export default EvalPage;
