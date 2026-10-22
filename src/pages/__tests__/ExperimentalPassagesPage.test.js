/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExperimentalPassagesPage from '../experimental/ExperimentalPassagesPage.js';

const mocks = vi.hoisted(() => ({
    runQuery: vi.fn(),
    runRaw: vi.fn(),
}));

vi.mock('../../hooks/useTranslations.js', () => ({
    useTranslations: () => ({ t: (key) => key }),
}));

vi.mock('../../services/experimental/PassagesTestClientService.js', () => ({
    PassagesTestClientService: { runQuery: mocks.runQuery, runRaw: mocks.runRaw },
}));

vi.mock('@cdssnc/gcds-components-react', () => ({
    GcdsContainer: ({ children }) => <div>{children}</div>,
    GcdsHeading: ({ children, tag: Tag = 'h2' }) => <Tag>{children}</Tag>,
    GcdsButton: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
    GcdsText: ({ children }) => <div>{children}</div>,
    GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
}));

const CRA_URL = 'https://www.canada.ca/en/revenue-agency/services/x.html';

const okResult = {
    ok: true,
    status: 200,
    latencyMs: 321,
    requestBody: { query: 'appeal', context: { customContext: 'globalSemantic' } },
    response: { items: [] },
    passages: [{ text: 'You can object within 90 days.', score: 0.8, url: CRA_URL, title: 'Objections', dateModified: null }],
};

describe('ExperimentalPassagesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.runQuery.mockResolvedValue(okResult);
        mocks.runRaw.mockResolvedValue(okResult);
    });

    afterEach(cleanup);

    it('sends a single query and shows its passages', async () => {
        render(<ExperimentalPassagesPage lang="en" />);

        fireEvent.change(screen.getByLabelText('experimental.passages.queryLabel'), { target: { value: 'appeal' } });
        fireEvent.change(screen.getByLabelText('experimental.passages.urlLabel'), { target: { value: CRA_URL } });
        // The probe section has its own maximum-passages field; the first is the single query's.
        fireEvent.change(screen.getAllByLabelText('experimental.passages.maxLabel')[0], { target: { value: '5' } });
        fireEvent.click(screen.getByRole('button', { name: 'experimental.passages.send' }));

        await waitFor(() => {
            expect(screen.getByText('You can object within 90 days.')).toBeTruthy();
        });
        expect(mocks.runQuery).toHaveBeenCalledWith({ query: 'appeal', url: CRA_URL, lang: 'en', maxPassages: 5 });
        expect(screen.getByText('You can object within 90 days.').getAttribute('lang')).toBe('en');
    });

    it('sends an edited request body, and rejects invalid JSON', async () => {
        render(<ExperimentalPassagesPage lang="en" />);

        fireEvent.change(screen.getByLabelText('experimental.passages.queryLabel'), { target: { value: 'appeal' } });
        fireEvent.click(screen.getByRole('button', { name: 'experimental.passages.send' }));
        fireEvent.click(await screen.findByRole('button', { name: 'experimental.passages.editRequest' }));

        const editor = screen.getByLabelText('experimental.passages.rawLabel');
        expect(JSON.parse(editor.value)).toEqual(okResult.requestBody);

        fireEvent.change(editor, { target: { value: '{ not json' } });
        fireEvent.click(screen.getByRole('button', { name: 'experimental.passages.sendRaw' }));
        expect(await screen.findByText('experimental.passages.rawInvalid')).toBeTruthy();
        expect(mocks.runRaw).not.toHaveBeenCalled();

        fireEvent.change(editor, { target: { value: '{"query":"appeal","locale":"fr"}' } });
        fireEvent.click(screen.getByRole('button', { name: 'experimental.passages.sendRaw' }));
        await waitFor(() => {
            expect(mocks.runRaw).toHaveBeenCalledWith({ query: 'appeal', locale: 'fr' });
        });
    });

    it('runs a probe file in page and open mode', async () => {
        render(<ExperimentalPassagesPage lang="en" />);

        const csv = `question,citationUrl,answer\n01. How do I appeal?,${CRA_URL},Golden answer\n`;
        const file = { name: 'probe.csv', text: async () => csv };
        fireEvent.change(screen.getByLabelText('experimental.passages.fileLabel'), { target: { files: [file] } });

        const start = screen.getByRole('button', { name: 'experimental.passages.probeStart' });
        await waitFor(() => expect(start.disabled).toBe(false));
        fireEvent.click(start);

        await screen.findByText('experimental.passages.probeDone', {}, { timeout: 3000 });
        expect(mocks.runQuery).toHaveBeenNthCalledWith(1, { query: 'How do I appeal?', url: CRA_URL, lang: 'en', maxPassages: 10 });
        expect(mocks.runQuery).toHaveBeenNthCalledWith(2, { query: 'How do I appeal?', url: undefined, lang: 'en', maxPassages: 10 });
        expect(screen.getByRole('button', { name: 'experimental.passages.downloadCsv' })).toBeTruthy();

        // The table keeps the run's language even after the selector changes.
        fireEvent.change(screen.getAllByLabelText('experimental.passages.langLabel')[1], { target: { value: 'fr' } });
        const cells = screen.getAllByText('How do I appeal?');
        expect(cells.every((cell) => cell.getAttribute('lang') === 'en')).toBe(true);
    });

    it('shows the endpoint error code when a probe call is rejected', async () => {
        mocks.runQuery.mockRejectedValue(Object.assign(new Error('400'), { status: 400, code: 'INVALID_QUERY' }));
        render(<ExperimentalPassagesPage lang="en" />);

        const file = { name: 'probe.csv', text: async () => 'question\nToo long\n' };
        fireEvent.change(screen.getByLabelText('experimental.passages.fileLabel'), { target: { files: [file] } });
        const start = screen.getByRole('button', { name: 'experimental.passages.probeStart' });
        await waitFor(() => expect(start.disabled).toBe(false));
        fireEvent.click(start);

        expect(await screen.findByText('INVALID_QUERY', {}, { timeout: 3000 })).toBeTruthy();
    });

    it('shows the Coveo status and message when a probe call gets an HTTP error', async () => {
        mocks.runQuery.mockResolvedValue({
            ok: false, reason: 'http_error', status: 503, detail: 'Service unavailable', passages: [],
        });
        render(<ExperimentalPassagesPage lang="en" />);

        const file = { name: 'probe.csv', text: async () => 'question\nHow do I appeal?\n' };
        fireEvent.change(screen.getByLabelText('experimental.passages.fileLabel'), { target: { files: [file] } });
        const start = screen.getByRole('button', { name: 'experimental.passages.probeStart' });
        await waitFor(() => expect(start.disabled).toBe(false));
        fireEvent.click(start);

        expect(await screen.findByText('503 Service unavailable', {}, { timeout: 3000 })).toBeTruthy();
    });
});
