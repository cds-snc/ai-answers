/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import MostUsedEvalsCard from '../dashboard/MostUsedEvalsCard.js';
import { MOCK_METRICS } from '../../../utils/dashboard/mockMetrics.js';

// Same plain stand-in other admin tests use for GcdsLink (a web component in
// jsdom), keeping href/target/lang inspectable.
vi.mock('@gcds-core/components-react', () => ({
  GcdsLink: ({ children, href, target, lang }) => <a href={href} target={target} lang={lang}>{children}</a>,
}));

// Real translations (no useTranslations mock) so the FR copy is exercised too.
const evals = MOCK_METRICS.mostUsedEvals;

describe('MostUsedEvalsCard', () => {
  afterEach(cleanup);

  it('renders nothing when no evaluation was used', () => {
    const { container } = render(<MostUsedEvalsCard evals={[]} lang="en" />);
    expect(container.innerHTML).toBe('');
  });

  it('is a captioned table inside a focusable, named scroll region', () => {
    render(<MostUsedEvalsCard evals={evals} lang="en" />);
    const table = screen.getByRole('table', { name: 'Most-used evaluations' });
    const region = screen.getByRole('region', { name: 'Most-used evaluations' });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.contains(table)).toBe(true);
    within(table).getAllByRole('columnheader').forEach((th) => expect(th.getAttribute('scope')).toBe('col'));
  });

  it('names each row by its chat ID link, unique per question, opening review mode in a new tab', () => {
    render(<MostUsedEvalsCard evals={evals} lang="en" />);
    const rowHeaders = screen.getAllByRole('rowheader');
    expect(rowHeaders).toHaveLength(4);
    // Same chat twice: the sr-only question number keeps the link text unique.
    expect(rowHeaders[0].textContent).toBe('5b2e8c1d-7a4f-4e3b-9c6d-1f8a2b3c4d5e, question 1');
    expect(rowHeaders[1].textContent).toBe('5b2e8c1d-7a4f-4e3b-9c6d-1f8a2b3c4d5e, question 2');

    const link = rowHeaders[2].querySelector('a');
    expect(link.getAttribute('target')).toBe('_blank');
    // The evaluated chat's own language (fr), with the interaction id.
    expect(link.getAttribute('href')).toMatch(/^\/fr\?chat=c7d9e1f3/);
    expect(link.getAttribute('href')).toContain('7b2c3d4e5f6a7b8c9d0e1f2a');
  });

  it('shows service, score, uses and the evaluation date', () => {
    render(<MostUsedEvalsCard evals={evals} lang="en" />);
    const cells = within(screen.getAllByRole('rowheader')[0].closest('tr')).getAllByRole('cell').map((td) => td.textContent);
    expect(cells).toEqual(['1', 'Secure Certificate of Indian Status (SCIS)', '100', '42', 'Jul 14, 2026']);
    const unclassified = within(screen.getAllByRole('rowheader')[3].closest('tr')).getAllByRole('cell');
    expect(unclassified[1].textContent).toBe('Not yet classified');
  });

  it('on the French dashboard, tags an English fallback service name with lang="en"', () => {
    render(<MostUsedEvalsCard evals={evals} lang="fr" />);
    expect(screen.getByRole('table', { name: 'Évaluations les plus utilisées' })).toBeTruthy();
    const fallback = screen.getByText('Canada Groceries and Essentials Benefit');
    expect(fallback.tagName).toBe('SPAN');
    expect(fallback.getAttribute('lang')).toBe('en');
    // French decimal comma on a non-integer score.
    expect(within(fallback.closest('tr')).getAllByRole('cell')[2].textContent).toBe('92,5');
  });
});
