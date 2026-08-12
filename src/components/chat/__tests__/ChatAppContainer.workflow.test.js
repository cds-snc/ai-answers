// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import ChatAppContainer from '../ChatAppContainer';
import { usePageContext } from '../../../hooks/usePageParam';
import DataStoreService from '../../../services/DataStoreService';

vi.mock('../../../hooks/usePageParam', () => ({
    usePageContext: vi.fn(),
    DEPARTMENT_MAPPINGS: {}
}));

vi.mock('../../../hooks/useTranslations', () => ({
    useTranslations: vi.fn(() => ({
        t: (k) => {
            const mockT = (val) => val;
            mockT.text = (val) => val;
            return mockT(k);
        }
    }))
}));

vi.mock('../../../services/DataStoreService', () => ({ default: { getPublicSetting: vi.fn() } }));
vi.mock('../../../services/SessionService', () => ({ default: { getChatId: vi.fn(() => Promise.resolve('abc')) } }));
vi.mock('../../../services/AuthService', () => ({ default: { isAuthenticated: vi.fn(() => Promise.resolve(false)) } }));
vi.mock('../../../services/ChatWorkflowService', () => ({ ChatWorkflowService: { processResponse: vi.fn() }, RedactionError: class { }, ShortQueryValidation: class { }, ChatRunInProgressError: class { } }));

// Surface the values the container hands to the Options dropdowns.
vi.mock('../ChatInterface', () => ({
    default: ({ workflow, selectedAI }) => (
        <>
            <div data-testid="workflow-display">{workflow ?? ''}</div>
            <div data-testid="model-display">{selectedAI ?? ''}</div>
        </>
    )
}));

const mockPublicSettings = (values) => {
    vi.mocked(DataStoreService.getPublicSetting).mockImplementation(
        (key, fallback = null) => Promise.resolve(key in values ? values[key] : fallback)
    );
};

describe('ChatAppContainer - workflow selection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        vi.mocked(usePageContext).mockReturnValue({ url: '', department: '' });
        mockPublicSettings({ 'model.default': 'azure' });
    });

    afterEach(() => {
        cleanup();
        localStorage.clear();
    });

    it('shows the configured workflow.default when there is no local override', async () => {
        mockPublicSettings({ 'model.default': 'azure', 'workflow.default': 'GenericWithQAGraph' });

        render(<ChatAppContainer lang="en" />);

        await waitFor(() =>
            expect(screen.getByTestId('workflow-display').textContent).toBe('GenericWithQAGraph')
        );
        // The fetched default is not the user's own choice, so it must not be persisted.
        expect(localStorage.getItem('aiAnswers.workflow')).toBeNull();
    });

    it('falls back to DEFAULT_WORKFLOW when workflow.default is unset', async () => {
        mockPublicSettings({ 'model.default': 'azure' });

        render(<ChatAppContainer lang="en" />);

        await waitFor(() =>
            expect(screen.getByTestId('workflow-display').textContent).toBe('GenericGraph')
        );
    });

    it('ignores a stale localStorage workflow that is no longer a valid option', async () => {
        localStorage.setItem('aiAnswers.workflow', 'Default');
        mockPublicSettings({ 'model.default': 'azure', 'workflow.default': 'GenericWithQAGraph' });

        render(<ChatAppContainer lang="en" />);

        await waitFor(() =>
            expect(screen.getByTestId('workflow-display').textContent).toBe('GenericWithQAGraph')
        );
    });

    it('keeps a valid user override from localStorage', async () => {
        localStorage.setItem('aiAnswers.workflow', 'InstantAndQAGraph');
        mockPublicSettings({ 'model.default': 'azure', 'workflow.default': 'GenericWithQAGraph' });

        render(<ChatAppContainer lang="en" />);

        await waitFor(() =>
            expect(screen.getByTestId('workflow-display').textContent).toBe('InstantAndQAGraph')
        );
        expect(DataStoreService.getPublicSetting).not.toHaveBeenCalledWith('workflow.default', expect.anything());
    });
});

describe('ChatAppContainer - model selection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        vi.mocked(usePageContext).mockReturnValue({ url: '', department: '' });
    });

    afterEach(() => {
        cleanup();
        localStorage.clear();
    });

    it('shows the configured model.default when there is no local override', async () => {
        mockPublicSettings({ 'model.default': 'azure' });

        render(<ChatAppContainer lang="en" />);

        await waitFor(() => expect(screen.getByTestId('model-display').textContent).toBe('azure'));
        // The fetched default is not the admin's own choice, so it must not be persisted.
        expect(localStorage.getItem('aiAnswers.selectedAI')).toBeNull();
    });

    it('keeps a valid user override from localStorage instead of the setting', async () => {
        localStorage.setItem('aiAnswers.selectedAI', 'openai-gpt51');
        mockPublicSettings({ 'model.default': 'azure' });

        render(<ChatAppContainer lang="en" />);

        await waitFor(() =>
            expect(screen.getByTestId('model-display').textContent).toBe('openai-gpt51')
        );
        expect(DataStoreService.getPublicSetting).not.toHaveBeenCalledWith('model.default', expect.anything());
    });

    it('ignores a stale localStorage model that is no longer available', async () => {
        localStorage.setItem('aiAnswers.selectedAI', 'anthropic');
        mockPublicSettings({ 'model.default': 'azure' });

        render(<ChatAppContainer lang="en" />);

        await waitFor(() => expect(screen.getByTestId('model-display').textContent).toBe('azure'));
    });

    it('falls back to the first available model when model.default is invalid', async () => {
        mockPublicSettings({ 'model.default': 'anthropic' });

        render(<ChatAppContainer lang="en" />);

        await waitFor(() =>
            expect(screen.getByTestId('model-display').textContent).toBe('openai-gpt51')
        );
    });
});
