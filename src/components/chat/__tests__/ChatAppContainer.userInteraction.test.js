// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import ChatAppContainer from '../ChatAppContainer';
import { usePageContext } from '../../../hooks/usePageParam';
import { ChatWorkflowService } from '../../../services/ChatWorkflowService';

vi.mock('../../../hooks/usePageParam', () => ({
    usePageContext: vi.fn(() => ({ url: '', department: '' })),
    DEPARTMENT_MAPPINGS: {}
}));

vi.mock('../../../hooks/useTranslations', () => ({
    useTranslations: vi.fn(() => ({ t: (k) => k })),
}));

vi.mock('../../../services/DataStoreService', () => ({ default: { getPublicSetting: vi.fn(() => Promise.resolve('azure')) } }));
vi.mock('../../../services/SessionService', () => ({ default: { getChatId: vi.fn(() => Promise.resolve('abc')) } }));
vi.mock('../../../services/AuthService', () => ({ default: { isAuthenticated: vi.fn(() => Promise.resolve(false)), getUserId: vi.fn(() => null) } }));

const fakeInteraction = {
    chatId: 'abc',
    interactionId: 'int-1',
    question: { language: 'fra', redactedQuestion: 'Puis-je renouveler en ligne?' },
    answer: { questionLanguage: 'fra', content: 'Oui.', answerType: 'normal' },
};
vi.mock('../../../services/ChatWorkflowService', () => ({
    ChatWorkflowService: { processResponse: vi.fn(() => Promise.resolve(fakeInteraction)) },
    RedactionError: class { },
    ShortQueryValidation: class { },
    ChatRunInProgressError: class { }
}));

// Capture messages/handleInputChange/handleSendMessage in place of rendering
// the full ChatInterface (same pattern as formatAIResponse.test.js).
let latestProps = null;
vi.mock('../ChatInterface', () => ({
    default: (props) => {
        latestProps = props;
        return <div data-testid="chat-interface" />;
    }
}));

// Regression: the user message used to be pushed with no `interaction` at
// all, and never updated once the response came back - so
// getAnswerLanguage(message.interaction) on the question bubble
// (ChatInterface.js) always read undefined and rendered no lang attribute,
// even though the answer bubble right next to it tagged itself correctly.
//
// The fix is NOT to attach the whole `interaction` object to the user
// message (that was tried first, then reverted - see
// project_sentence_pairing_translation_fallback_todo.md and
// ChatAppContainer.js's own comment): `.interaction` presence is a signal
// other, unrelated server-side code (ContextAgentService.js,
// AnswerGenerationService.js) reads as "this is the AI's real turn" when
// building conversationHistory for the next request - the client `messages`
// array *is* that conversationHistory. A user message also carrying
// `.interaction` silently double-counted every historical turn for both of
// those. So only the resolved language string is attached, under its own
// field, and `.interaction` stays exclusively an AI-message thing.
describe('ChatAppContainer - user message gets the resolved question language attached', () => {
    afterEach(() => {
        cleanup();
        latestProps = null;
        vi.clearAllMocks();
    });

    it('attaches the resolved question language (not the whole interaction) to the user\'s own message once the response comes back', async () => {
        vi.mocked(usePageContext).mockReturnValue({ url: '', department: '' });
        render(<ChatAppContainer lang="en" />);

        await act(async () => {
            latestProps.handleInputChange({ target: { value: 'Puis-je renouveler en ligne?' } });
        });
        await act(async () => {
            await latestProps.handleSendMessage();
        });

        const userMessage = latestProps.messages.find((m) => m.sender === 'user');
        const aiMessage = latestProps.messages.find((m) => m.sender === 'ai');

        expect(userMessage).toBeTruthy();
        expect(userMessage.questionLanguage).toBe('fra');
        expect(userMessage.interaction).toBeUndefined();
        expect(aiMessage.interaction).toEqual(fakeInteraction);
        expect(ChatWorkflowService.processResponse).toHaveBeenCalledTimes(1);
    });
});
