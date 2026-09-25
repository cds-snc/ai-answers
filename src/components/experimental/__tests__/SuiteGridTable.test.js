// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SuiteGridTable from '../SuiteGridTable.js';

const tests = [
    { position: 1, testName: 'Passing test', question: 'Question one' },
    { position: 2, testName: 'Missing test', question: 'Question two' }
];
const runs = [{ _id: 'run-1', name: 'Run one', createdAt: '2026-09-01T00:00:00Z' }];
const cells = { 'run-1': { 1: { verdict: 'pass', passCount: 1, total: 1, trials: ['pass'] } } };
const cellHref = (run, test) => `/en/analysis/${run._id}?open=${test.position}`;

describe('SuiteGridTable', () => {
    it('renders a verdict cell as a real link named by run and test', () => {
        render(<SuiteGridTable tests={tests} runs={runs} cells={cells} cellHref={cellHref} />, { wrapper: MemoryRouter });

        const link = screen.getByRole('link', { name: /Run one — Passing test/ });
        expect(link.getAttribute('href')).toBe('/en/analysis/run-1?open=1');
        expect(link.closest('td').getAttribute('role')).toBeNull();
    });

    it('leaves a missing cell with no link and renders no buttons', () => {
        render(<SuiteGridTable tests={tests} runs={runs} cells={cells} cellHref={cellHref} />, { wrapper: MemoryRouter });

        expect(screen.getAllByRole('link')).toHaveLength(1);
        expect(screen.queryByRole('button')).toBeNull();
    });
});
