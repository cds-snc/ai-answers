// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SuiteGridTable from '../SuiteGridTable.js';

const tests = [
    { position: 1, testName: 'Passing test', question: 'Question one' },
    { position: 2, testName: 'Missing test', question: 'Question two' },
    { position: 3, testName: 'Trials test', question: 'Question three' }
];
const runs = [{ _id: 'run-1', name: 'Run one', createdAt: '2026-09-01T00:00:00Z' }];
const cells = {
    'run-1': {
        1: { verdict: 'pass', passCount: 1, total: 1, trials: ['pass'] },
        3: { verdict: 'mixed', passCount: 2, total: 3, trials: ['pass', 'flagged', 'pass'] }
    }
};
const cellHref = (run, test) => `/en/analysis/${run._id}?open=${test.position}`;

const renderGrid = () => render(
    <SuiteGridTable tests={tests} runs={runs} cells={cells} cellHref={cellHref} />,
    { wrapper: MemoryRouter }
);

describe('SuiteGridTable', () => {
    it('renders a verdict cell as a real link named by verdict, run and test', () => {
        renderGrid();

        const link = screen.getByRole('link', { name: /, Run one, Passing test$/ });
        expect(link.getAttribute('href')).toBe('/en/analysis/run-1?open=1');
        expect(link.closest('td').getAttribute('role')).toBeNull();
    });

    it('starts a multi-trial link name with its visible k/n and hides the symbol strip', () => {
        renderGrid();

        const link = screen.getByRole('link', { name: /^2\/3 .*, Run one, Trials test$/ });
        expect(link.querySelector('[aria-hidden="true"]').textContent).toBe('✓✗✓');
    });

    it('leaves a missing cell with no link and renders no buttons', () => {
        renderGrid();

        expect(screen.getAllByRole('link')).toHaveLength(2);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('names a missing cell for screen readers and hides its symbol', () => {
        renderGrid();

        const name = screen.getByText(/, Run one, Missing test$/);
        expect(name.className).toBe('sr-only');
        expect(name.previousElementSibling.getAttribute('aria-hidden')).toBe('true');
    });
});
