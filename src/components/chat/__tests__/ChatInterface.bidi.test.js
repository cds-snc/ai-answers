// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import ChatInterface from '../ChatInterface';

vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key) => key,
  }),
}));

const mockUseHasAnyRole = vi.fn(() => false);
vi.mock('../../RoleBasedUI.js', () => ({
  useHasAnyRole: (...args) => mockUseHasAnyRole(...args),
  RoleBasedContent: () => null,
}));

afterEach(() => {
  cleanup();
});

const baseProps = {
  inputText: '',
  isLoading: false,
  textareaKey: 'test',
  handleInputChange: vi.fn(),
  handleSendMessage: vi.fn(),
  handleReload: vi.fn(),
  handleAIToggle: vi.fn(),
  workflowSelection: '',
  handleWorkflowChange: vi.fn(),
  handleReferringUrlChange: vi.fn(),
  formatAIResponse: () => null,
  modelSelection: '',
  selectedSearch: '',
  referringUrl: '',
  chatCreatedAt: null,
  turnCount: 1,
  showFeedback: false,
  displayStatus: '',
  currentDepartment: '',
  currentTopic: '',
  MAX_CONVERSATION_TURNS: 10,
  t: (key) => key,
  lang: 'en',
  extractSentences: (text) => [text],
  chatId: 'chat-1',
  readOnly: false,
  userLeftChatRef: { current: true },
};

describe('ChatInterface - user question bidi isolation', () => {
  it('marks the user question paragraph dir="auto" so an RTL name or phrase keeps its own base direction', () => {
    const messages = [
      {
        id: 'u1',
        sender: 'user',
        text: 'Hello أحمد, your total is 45$.',
        questionLanguage: 'eng',
      },
    ];

    const { container } = render(<ChatInterface {...baseProps} messages={messages} />);

    const question = container.querySelector('.user-message-box p');
    expect(question).not.toBeNull();
    expect(question.textContent).toBe('Hello أحمد, your total is 45$.');
    expect(question.getAttribute('dir')).toBe('auto');
    expect(question.getAttribute('lang')).toBe('en');
  });

  it('keeps dir="auto" on a fully RTL question without changing the tagged question language', () => {
    const messages = [
      {
        id: 'u2',
        sender: 'user',
        text: 'هل يمكنني التجديد عبر الإنترنت؟',
        questionLanguage: 'ara',
      },
    ];

    const { container } = render(<ChatInterface {...baseProps} messages={messages} />);

    const question = container.querySelector('.user-message-box p');
    expect(question).not.toBeNull();
    expect(question.getAttribute('dir')).toBe('auto');
    expect(question.getAttribute('lang')).toBe('ar');
  });
});
