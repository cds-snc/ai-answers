import React, { useCallback, useEffect, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsButton, GcdsDetails, GcdsLink, GcdsFieldset, GcdsHeading } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { useErrorStatus } from '../hooks/useErrorStatus.js';
import EvaluationService from '../services/EvaluationService.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import { formatNumber } from '../utils/numberFormat.js';
import { announce } from '../utils/liveAnnouncer.js';

// Reasons with a label under eval.noMatchReasonTypes; anything else is shown as "Unknown" + its raw code.
const NO_MATCH_REASONS = new Set([
  'no_embeddings', 'no_qa_match', 'forced_fallback_no_match', 'no_sentence_match', 'no_citation_match', 'unknown',
]);

const EvalPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { buildErrorStatus, renderStatusMessage } = useErrorStatus(t);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(null);
  // Which delete is running ('all' | 'empty'), so only its button says "Deleting...".
  const [deleting, setDeleting] = useState(null);
  const isBusy = isGenerating || deleting !== null;
  // Outcome of the last generate/delete run, shown under the buttons.
  const [actionMessage, setActionMessage] = useState(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Counts + metrics in one fetch, so one loading state and one error cover
  // them. Returns false on failure so callers can skip their success path.
  const loadStats = useCallback(async () => {
    setStatsError(null);
    try {
      const [expertFeedbackCount, nonEmptyEvalCount, metrics] = await Promise.all([
        EvaluationService.getExpertFeedbackCount(),
        EvaluationService.getEvalNonEmptyCount(),
        EvaluationService.getEvalMetrics(),
      ]);
      setStats({ expertFeedbackCount, nonEmptyEvalCount, ...metrics });
      return true;
    } catch (error) {
      setStatsError(buildErrorStatus('admin.common.fetchError', error));
      return false;
    }
  }, [buildErrorStatus]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleRefreshStats = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    if (await loadStats()) announce(t('admin.evalPage.metrics.refreshed'));
    setIsRefreshing(false);
  };

  const dateRange = () => ({
    ...(startTime && { startTime }),
    ...(endTime && { endTime }),
  });

  // The server works in ~30s batches; keep asking until nothing is left,
  // adding up each batch's counts for the final message.
  const handleGenerateEvals = async () => {
    if (isBusy) return;
    setIsGenerating(true);
    setActionMessage(null);
    setGenerateProgress(null);
    const totals = { processed: 0, failed: 0, remaining: 0 };
    let lastProcessedId = null;
    try {
      do {
        const result = await EvaluationService.generateEvals({ ...dateRange(), lastProcessedId });
        if (typeof result.remaining !== 'number') {
          throw new Error('Invalid response format from server');
        }
        totals.processed += result.processed || 0;
        totals.failed += result.failed || 0;
        totals.remaining = result.remaining;
        lastProcessedId = result.lastProcessedId;
        setGenerateProgress({ ...totals });
      } while (totals.remaining > 0);
      setActionMessage({
        text: t('eval.allEvalsGenerated')
          .replace('{processed}', () => formatNumber(totals.processed, lang))
          .replace('{failed}', () => formatNumber(totals.failed, lang)),
      });
      loadStats();
    } catch (error) {
      console.error('Error generating evals:', error);
      setActionMessage(buildErrorStatus('eval.generateEvalsFailed', error));
    } finally {
      setIsGenerating(false);
      setGenerateProgress(null);
    }
  };

  const handleDeleteEvals = async (onlyEmpty) => {
    if (isBusy) return;
    const confirmText = onlyEmpty ? t('eval.deleteEmptyEvalsConfirm') : t('eval.deleteEvalsConfirm');
    if (!window.confirm(confirmText)) return;
    setActionMessage(null);
    setDeleting(onlyEmpty ? 'empty' : 'all');
    try {
      const result = await EvaluationService.deleteEvals({ ...dateRange(), onlyEmpty });
      if (!result.deleted) {
        // Nothing matched - a fact, not a completed action.
        setActionMessage({
          text: onlyEmpty ? t('eval.deleteEmptyEvalsNone') : t('eval.deleteEvalsNone'),
          variant: 'info',
        });
        return;
      }
      const successText = onlyEmpty ? t('eval.deleteEmptyEvalsSuccess') : t('eval.deleteEvalsSuccess');
      setActionMessage({
        text: successText
          .replace('{deleted}', () => formatNumber(result.deleted, lang))
          .replace('{expertFeedbackDeleted}', () => formatNumber(result.expertFeedbackDeleted, lang)),
      });
      loadStats();
    } catch (error) {
      setActionMessage(onlyEmpty
        ? buildErrorStatus('eval.deleteEmptyEvalsFailed', error)
        : buildErrorStatus('eval.deleteEvalsFailed', error));
    } finally {
      setDeleting(null);
    }
  };

  // Label/count pairs, same look as the Database page's record counts, one column.
  const renderCounts = (entries) => (
    <dl className="canada-ca-dl-columns canada-ca-dl-columns--single">
      {entries.map(([key, label, value]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{formatNumber(value, lang)}</dd>
        </div>
      ))}
    </dl>
  );

  const noMatchEntries = Object.entries(stats?.noMatchByReason || {});
  const fallbackEntries = Object.entries(stats?.fallbackByType || {});

  return (
    <GcdsContainer layout="page">
      <GcdsHeading tag="h1" marginBottom="400">{t('admin.navigation.eval')}</GcdsHeading>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.evalPage.similarityTitle')}</GcdsHeading>
        <GcdsText>
          {t('admin.evalPage.similarityDescription')}
        </GcdsText>
        <GcdsDetails detailsTitle={t('admin.evalPage.detailsTitle')} className="mt-400">
          <ol className="mb-200">
            <li>
              <strong>{t('admin.evalPage.step.initialValidation.title')}</strong>
              {' '}
              {t('admin.evalPage.step.initialValidation.description')}
            </li>
            <li>
              <strong>{t('admin.evalPage.step.embeddingRetrieval.title')}</strong>
              {' '}
              {t('admin.evalPage.step.embeddingRetrieval.description')}
            </li>
            <li>
              <strong>{t('admin.evalPage.step.findingSimilar.title')}</strong>
              {' '}
              {t('admin.evalPage.step.findingSimilar.description')}
              <ul>
                <li>{t('admin.evalPage.step.findingSimilar.item.expertFeedback')}</li>
                <li>{t('admin.evalPage.step.findingSimilar.item.qaSimilarity')}</li>
                <li>{t('admin.evalPage.step.findingSimilar.item.maxMatches')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.sentenceMatching.title')}</strong>
              <ul>
                <li>{t('admin.evalPage.step.sentenceMatching.item.findMostSimilar')}</li>
                <li>{t('admin.evalPage.step.sentenceMatching.item.threshold')}</li>
                <li>{t('admin.evalPage.step.sentenceMatching.item.transfer')}</li>
                <li>{t('admin.evalPage.step.sentenceMatching.item.telemetry')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.citationMatch.title')}</strong>
              <ul>
                <li>{t('admin.evalPage.step.citationMatch.item.compare')}</li>
                <li>{t('admin.evalPage.step.citationMatch.item.score')}</li>
                <li>{t('admin.evalPage.step.citationMatch.item.searchPage')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.qaFallback.title')}</strong>
              <ul>
                <li>{t('admin.evalPage.step.qaFallback.item.checkTop')}</li>
                <li>{t('admin.evalPage.step.qaFallback.item.citationCheck')}</li>
                <li>{t('admin.evalPage.step.qaFallback.item.useQaOnly')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.fallbackCompare.title')}</strong>
              <ul>
                <li>{t('admin.evalPage.step.fallbackCompare.item.agent')}</li>
                <li>{t('admin.evalPage.step.fallbackCompare.item.record')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.creation.title')}</strong>
              <ul>
                <li>{t('admin.evalPage.step.creation.item.createFeedback')}</li>
                <li>{t('admin.evalPage.step.creation.item.computeScore')}</li>
                <li>{t('admin.evalPage.step.creation.item.mapFeedback')}</li>
                <li>{t('admin.evalPage.step.creation.item.recordSimilarities')}</li>
                <li>{t('admin.evalPage.step.creation.item.updateInteraction')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.noMatch.title')}</strong>
              <ul>
                <li>{t('admin.evalPage.step.noMatch.item.recordNoMatch')}</li>
                <li>{t('admin.evalPage.step.noMatch.item.trace')}</li>
              </ul>
            </li>
            <li>
              <strong>{t('admin.evalPage.step.timeline.title')}</strong>
              <ul>
                <li>{t('admin.evalPage.step.timeline.item.record')}</li>
                <li>{t('admin.evalPage.step.timeline.item.telemetry')}</li>
              </ul>
            </li>
          </ol>
        </GcdsDetails>
      </div>

      <div className="mb-400">
        <GcdsHeading tag="h2">{t('admin.evalPage.metrics.title')}</GcdsHeading>
        {stats ? (
          <>
            {renderCounts([
              ['expert', t('admin.evalPage.label.expertEvaluations'), stats.expertFeedbackCount],
              ['nonEmpty', t('admin.evalPage.label.nonEmptyEvaluations'), stats.nonEmptyEvalCount],
              ['total', t('admin.evalPage.metrics.total'), stats.total],
              ['processed', t('admin.evalPage.metrics.processed'), stats.processed],
              ['hasMatches', t('admin.evalPage.metrics.hasMatches'), stats.hasMatches],
            ])}

            <GcdsHeading tag="h3">{t('admin.evalPage.metrics.noMatchReasons')}</GcdsHeading>
            {noMatchEntries.length > 0 ? (
              renderCounts(noMatchEntries.map(([reason, count]) => [
                reason,
                NO_MATCH_REASONS.has(reason)
                  ? t(`eval.noMatchReasonTypes.${reason}`)
                  : <>{t('eval.noMatchReasonTypes.unknown')} (<code lang="en">{reason}</code>)</>,
                count,
              ]))
            ) : (
              <GcdsText>{t('admin.evalPage.metrics.noMatchNone')}</GcdsText>
            )}

            <GcdsHeading tag="h3">{t('admin.evalPage.metrics.fallbackTypes')}</GcdsHeading>
            {fallbackEntries.length > 0 ? (
              // Raw internal code (e.g. 'qa-high-score'), not translated yet.
              renderCounts(fallbackEntries.map(([type, count]) => [
                type, <code lang="en">{type}</code>, count,
              ]))
            ) : (
              <GcdsText>{t('admin.evalPage.metrics.fallbackNone')}</GcdsText>
            )}
          </>
        ) : (
          !statsError && <GcdsText>{t('admin.common.metricsLoading')}</GcdsText>
        )}
        <GcdsButton
          buttonRole="secondary"
          onClick={handleRefreshStats}
          disabled={isRefreshing}
          className="mt-200 mb-200"
        >
          {isRefreshing ? t('admin.evalPage.metrics.refreshing') : t('admin.evalPage.metrics.refresh')}
        </GcdsButton>
        {renderStatusMessage(statsError, 'success', 'stats')}
      </div>

      <div className="mb-400 filter-fields-full-size">
        <GcdsHeading tag="h2">{t('admin.evalPage.actionsTitle')}</GcdsHeading>
        {/* Changing the range clears the last outcome - it described the
            previous range. */}
        <GcdsFieldset
          className="mb-300"
          legend={t('admin.evalPage.date.legend')}
          legendSize="h6"
          hint={t('admin.evalPage.date.hint')}
        >
          <div className="mb-300">
            <label htmlFor="eval-start-date" className="filter-label display-block">
              {t('admin.evalPage.date.startLabel')}
            </label>
            <input
              id="eval-start-date"
              type="date"
              className="filter-input filter-input--narrow"
              value={startTime}
              onChange={e => { setStartTime(e.target.value); setActionMessage(null); }}
            />
          </div>
          <div>
            <label htmlFor="eval-end-date" className="filter-label display-block">
              {t('admin.evalPage.date.endLabel')}
            </label>
            <input
              id="eval-end-date"
              type="date"
              className="filter-input filter-input--narrow"
              value={endTime}
              onChange={e => { setEndTime(e.target.value); setActionMessage(null); }}
            />
          </div>
        </GcdsFieldset>
        {/* One button per row */}
        <div className="mb-200">
          <GcdsButton onClick={handleGenerateEvals} disabled={isBusy}>
            {isGenerating ? t('admin.evalPage.button.processing') : t('admin.evalPage.button.generate')}
          </GcdsButton>
        </div>
        <div className="mb-200">
          <GcdsButton onClick={() => handleDeleteEvals(false)} disabled={isBusy} buttonRole="danger">
            {deleting === 'all' ? t('common.deleting') : t('admin.evalPage.button.deleteAll')}
          </GcdsButton>
        </div>
        <div className="mb-200">
          <GcdsButton onClick={() => handleDeleteEvals(true)} disabled={isBusy} buttonRole="danger">
            {deleting === 'empty' ? t('common.deleting') : t('admin.evalPage.button.deleteEmpty')}
          </GcdsButton>
        </div>
        {isGenerating && (
          generateProgress ? (
            <StatusMessage
              variant="info"
              message={t('admin.evalPage.progress.summary')
                .replace('{processed}', () => formatNumber(generateProgress.processed, lang))
                .replace('{failed}', () => formatNumber(generateProgress.failed, lang))
                .replace('{remaining}', () => formatNumber(generateProgress.remaining, lang))}
            />
          ) : (
            <StatusMessage loading message={t('admin.evalPage.progress.starting')} />
          )
        )}
        {renderStatusMessage(actionMessage, actionMessage?.variant || 'success', 'action')}
      </div>
    </GcdsContainer>
  );
};

export default EvalPage;
