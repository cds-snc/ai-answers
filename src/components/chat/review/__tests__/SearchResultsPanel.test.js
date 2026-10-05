/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SearchResultsPanel from '../SearchResultsPanel.js';
import en from '../../../../locales/en.json';
import fr from '../../../../locales/fr.json';

const t = (key) => ({
  'reviewPanels.searchResultsTitle': 'Search results',
  'reviewPanels.searchQuery': 'Search query:',
  'reviewPanels.searchResultsCached': 'Served from cache',
  'reviewPanels.searchResultsDownloaded': 'Fetched from search',
  'reviewPanels.notAvailable': 'N/A',
}[key] || key);

describe('SearchResultsPanel', () => {
  it.each([
    ['en', 'en', 'fra', 'fr'],
    ['fr', 'en', 'eng', 'en'],
    ['en', 'fr', 'eng', 'fr'],
    ['fr', 'en', 'spa', 'en'],
  ])('tags %s admin labels and search content for a %s chat with a %s question', (adminLang, chatLang, originalLang, searchLang) => {
    const locale = adminLang === 'fr' ? fr : en;
    const translate = (key) => key.split('.').reduce((value, part) => value[part], locale);
    const query = searchLang === 'fr' ? 'prestations pour les personnes âgées' : 'benefits for seniors';
    const results = searchLang === 'fr' ? 'Title: Prestations' : 'Title: Benefits';
    const { container } = render(
      <SearchResultsPanel
        t={translate}
        lang={adminLang}
        chatLang={chatLang}
        message={{ interaction: { context: { originalLang, searchQuery: query, searchResults: results, searchCacheStatus: 'hit' } } }}
      />
    );

    expect(container.querySelector('details').getAttribute('lang')).toBe(adminLang);
    expect(screen.getByText(query).getAttribute('lang')).toBe(searchLang);
    expect(screen.getByText(results).getAttribute('lang')).toBe(searchLang);
    expect(screen.getByText(translate('reviewPanels.searchQuery')).closest('[lang]').getAttribute('lang')).toBe(adminLang);
    expect(screen.getByText(translate('reviewPanels.searchResultsCached')).closest('[lang]').getAttribute('lang')).toBe(adminLang);
  });

  it('keeps the unavailable-query label in the admin language', () => {
    render(<SearchResultsPanel t={t} lang="en" chatLang="fr" message={{ interaction: { context: { searchResults: 'Title: Prestations', originalLang: 'fra' } } }} />);
    expect(screen.getByText('N/A').closest('[lang]').getAttribute('lang')).toBe('en');
  });

  it('shows the persisted query, results, and cache origin for reviewers', () => {
    render(
      <SearchResultsPanel
        t={t}
        message={{ interaction: { context: {
          searchQuery: 'benefits for seniors',
          searchResults: 'Title: Benefits',
          searchCacheStatus: 'hit',
        } } }}
      />
    );

    expect(screen.getByText('Search results')).toBeTruthy();
    expect(screen.getByText('benefits for seniors')).toBeTruthy();
    expect(screen.getByText('Title: Benefits')).toBeTruthy();
    expect(screen.getByText('Served from cache')).toBeTruthy();
  });

  it('does not render when the interaction has no search results', () => {
    const { container } = render(<SearchResultsPanel t={t} message={{ interaction: { context: {} } }} />);
    expect(container.innerHTML).toBe('');
  });

  it('does not label an unknown cache status as downloaded', () => {
    render(<SearchResultsPanel t={t} message={{ interaction: { context: { searchResults: 'Title: A' } } }} />);
    expect(screen.queryByText('Fetched from search')).toBeNull();
  });
});
