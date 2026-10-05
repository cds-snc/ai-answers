/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SearchResultsPanel from '../SearchResultsPanel.js';

const t = (key) => ({
  'reviewPanels.searchResultsTitle': 'Search results',
  'reviewPanels.searchQuery': 'Search query:',
  'reviewPanels.searchResultsCached': 'Served from cache',
  'reviewPanels.searchResultsDownloaded': 'Fetched from search',
  'reviewPanels.notAvailable': 'N/A',
}[key] || key);

describe('SearchResultsPanel', () => {
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
