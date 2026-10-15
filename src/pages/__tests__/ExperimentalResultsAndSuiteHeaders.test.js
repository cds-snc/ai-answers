/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ExperimentalBatchResultsPage from '../experimental/ExperimentalBatchResultsPage.js';
import ExperimentalSuitePage from '../experimental/ExperimentalSuitePage.js';

vi.mock('@cdssnc/gcds-components-react', () => ({
    GcdsContainer: ({ children }) => <div>{children}</div>,
    GcdsHeading: ({ children, tag: Tag = 'h2' }) => <Tag>{children}</Tag>,
    GcdsButton: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
    GcdsText: ({ children }) => <div>{children}</div>,
    GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
    GcdsDetails: ({ children }) => <div>{children}</div>
}));

vi.mock('@gcds-core/components-react', () => ({
    GcdsIcon: () => null,
    GcdsButton: ({ children, onClick }) => <button onClick={onClick}>{children}</button>
}));

vi.mock('../../hooks/useTranslations.js', () => ({
    useTranslations: () => ({ t: (key) => key })
}));

vi.mock('../../hooks/experimental/useExperimentalBatchItems.js', () => ({
    useExperimentalBatchItems: () => ({
        batch: { _id: 'batch-1', name: 'v2 tightened citations', description: 'Second pass', type: 'analysis', config: { datasetId: 'dataset-1' } },
        items: [],
        groups: [],
        counts: { total: 0, attention: 0, errors: 0 },
        pagination: { total: 0, page: 1, pages: 1 },
        filter: 'all',
        setFilter: () => {},
        setPage: () => {},
        loading: false,
        error: null,
        selectedIndex: null,
        selectItem: () => {},
        backToList: () => {},
        goNext: () => {},
        goPrev: () => {},
        hasNext: false,
        hasPrev: false,
        detailFocusRef: { current: null }
    })
}));

vi.mock('../../hooks/experimental/useExperimentalSuiteGrid.js', () => ({
    useExperimentalSuiteGrid: () => ({
        dataset: { _id: 'dataset-1', name: 'Seed suite', description: 'Five questions', category: 'cra' },
        tests: [],
        runs: [],
        cells: {},
        loading: false,
        error: null
    })
}));

const renderAt = (path, routePath, element) => render(
    <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={routePath} element={element} /></Routes>
    </MemoryRouter>
);

// Each page is about one record, so its h1 is stacked: the page type as a
// small label above the record's name. The navigation landmark holds the back
// links; the description follows without a box.
describe('experimental results and suite page headers', () => {
    afterEach(cleanup);

    it('batch results', () => {
        renderAt('/en/experimental/analysis/batch-1', '/en/experimental/analysis/:batchId', <ExperimentalBatchResultsPage lang="en" />);

        const h1 = screen.getByRole('heading', { level: 1 });
        expect([...h1.children].map(span => span.textContent)).toEqual(['experimental.results.title', 'v2 tightened citations']);
        const navLinks = within(screen.getByRole('navigation')).getAllByRole('link');
        expect(navLinks.map(a => a.textContent)).toEqual(['experimental.results.backToRuns', 'experimental.results.backToSuiteGrid']);
        expect(navLinks[1].getAttribute('href')).toBe('/en/experimental/suites/dataset-1');
        const description = screen.getByText('Second pass');
        expect(description.tagName).toBe('DD');
        expect(description.previousElementSibling.textContent).toBe('experimental.suite.descriptionLabel');
    });

    it('test suite', () => {
        renderAt('/en/experimental/suites/dataset-1', '/en/experimental/suites/:datasetId', <ExperimentalSuitePage lang="en" />);

        const h1 = screen.getByRole('heading', { level: 1 });
        expect([...h1.children].map(span => span.textContent)).toEqual(['experimental.suite.title', 'Seed suite']);
        expect(within(screen.getByRole('navigation')).getAllByRole('link').map(a => a.textContent)).toEqual(['experimental.datasets.backToList']);
        const description = screen.getByText('Five questions');
        expect(description.tagName).toBe('DD');
        expect(description.previousElementSibling.textContent).toBe('experimental.suite.descriptionLabel');
        const category = screen.getByText('cra');
        expect(category.tagName).toBe('DD');
        expect(category.previousElementSibling.textContent).toBe('experimental.suite.categoryLabel');
        expect(screen.getByRole('link', { name: 'experimental.suite.newRun' })).toBeTruthy();
    });
});
