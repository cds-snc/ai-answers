/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import EvalCoverageCard from '../dashboard/EvalCoverageCard.js';
import { MOCK_METRICS } from '../../../utils/dashboard/mockMetrics.js';

// Real translations (no useTranslations mock) so the FR copy is exercised too.
const coverage = MOCK_METRICS.evalCoverage;

describe('EvalCoverageCard', () => {
  afterEach(cleanup);

  it('renders nothing when no service is in scope', () => {
    const { container } = render(<EvalCoverageCard coverage={{ programs: [] }} lang="en" />);
    expect(container.innerHTML).toBe('');
  });

  it('is a captioned table inside a focusable, named scroll region', () => {
    render(<EvalCoverageCard coverage={coverage} lang="en" />);
    const table = screen.getByRole('table', { name: 'Evaluation coverage by service' });
    const region = screen.getByRole('region', { name: 'Evaluation coverage by service' });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.contains(table)).toBe(true);
  });

  it('gives every column a header and names each row by its service', () => {
    render(<EvalCoverageCard coverage={coverage} lang="en" />);
    const table = screen.getByRole('table');
    const colHeaders = within(table).getAllByRole('columnheader');
    expect(colHeaders).toHaveLength(9);
    colHeaders.forEach((th) => expect(th.getAttribute('scope')).toBe('col'));

    const rowHeaders = within(table).getAllByRole('rowheader');
    expect(rowHeaders.map((th) => th.textContent)).toEqual([
      'Secure Certificate of Indian Status (SCIS)',
      'Tax-free savings account (TFSA)',
      'Canada Groceries and Essentials Benefit',
      'Not yet classified',
    ]);
  });

  it('shows counts, coverage, actions in frequency order and a spoken label for empty cells', () => {
    render(<EvalCoverageCard coverage={coverage} lang="en" />);
    const scis = screen.getByRole('rowheader', { name: 'Secure Certificate of Indian Status (SCIS)' }).closest('tr');
    const cells = within(scis).getAllByRole('cell').map((td) => td.textContent);
    // actions, questions, evals, coverage, in use, expiring, informed, below perfect
    expect(cells).toEqual(['Apply, Check status, Get help with', '230', '18', '7.8%', '15', '3', '96', '28%']);

    const groceries = screen.getByRole('rowheader', { name: 'Canada Groceries and Essentials Benefit' }).closest('tr');
    const groceryCells = within(groceries).getAllByRole('cell');
    expect(groceryCells[0].textContent).toContain('No actions recorded');
    expect(groceryCells[7].textContent).toContain('Not applicable');
    // The unclassified row has no in-use / expiring counts.
    const unknownCells = within(screen.getByRole('rowheader', { name: 'Not yet classified' }).closest('tr')).getAllByRole('cell');
    expect(unknownCells[4].textContent).toContain('Not applicable');
    expect(unknownCells[5].textContent).toContain('Not applicable');
    // The em dash is visual only.
    expect(within(groceryCells[7]).getByText('—').getAttribute('aria-hidden')).toBe('true');
  });

  it('explains the columns and the recency limit in visible text', () => {
    render(<EvalCoverageCard coverage={coverage} lang="en" />);
    const dl = document.querySelector('dl.dashboard-table-notes');
    // Each term is the column header it defines.
    expect([...dl.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Evaluation coverage', 'Evaluations in use', 'Expiring soon', 'Answers using evaluations', 'Below perfect',
    ]);
    expect(screen.getByText(/from the last 365 days/).tagName).toBe('DD');
    expect(screen.getByText(/stop being used within 60 days/).tagName).toBe('DD');
  });

  it('on the French dashboard, tags an English fallback name with lang="en"', () => {
    render(<EvalCoverageCard coverage={coverage} lang="fr" />);
    expect(screen.getByRole('table', { name: 'Couverture des évaluations par service' })).toBeTruthy();

    const fallback = screen.getByText('Canada Groceries and Essentials Benefit');
    expect(fallback.tagName).toBe('SPAN');
    expect(fallback.getAttribute('lang')).toBe('en');

    // A curated French name is shown as-is, not wrapped.
    const scis = screen.getByRole('rowheader', { name: 'Certificat sécurisé de statut d’Indien (CSSI)' });
    expect(scis.querySelector('[lang="en"]')).toBeNull();
    // French number formatting: decimal comma and a (non-breaking) space before %.
    expect(within(scis.closest('tr')).getAllByRole('cell')[3].textContent).toMatch(/^7,8\s%$/);
  });
});
