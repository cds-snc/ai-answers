// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ChatAppContainer from '../ChatAppContainer';
import { usePageContext } from '../../../hooks/usePageParam';
import DataStoreService from '../../../services/DataStoreService';
import { ChatWorkflowService } from '../../../services/ChatWorkflowService';

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
vi.mock('../../../services/AuthService', () => ({ default: { isAuthenticated: vi.fn(() => Promise.resolve(false)), getUserId: vi.fn(() => null) } }));
vi.mock('../../../services/ChatWorkflowService', () => ({
    ChatWorkflowService: { processResponse: vi.fn(() => new Promise(() => {})) },
    RedactionError: class { },
    ShortQueryValidation: class { },
    ChatRunInProgressError: class { }
}));

// Surface what the Options dropdowns are told to display, and expose the
// change handlers so tests drive the real selection logic. '' is the
// "use system settings" entry.
vi.mock('../ChatInterface', () => ({
    default: ({ workflowSelection, modelSelection, handleWorkflowChange, handleAIToggle, handleSendMessage, handleInputChange }) => (
        <>
            <div data-testid="workflow-selection">{workflowSelection ?? ''}</div>
            <div data-testid="model-selection">{modelSelection ?? ''}</div>
            <button
                data-testid="pick-workflow"
                onClick={() => handleWorkflowChange({ target: { value: 'InstantAndQAGraph' } })}
            >pick workflow</button>
            <button
                data-testid="clear-workflow"
                onClick={() => handleWorkflowChange({ target: { value: '' } })}
            >workflow: use system settings</button>
            <button
                data-testid="pick-model"
                onClick={() => handleAIToggle({ target: { value: 'openai-gpt51' } })}
            >pick model</button>
            <button
                data-testid="clear-model"
                onClick={() => handleAIToggle({ target: { value: '' } })}
            >model: use system settings</button>
            {/* handleSendMessage closes over inputText, so typing has to be a
                separate event from sending. */}
            <button
                data-testid="type"
                onClick={() => handleInputChange({ target: { value: 'where is the rcmp headquarters' } })}
            >type</button>
            <button data-testid="send" onClick={() => handleSendMessage()}>send</button>
        </>
    )
}));

const mockPublicSettings = (values) => {
    vi.mocked(DataStoreService.getPublicSetting).mockImplementation(
        (key, fallback = null) => Promise.resolve(key in values ? values[key] : fallback)
    );
};

// Positional args of ChatWorkflowService.processResponse: workflow is 10th
// (index 9), between translationF and onStatusUpdate.
const WORKFLOW_ARG_INDEX = 9;
const sentWorkflow = () =>
    vi.mocked(ChatWorkflowService.processResponse).mock.calls[0][WORKFLOW_ARG_INDEX];

const STORED_WORKFLOW = 'aiAnswers.workflow';
const STORED_MODEL = 'aiAnswers.selectedAI';

