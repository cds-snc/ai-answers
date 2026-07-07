/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ExperimentalDatasetsPage from '../experimental/ExperimentalDatasetsPage.js';

const { mockListDatasets } = vi.hoisted(() => ({ mockListDatasets: vi.fn() }));

vi.mock('../../hooks/useTranslations.js', () => ({
    useTranslations: () => ({
        t: (key, defaultValue) => defaultValue || key
    })
}));

vi.mock('../../services/experimental/ExperimentalBatchClientService.js', () => ({
    ExperimentalBatchClientService: {
        listDatasets: mockListDatasets
    }
}));

vi.mock('@cdssnc/gcds-components-react', () => ({
    GcdsContainer: ({ children, layout, tag: Tag = 'div' }) => (
        <Tag data-layout={layout || ''}>{children}</Tag>
    ),
    GcdsHeading: ({ children, tag: Tag = 'h2' }) => <Tag>{children}</Tag>,
    GcdsButton: ({ children, onClick, disabled }) => (
        <button onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
    GcdsText: ({ children }) => <div>{children}</div>,
    GcdsInput: ({ label, id, value, onGcdsInput }) => (
        <label htmlFor={id}>
            {label}
            <input id={id} value={value} onChange={onGcdsInput} />
        </label>
    ),
    GcdsLink: ({ children, href }) => <a href={href}>{children}</a>
}));

vi.mock('@gcds-core/components-react', () => ({
    GcdsFileUploader: ({ label, uploaderId, onGcdsChange }) => (
        <label htmlFor={uploaderId}>
            {label}
            <input type="file" id={uploaderId} onChange={onGcdsChange} />
        </label>
    )
}));

describe('ExperimentalDatasetsPage', () => {
    beforeEach(() => {
        mockListDatasets.mockReset().mockResolvedValue({ data: [] });
    });

    afterEach(() => {
        cleanup();
    });

    it('uses the page container layout and renders the admin back link', async () => {
        render(<ExperimentalDatasetsPage lang="en" />);

        expect(screen.getByText('experimental.datasets.title').closest('[data-layout="page"]')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'common.backToAdmin' }).getAttribute('href')).toBe('/en/admin');
        expect(await screen.findByText('experimental.datasets.empty')).toBeTruthy();
    });
});
