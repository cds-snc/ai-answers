/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wireTableAccessibility } from '../dataTableAccessibility.js';

const t = (key) => {
  const map = {
    'dashboardFilter.removeFilter': 'Remove filter',
    'admin.common.searchTermPillLabel': 'Search: {term}',
  };
  return map[key] || key;
};

function makeFakeApi({ searchTerm = '' } = {}) {
  const headers = [document.createElement('th'), document.createElement('th')];
  const container = document.createElement('div');
  const searchDiv = document.createElement('div');
  searchDiv.className = 'dt-search';
  const searchInput = document.createElement('input');
  searchDiv.appendChild(searchInput);
  container.appendChild(searchDiv);
  // Real DOM interaction (focus/blur) requires attachment to the document -
  // jsdom's document.activeElement never reflects a detached tree.
  document.body.appendChild(container);

  let currentSearch = searchTerm;
  const searchHandlers = [];

  return {
    columns: () => ({ header: () => ({ each: (fn) => headers.forEach(fn) }) }),
    table: () => ({ container: () => container }),
    search: (...args) => {
      if (args.length) { currentSearch = args[0]; return { draw: () => {} }; }
      return currentSearch;
    },
    on: (event, handler) => { if (event === 'search.dt') searchHandlers.push(handler); },
    _fireSearch: (term) => { currentSearch = term; searchHandlers.forEach((h) => h()); },
    _headers: headers,
    _container: container,
    _searchInput: searchInput,
  };
}

describe('wireTableAccessibility', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sets scope="col" on every header cell', () => {
    const api = makeFakeApi();
    wireTableAccessibility(api, { t });
    api._headers.forEach((h) => expect(h.getAttribute('scope')).toBe('col'));
  });

  it('creates a hidden pill when there is no active search term', () => {
    const api = makeFakeApi({ searchTerm: '' });
    wireTableAccessibility(api, { t });
    const pill = api._container.querySelector('.dashboard-search-pill');
    expect(pill).toBeTruthy();
    expect(pill.style.display).toBe('none');
  });

  it('shows the pill with the current term once a search is applied', () => {
    const api = makeFakeApi({ searchTerm: '' });
    wireTableAccessibility(api, { t });
    api._fireSearch('tax');
    const pill = api._container.querySelector('.dashboard-search-pill');
    expect(pill.style.display).not.toBe('none');
    expect(pill.textContent).toContain('tax');
  });

  it('clears the search when the pill is clicked', () => {
    const api = makeFakeApi({ searchTerm: 'tax' });
    wireTableAccessibility(api, { t });
    // initial render picks up the pre-existing term
    const pill = api._container.querySelector('.dashboard-search-pill');
    expect(pill.style.display).not.toBe('none');
    pill.onclick();
    expect(api.search()).toBe('');
  });

  it('moves focus back into the search box when the pill is clicked, instead of dropping it to <body>', () => {
    // Regression test: the pill hides itself (display: none, in
    // renderSearchPill) right after this fires - a focused element that
    // becomes display:none drops focus to <body> with no indication where
    // it went. Landing back in the search box is also just standard
    // "clear search" UX.
    const api = makeFakeApi({ searchTerm: 'tax' });
    wireTableAccessibility(api, { t });
    const pill = api._container.querySelector('.dashboard-search-pill');
    pill.focus();
    expect(document.activeElement).toBe(pill);

    pill.onclick();

    expect(document.activeElement).toBe(api._searchInput);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('never throws when searching is disabled (no .dt-search container)', () => {
    const api = makeFakeApi();
    api.table = () => ({ container: () => document.createElement('div') });
    expect(() => wireTableAccessibility(api, { t })).not.toThrow();
  });

  it('never throws when the api itself throws', () => {
    const api = { columns: () => { throw new Error('boom'); } };
    expect(() => wireTableAccessibility(api, { t })).not.toThrow();
  });
});
