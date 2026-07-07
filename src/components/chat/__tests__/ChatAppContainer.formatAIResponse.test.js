// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import ChatAppContainer from '../ChatAppContainer';
import { usePageContext } from '../../../hooks/usePageParam';

// Mock hooks before importing components that use them
vi.mock('../../../hooks/usePageParam', () => ({
    usePageContext: vi.fn(() => ({ url: '', department: '' })),
    DEPARTMENT_MAPPINGS: {}
}));

vi.mock('../../../hooks/useTranslations', () => ({
    useTranslations: vi.fn(() => ({ t: (k) => k })),
}));

// Mock services
vi.mock('../../../services/DataStoreService', () => ({ default: { getPublicSetting: vi.fn(() => Promise.resolve('azure')) } }));
vi.mock('../../../services/SessionService', () => ({ default: { getChatId: vi.fn(() => Promise.resolve('abc')) } }));
vi.mock('../../../services/AuthService', () => ({ default: { isAuthenticated: vi.fn(() => Promise.resolve(false)) } }));
vi.mock('../../../services/ChatWorkflowService', () => ({ ChatWorkflowService: { processResponse: vi.fn() }, RedactionError: class { }, ShortQueryValidation: class { } }));

// Capture formatAIResponse and invoke it directly with a crafted message, in place of
// rendering the full ChatInterface (which is exercised elsewhere).
let capturedFormatAIResponse;
vi.mock('../ChatInterface', () => ({
    default: ({ formatAIResponse }) => {
        capturedFormatAIResponse = formatAIResponse;
        return <div data-testid="chat-interface" />;
    }
}));

describe('ChatAppContainer - formatAIResponse blank-sentence filtering', () => {
    afterEach(() => {
        cleanup();
        capturedFormatAIResponse = undefined;
    });

    it('does not render an empty <p> for a blank <s-N></s-N> tag or an empty paragraph', async () => {
        vi.mocked(usePageContext).mockReturnValue({ url: '', department: '' });
        render(<ChatAppContainer lang="en" />);

        expect(capturedFormatAIResponse).toBeInstanceOf(Function);

        const message = {
            id: 'm1',
            interaction: {
                answer: {
                    // Second sentence tag is empty (translation collapsed it); second paragraph is
                    // entirely a <translated-question> tag, which strips to an empty string.
                    paragraphs: [
                        '<s-1>Real sentence.</s-1><s-2></s-2>',
                        '<translated-question>hidden</translated-question>',
                    ],
                    questionLanguage: 'eng',
                },
            },
        };

        const { container } = render(<div>{capturedFormatAIResponse('openai', message)}</div>);

        const paragraphs = container.querySelectorAll('p.ai-sentence');
        expect(paragraphs).toHaveLength(1);
        expect(paragraphs[0].textContent).toBe('Real sentence.');
    });
});
