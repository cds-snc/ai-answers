/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import EvalCoverageCard, { pickActions } from '../dashboard/EvalCoverageCard.js';
import { MOCK_METRICS } from '../../../utils/dashboard/mockMetrics.js';

// Real translations (no useTranslations mock) so the FR copy is exercised too.
const coverage = MOCK_METRICS.evalCoverage;

describe('EvalCoverageCard', () => {
  afterEach(cleanup);

  it('renders nothing when no service is in scope', () => {
    const { container } = render(<EvalCoverageCard coverage={{ programs: [] }} lang="en" />);
    expect(container.innerHTML).toBe('');
  });

  it('is collapsed by default, with the heading and subtitle outside the collapse', () => {
    render(<EvalCoverageCard coverage={coverage} lang="en" />);
    const details = document.querySelector('details');
    expect(details.open).toBe(false);
    expect(details.querySelector('summary').textContent).toBe('Top services by evaluation coverage');
    expect(details.contains(screen.getByRole('heading', { name: 'Evaluation coverage by service' }))).toBe(false);
    expect(details.contains(screen.getByRole('table', { hidden: true }))).toBe(true);
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
    expect(colHeaders.map((th) => th.textContent)).toEqual([
      'Service', 'Actions asked about', 'Questions', 'Expert evaluations', 'Answers using evaluations', 'Expiring soon',
    ]);
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
    // actions, questions, evals (usable, all dates), informed, expiring
    expect(cells).toEqual(['Apply, Check status, Get help with', '230', '15', '96', '3']);

    const groceries = screen.getByRole('rowheader', { name: 'Canada Groceries and Essentials Benefit' }).closest('tr');
    const groceryCells = within(groceries).getAllByRole('cell');
    expect(groceryCells[0].textContent).toContain('No actions recorded');
    // The unclassified row has no evaluation / expiring counts.
    const unknownCells = within(screen.getByRole('rowheader', { name: 'Not yet classified' }).closest('tr')).getAllByRole('cell');
    expect(unknownCells[2].textContent).toContain('Not applicable');
    expect(unknownCells[4].textContent).toContain('Not applicable');
    // The em dash is visual only.
    expect(within(unknownCells[4]).getByText('—').getAttribute('aria-hidden')).toBe('true');
  });

  it('lists at most 3 repeated actions, then "and N more"', () => {
    const many = [
      { action: 'Get info', actionFr: "Obtenir de l'information", count: 90 },
      { action: 'Check status', actionFr: "Vérifier l'état", count: 40 },
      { action: 'Apply', actionFr: 'Présenter une demande', count: 20 },
      { action: 'Send', actionFr: 'Envoyer', count: 5 },
      { action: 'Contact', actionFr: 'Communiquer', count: 1 },
      { action: 'Use MFA', actionFr: "Utiliser l'authentification multifacteur", count: 1 },
    ];
    const row = { ...coverage.programs[0], actions: many };
    render(<EvalCoverageCard coverage={{ ...coverage, programs: [row] }} lang="en" />);
    const cell = within(screen.getByRole('rowheader').closest('tr')).getAllByRole('cell')[0];
    expect(cell.textContent).toBe('Get info, Check status, Apply and 3 more');
    cleanup();
    render(<EvalCoverageCard coverage={{ ...coverage, programs: [row] }} lang="fr" />);
    expect(within(screen.getByRole('rowheader').closest('tr')).getAllByRole('cell')[0].textContent)
      .toBe("Obtenir de l'information, Vérifier l'état, Présenter une demande et 3 autres");
  });

  it('skips actions asked only once, unless that is all there is', () => {
    expect(pickActions([{ action: 'Apply', count: 4 }, { action: 'Send', count: 1 }]))
      .toEqual({ shown: [{ action: 'Apply', count: 4 }], hiddenCount: 1 });
    expect(pickActions([{ action: 'Apply', count: 1 }, { action: 'Send', count: 1 }]))
      .toEqual({ shown: [{ action: 'Apply', count: 1 }], hiddenCount: 1 });
    expect(pickActions([])).toEqual({ shown: [], hiddenCount: 0 });
  });

  it('explains the columns and the recency limit in visible text', () => {
    render(<EvalCoverageCard coverage={coverage} lang="en" />);
    const dl = document.querySelector('dl.dashboard-table-notes');
    // Each term is the column header it defines.
    expect([...dl.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Expert evaluations', 'Answers using evaluations', 'Expiring soon',
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
  });
});
