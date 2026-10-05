import React from 'react';
import { useAnswerNumberLabel } from '../../../hooks/useAnswerNumberLabel.js';

const SearchResultsPanel = ({ message, t, answerNumber }) => {
  const { withAnswerNumber } = useAnswerNumberLabel(t, answerNumber);
  const context = message?.interaction?.context;
  if (!context?.searchResults) return null;

  const fromCache = context.searchCacheStatus === 'hit';

  return (
    <details className="review-details">
      <summary>{withAnswerNumber(t('reviewPanels.searchResultsTitle'))}</summary>
      <div className="review-panel">
        <p>
          <strong>{t('reviewPanels.searchQuery')}</strong> {context.searchQuery || t('reviewPanels.notAvailable')}
        </p>
        {(fromCache || context.searchCacheStatus === 'downloaded') && (
          <p>
            <span className={`label ${fromCache ? 'correct' : 'partial'}`}>
              {fromCache ? t('reviewPanels.searchResultsCached') : t('reviewPanels.searchResultsDownloaded')}
            </span>
          </p>
        )}
        <pre className="url-break-all">{context.searchResults}</pre>
      </div>
    </details>
  );
};

export default SearchResultsPanel;
