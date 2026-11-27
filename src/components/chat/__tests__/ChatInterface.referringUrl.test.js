// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import ChatInterface from '../ChatInterface';

// AIA-006: ChatAppContainer passes '' as referringUrl when a signed-out visitor
// came from a non-GC page (ChatAppContainer.referringUrl.test.js). This checks
// that '' leaves no trace of a referrer on the page: no banner, no echo, no
// aria-describedby target.

vi.mock('../../RoleBasedUI.js', () => ({ useHasAnyRole: vi.fn(() => false) }));
vi.mock('../../../hooks/useTranslations.js', () => ({ useTranslations: vi.fn(() => ({ t: (k) => k })) }));
vi.mock('../../../hooks/chat/useActiveScenarioOverride.js', () => ({
  default: vi.fn(() => ({ override: null })),
  useActiveScenarioOverride: vi.fn(() => ({ override: null })),
}));
vi.mock('../ChatOptions.js', () => ({ default: () => null }));
vi.mock('../ScenarioOverrideBanner.js', () => ({ default: () => null }));
vi.mock('../../scenario/ScenarioSubmitInstructions.js', () => ({ default: () => null }));

const baseProps = {
  messages: [],
  inputText: '',
  isLoading: false,
  textareaKey: 0,
  handleInputChange: vi.fn(),
  handleSendMessage: vi.fn(),
  handleReload: vi.fn(),
  formatAIResponse: vi.fn(),
  turnCount: 0,
  showFeedback: false,
  displayStatus: 'moderatingQuestion',
  MAX_CONVERSATION_TURNS: 3,
  t: (k) => k,
  lang: 'en',
  extractSentences: vi.fn(() => []),
  chatId: 'abc',
  userLeftChatRef: { current: false },
};

describe('ChatInterface - referring URL display', () => {
  afterEach(() => cleanup());

  it('shows the banner and points the textarea at it when given a referring URL', () => {
    const { container } = render(
      <ChatInterface {...baseProps} referringUrl="https://www.canada.ca/en/services/taxes.html" />,
    );

    expect(container.querySelector('#displayReferringURL')).not.toBeNull();
    expect(container.querySelector('textarea').getAttribute('aria-describedby')).toContain('displayReferringURL');
  });

  it('leaves no banner, echo or aria-describedby target when the referring URL is empty', () => {
    const { container } = render(<ChatInterface {...baseProps} referringUrl="" />);

    expect(container.querySelector('#displayReferringURL')).toBeNull();
    expect(container.querySelector('.referring-url-label')).toBeNull();
    expect(container.querySelector('textarea').getAttribute('aria-describedby')).toBe('chat-input-hint');
  });
});
