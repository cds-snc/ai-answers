/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SearchResultsPanel from '../SearchResultsPanel.js';
import en from '../../../../locales/en.json';
import fr from '../../../../locales/fr.json';

vi.mock('@gcds-core/components-react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    GcdsLink: ({ children, href, target }) => <a href={href} target={target}>{children}</a>
  };
});

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
    const title = searchLang === 'fr' ? 'Prestations' : 'Benefits';
    const results = `Title: ${title}`;
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
    expect(screen.getByText(title).getAttribute('lang')).toBe(searchLang);
    expect(screen.getByText(translate('reviewPanels.searchResultFields.title')).closest('[lang]').getAttribute('lang')).toBe(adminLang);
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
    expect(screen.getByText('Benefits')).toBeTruthy();
    expect(screen.getByText('Served from cache')).toBeTruthy();
  });

  it('shows each result as its own label/value list', () => {
    const searchResults = [
      'Title: EI regular benefits: Apply - Canada.ca',
      'Department: Employment and Social Development Canada',
      'Link: https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit/apply.html',
      'Summary: To find out if you\'re eligible, apply.',
      '',
      'Title: Employment Insurance benefits - Canada.ca',
      'Link: https://www.canada.ca/en/services/benefits/ei.html',
      'Summary: ',
      '',
    ].join('\n');
    const translate = (key) => key.split('.').reduce((value, part) => value[part], fr);
    const { container } = render(<SearchResultsPanel t={translate} lang="fr" message={{ interaction: { context: { searchResults } } }} />);

    const items = container.querySelectorAll('.search-results-list > dl');
    expect(items).toHaveLength(2);
    // Each dl is named by its own "Result N" label, as in EvalPanel's summary.
    expect([...items].map((dl) => container.ownerDocument.getElementById(dl.getAttribute('aria-labelledby')).textContent)).toEqual(['Résultat 1', 'Résultat 2']);
    expect([...items[0].querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Titre', 'Ministère', 'Lien', 'Résumé']);
    expect(items[0].querySelector('dd').textContent).toBe('EI regular benefits: Apply - Canada.ca');
    const link = items[1].querySelector('a');
    expect(link.getAttribute('href')).toBe('https://www.canada.ca/en/services/benefits/ei.html');
    expect(link.getAttribute('target')).toBe('_blank');
    expect([...items[1].querySelectorAll('dd')].map((dd) => dd.textContent)).toEqual([
      'Employment Insurance benefits - Canada.ca',
      'https://www.canada.ca/en/services/benefits/ei.html',
      '',
    ]);
  });

  it('leaves a link value that is not an http(s) URL as plain text', () => {
    const searchResults = 'Title: A\nLink: javascript:alert(1)\nSummary: B\n\nTitle: C\nLink: No link available\nSummary: D';
    const { container } = render(<SearchResultsPanel t={t} message={{ interaction: { context: { searchResults } } }} />);
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeTruthy();
  });

  it('shows text that is not in the results format as-is', () => {
    const { container } = render(<SearchResultsPanel t={t} message={{ interaction: { context: { searchResults: 'No results found.' } } }} />);
    expect(container.querySelector('.search-results-list')).toBeNull();
    expect(screen.getByText('No results found.').getAttribute('lang')).toBe('en');
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