describe('ChatAppContainer - workflow selection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        vi.mocked(usePageContext).mockReturnValue({ url: '', department: '' });
        mockPublicSettings({ 'model.default': 'azure', 'workflow.default': 'GenericWithQAGraph' });
    });

    afterEach(() => {
        cleanup();
        localStorage.clear();
    });

    it('shows "use system settings" rather than naming a workflow when following the setting', async () => {
        render(<ChatAppContainer lang="en" />);

        // '' is the "use system settings" entry — the dropdown must not imply
        // the admin deliberately chose GenericWithQAGraph.
        await waitFor(() =>
            expect(DataStoreService.getPublicSetting).toHaveBeenCalledWith('workflow.default', null)
        );
        expect(screen.getByTestId('workflow-selection').textContent).toBe('');
        expect(localStorage.getItem(STORED_WORKFLOW)).toBeNull();
    });

    it('still sends the configured workflow.default while following the setting', async () => {
        render(<ChatAppContainer lang="en" />);
        await waitFor(() =>
            expect(DataStoreService.getPublicSetting).toHaveBeenCalledWith('workflow.default', null)
        );

        fireEvent.click(screen.getByTestId('type'));
        fireEvent.click(screen.getByTestId('send'));

        await waitFor(() => expect(ChatWorkflowService.processResponse).toHaveBeenCalled());
        expect(sentWorkflow()).toBe('GenericWithQAGraph');
    });

    it('falls back to DEFAULT_WORKFLOW when workflow.default is unset', async () => {
        mockPublicSettings({ 'model.default': 'azure' });

        render(<ChatAppContainer lang="en" />);
        await waitFor(() =>
            expect(DataStoreService.getPublicSetting).toHaveBeenCalledWith('workflow.default', null)
        );

        fireEvent.click(screen.getByTestId('type'));
        fireEvent.click(screen.getByTestId('send'));
        await waitFor(() => expect(ChatWorkflowService.processResponse).toHaveBeenCalled());
        expect(sentWorkflow()).toBe('GenericGraph');
    });

    it('persists an explicit pick and shows it as the selection', async () => {
        render(<ChatAppContainer lang="en" />);

        fireEvent.click(screen.getByTestId('pick-workflow'));

        await waitFor(() =>
            expect(screen.getByTestId('workflow-selection').textContent).toBe('InstantAndQAGraph')
        );
        expect(localStorage.getItem(STORED_WORKFLOW)).toBe('InstantAndQAGraph');
    });

    it('keeps a valid stored override instead of the setting', async () => {
        localStorage.setItem(STORED_WORKFLOW, 'InstantAndQAGraph');

        render(<ChatAppContainer lang="en" />);

        await waitFor(() =>
            expect(screen.getByTestId('workflow-selection').textContent).toBe('InstantAndQAGraph')
        );
        expect(DataStoreService.getPublicSetting).not.toHaveBeenCalledWith('workflow.default', expect.anything());
    });

    it('ignores a stale stored workflow that is no longer a valid option', async () => {
        localStorage.setItem(STORED_WORKFLOW, 'Default');

        render(<ChatAppContainer lang="en" />);

        await waitFor(() =>
            expect(DataStoreService.getPublicSetting).toHaveBeenCalledWith('workflow.default', null)
        );
        expect(screen.getByTestId('workflow-selection').textContent).toBe('');
    });

    it('"use system settings" clears the stored override and follows the setting again', async () => {
        localStorage.setItem(STORED_WORKFLOW, 'InstantAndQAGraph');

        render(<ChatAppContainer lang="en" />);
        await waitFor(() =>
            expect(screen.getByTestId('workflow-selection').textContent).toBe('InstantAndQAGraph')
        );

        fireEvent.click(screen.getByTestId('clear-workflow'));

        await waitFor(() => expect(localStorage.getItem(STORED_WORKFLOW)).toBeNull());
        expect(screen.getByTestId('workflow-selection').textContent).toBe('');

        // And the setting is what actually runs from then on.
        fireEvent.click(screen.getByTestId('type'));
        fireEvent.click(screen.getByTestId('send'));
        await waitFor(() => expect(ChatWorkflowService.processResponse).toHaveBeenCalled());
        expect(sentWorkflow()).toBe('GenericWithQAGraph');
    });
});

describe('ChatAppContainer - model selection', () => {
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

    it('shows "use system settings" while following model.default', async () => {
        render(<ChatAppContainer lang="en" />);

        await waitFor(() =>
            expect(DataStoreService.getPublicSetting).toHaveBeenCalledWith('model.default', null)
        );
        expect(screen.getByTestId('model-selection').textContent).toBe('');
        expect(localStorage.getItem(STORED_MODEL)).toBeNull();
    });

    it('persists an explicit pick and keeps it over the setting', async () => {
        render(<ChatAppContainer lang="en" />);

        fireEvent.click(screen.getByTestId('pick-model'));

        await waitFor(() =>
            expect(screen.getByTestId('model-selection').textContent).toBe('openai-gpt51')
        );
        expect(localStorage.getItem(STORED_MODEL)).toBe('openai-gpt51');
    });

    it('ignores a stale stored model that is no longer available', async () => {
        localStorage.setItem(STORED_MODEL, 'anthropic');

        render(<ChatAppContainer lang="en" />);

        await waitFor(() =>
            expect(DataStoreService.getPublicSetting).toHaveBeenCalledWith('model.default', null)
        );
        expect(screen.getByTestId('model-selection').textContent).toBe('');
    });

    it('"use system settings" clears the stored model override', async () => {
        localStorage.setItem(STORED_MODEL, 'openai-gpt51');

        render(<ChatAppContainer lang="en" />);
        await waitFor(() =>
            expect(screen.getByTestId('model-selection').textContent).toBe('openai-gpt51')
        );

        fireEvent.click(screen.getByTestId('clear-model'));

        await waitFor(() => expect(localStorage.getItem(STORED_MODEL)).toBeNull());
        expect(screen.getByTestId('model-selection').textContent).toBe('');
    });
});
