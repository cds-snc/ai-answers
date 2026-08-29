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
vi.mock('../../../services/ChatWorkflowService', () => ({ ChatWorkflowService: { processResponse: vi.fn() }, RedactionError: class { }, ShortQueryValidation: class { }, ChatRunInProgressError: class { } }));

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

    // Regression: the citation heading and disclaimer used to render with no
    // explicit lang attribute of their own, relying on document.documentElement.lang
    // (App.js) inheriting the route's own lang - which happened to equal this
    // message's own language before review mode's admin/chat language split
    // existed. Now that document.documentElement.lang can follow the reviewing
    // admin's own adminLang instead (App.js's computeAlternateLangHref, review
    // mode), these need their own explicit lang so they stay locked to the
    // answer's actual language - like every other bubble element from Q to
    // answer - independent of whatever the site-wide EN/FR toggle is currently set to.
    it('tags the citation heading and disclaimer with the answer\'s own language, not the ambient page lang', async () => {
        vi.mocked(usePageContext).mockReturnValue({ url: '', department: '' });
        render(<ChatAppContainer lang="en" />);

        expect(capturedFormatAIResponse).toBeInstanceOf(Function);

        const message = {
            id: 'm2',
            interaction: {
                citationUrl: 'https://www.canada.ca/fr/exemple.html',
                answer: {
                    paragraphs: ['<s-1>Une phrase.</s-1>'],
                    questionLanguage: 'fra',
                },
            },
        };

        const { container } = render(<div>{capturedFormatAIResponse('openai', message)}</div>);

        const heading = container.querySelector('p.citation-head');
        const disclaimer = container.querySelector('.disclaimer p');
        expect(heading.getAttribute('lang')).toBe('fr');
        expect(disclaimer.getAttribute('lang')).toBe('fr');
    });
});
