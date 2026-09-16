/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import $ from 'jquery';
import { wireTableAccessibility, installPagingFocusGuard, getHeaderTitleText } from '../dataTableAccessibility.js';

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

describe('installPagingFocusGuard', () => {
  it('hands focus to the current page button when the focused paging button is removed by a draw', () => {
    vi.useFakeTimers();
    installPagingFocusGuard();
    const container = document.createElement('div');
    container.className = 'dt-container';
    container.innerHTML = '<table></table><div class="dt-paging"><button class="dt-paging-button current" data-dt-idx="0">1</button><button class="dt-paging-button next" data-dt-idx="next">Next</button></div>';
    document.body.appendChild(container);
    const next = container.querySelector('.next');
    next.focus();
    expect(document.activeElement).toBe(next);
    // DataTables: activating Next onto the last page re-renders it disabled
    // (display:none in admin.css) - simulate by removing it, then draw.
    next.remove();
    expect(document.activeElement).toBe(document.body);
    $(container.querySelector('table')).trigger('draw.dt');
    vi.runAllTimers();
    expect(document.activeElement).toBe(container.querySelector('.current'));
    vi.useRealTimers();
    container.remove();
  });

  it('ignores a draw from a different table, and forgets the button after a click elsewhere', () => {
    vi.useFakeTimers();
    installPagingFocusGuard();
    const a = document.createElement('div');
    a.className = 'dt-container';
    a.innerHTML = '<table></table><div class="dt-paging"><button class="dt-paging-button current">1</button><button class="dt-paging-button next">Next</button></div>';
    const b = document.createElement('div');
    b.className = 'dt-container';
    b.innerHTML = '<table></table><div class="dt-paging"><button class="dt-paging-button current">1</button></div>';
    document.body.append(a, b);
    a.querySelector('.next').focus();
    // Another table (a timed refresh) draws: not ours, leave focus alone.
    a.querySelector('.next').remove();
    $(b.querySelector('table')).trigger('draw.dt');
    vi.runAllTimers();
    expect(document.activeElement).toBe(document.body);
    // Click on blank page area, then our table draws: the user left, do nothing.
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    $(a.querySelector('table')).trigger('draw.dt');
    vi.runAllTimers();
    expect(document.activeElement).toBe(document.body);
    vi.useRealTimers();
    a.remove(); b.remove();
  });

  it('leaves focus alone when it was not on a paging button', () => {
    vi.useFakeTimers();
    installPagingFocusGuard();
    const container = document.createElement('div');
    container.className = 'dt-container';
    container.innerHTML = '<input /><table></table><div class="dt-paging"><button class="dt-paging-button current">1</button></div>';
    document.body.appendChild(container);
    const input = container.querySelector('input');
    input.focus();
    $(container.querySelector('table')).trigger('draw.dt');
    vi.runAllTimers();
    expect(document.activeElement).toBe(input);
    vi.useRealTimers();
    container.remove();
  });
});

describe('getHeaderTitleText', () => {
  it('prefers .dt-column-title and falls back to the whole header', () => {
    const th = document.createElement('th');
    th.textContent = 'Plain';
    expect(getHeaderTitleText(th)).toBe('Plain');
    const titled = document.createElement('th');
    titled.innerHTML = '<span class="dt-column-title"> Titled </span><select><option>Any</option></select>';
    expect(getHeaderTitleText(titled)).toBe('Titled');
  });
});
