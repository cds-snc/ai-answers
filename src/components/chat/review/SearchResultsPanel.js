import React from 'react';
import { GcdsLink } from '@gcds-core/components-react';
import { useAnswerNumberLabel } from '../../../hooks/useAnswerNumberLabel.js';
import { getSearchLanguage } from '../../../utils/searchLanguage.js';
import { parseSearchResults } from '../../../utils/chat/parseSearchResults.js';

// English labels baked into the model-facing text (agents/tools/*ContextSearch.js)
// → translated label keys, so the label reads in the admin language.
const FIELD_LABEL_KEYS = {
  Title: 'reviewPanels.searchResultFields.title',
  Organization: 'reviewPanels.searchResultFields.organization',
  Department: 'admin.common.columns.department',
  Link: 'reviewPanels.searchResultFields.link',
  Summary: 'reviewPanels.searchResultFields.summary',
};

const SearchResultsPanel = ({ message, t, answerNumber, lang = 'en', chatLang = 'en' }) => {
  const { withAnswerNumber } = useAnswerNumberLabel(t, answerNumber);
  const context = message?.interaction?.context;
  if (!context?.searchResults) return null;

  const fromCache = context.searchCacheStatus === 'hit';
  const searchLang = getSearchLanguage(chatLang, context.originalLang);
  const results = parseSearchResults(context.searchResults, Object.keys(FIELD_LABEL_KEYS));

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
        {results ? (
          <ol className="search-results-list">
            {results.map((fields, i) => (
              <li key={i}>
                <p className="font-bold mt-300 mb-0">
                  {t('reviewPanels.searchResultNumber').replace('{number}', i + 1)}
                </p>
                <dl>
                  {fields.map(({ label, value }) => (
                    <React.Fragment key={label}>
                      <dt>{t(FIELD_LABEL_KEYS[label])}</dt>
                      <dd lang={searchLang}>
                        {label === 'Link' && /^https?:\/\//i.test(value)
                          ? <GcdsLink href={value} target="_blank" lang={searchLang} className="url-break-all">{value}</GcdsLink>
                          : value}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        ) : (
          <p className="search-results-text font-size-text-xsm-nr" lang={searchLang}>{context.searchResults}</p>
        )}
      </div>
    </details>
  );
};

export default SearchResultsPanel;
