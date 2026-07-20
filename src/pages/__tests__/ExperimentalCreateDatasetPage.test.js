/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExperimentalCreateDatasetPage from '../experimental/ExperimentalCreateDatasetPage.js';

const mocks = vi.hoisted(() => ({
    createGolden: vi.fn(),
    createInstant: vi.fn(),
    previewGolden: vi.fn(),
    previewInstant: vi.fn()
}));

vi.mock('../../hooks/useTranslations.js', () => ({
    useTranslations: () => ({ t: key => key })
}));

vi.mock('../../services/experimental/ExperimentalBatchClientService.js', () => ({
    ExperimentalBatchClientService: {
        createGoldenAnswerDataset: mocks.createGolden,
        createInstantAnswerDataset: mocks.createInstant,
        previewGoldenAnswerDataset: mocks.previewGolden,
        previewInstantAnswerDataset: mocks.previewInstant
    }
}));

vi.mock('@cdssnc/gcds-components-react', () => ({
    GcdsContainer: ({ children, layout }) => <div data-layout={layout}>{children}</div>,
    GcdsHeading: ({ children, tag: Tag = 'h2' }) => <Tag>{children}</Tag>,
    GcdsButton: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
    GcdsText: ({ children }) => <div>{children}</div>,
    GcdsInput: ({ label, hint, id, type = 'text', value, onGcdsInput, min, max }) => (
        <label htmlFor={id}>
            {label}
            <span>{hint}</span>
            <input id={id} type={type} value={value} min={min} max={max} onChange={onGcdsInput} />
        </label>
    ),
    GcdsLink: ({ children, href }) => <a href={href}>{children}</a>
}));

describe('ExperimentalCreateDatasetPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.previewGolden.mockResolvedValue({ rowCount: 1 });
        mocks.previewInstant.mockResolvedValue({ sourceRowCount: 1, rowCount: 2 });
        mocks.createInstant.mockResolvedValue({});
    });

    afterEach(cleanup);

    it('creates an instant-answer dataset with the selected total occurrences', async () => {
        render(<ExperimentalCreateDatasetPage lang="en" />);

        fireEvent.change(screen.getByLabelText('experimental.datasets.nameLabel'), { target: { value: 'SCIS variants' } });
        fireEvent.change(screen.getByLabelText('experimental.datasets.creationMethodLabel'), { target: { value: 'instant-answer' } });
        fireEvent.change(screen.getByLabelText('experimental.datasets.startDate'), { target: { value: '2026-06-01' } });
        fireEvent.change(screen.getByLabelText('experimental.datasets.endDate'), { target: { value: '2026-06-30' } });
        fireEvent.change(screen.getByLabelText(/experimental\.datasets\.occurrencesPerQuestion/), { target: { value: '3' } });

        await waitFor(() => {
            expect(mocks.previewInstant).toHaveBeenCalledWith('2026-06-01', '2026-06-30', '3');
        });
        fireEvent.click(screen.getByRole('button', { name: 'experimental.datasets.createButton' }));

        await waitFor(() => {
            expect(mocks.createInstant).toHaveBeenCalledWith(expect.objectContaining({
                name: 'SCIS variants',
                method: 'instant-answer',
                type: 'qa-pair',
                occurrencesPerQuestion: 3
            }));
        });
        expect(mocks.createGolden).not.toHaveBeenCalled();
    });
});
