import React from 'react';
import { useAnswerNumberLabel } from '../../../hooks/useAnswerNumberLabel.js';
import { getSearchLanguage } from '../../../utils/searchLanguage.js';

const SearchResultsPanel = ({ message, t, answerNumber, lang = 'en', chatLang = 'en' }) => {
  const { withAnswerNumber } = useAnswerNumberLabel(t, answerNumber);
  const context = message?.interaction?.context;
  if (!context?.searchResults) return null;

  const fromCache = context.searchCacheStatus === 'hit';
  const searchLang = getSearchLanguage(chatLang, context.originalLang);

  return (
    <details className="review-details" lang={lang}>
      <summary>{withAnswerNumber(t('reviewPanels.searchResultsTitle'))}</summary>
      <div className="review-panel">
        <p>
          <strong>{t('reviewPanels.searchQuery')}</strong>{' '}
          {context.searchQuery
            ? <span lang={searchLang}>{context.searchQuery}</span>
            : t('reviewPanels.notAvailable')}
        </p>
        {(fromCache || context.searchCacheStatus === 'downloaded') && (
          <p>
            <span className={`label ${fromCache ? 'correct' : 'partial'}`}>
              {fromCache ? t('reviewPanels.searchResultsCached') : t('reviewPanels.searchResultsDownloaded')}
            </span>
          </p>
        )}
        <pre className="url-break-all" lang={searchLang}>{context.searchResults}</pre>
      </div>
    </details>
  );
};

export default SearchResultsPanel;
