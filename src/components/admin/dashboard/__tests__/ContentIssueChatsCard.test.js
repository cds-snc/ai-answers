// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ContentIssueChatsCard from '../ContentIssueChatsCard.js';

const chats = [
  { chatId: 'chat-1', interactionId: 'int-1', pageLanguage: 'en', createdAt: '2026-08-05T00:00:00Z', questionNumber: 2, status: 'hasError' },
];

const baseProps = {
  title: 'Chats',
  triggerLabel: 'See chats',
  chats,
  chatIdColLabel: 'Chat ID',
  questionColLabel: '#',
  questionColAriaLabel: 'Question number',
  questionLinkLabel: ', question {number}',
  dateColLabel: 'Date',
  noDataLabel: 'None',
  collapsible: false,
};

describe('ContentIssueChatsCard', () => {
  it('renders a status column when statusColLabel is passed', () => {
    render(<ContentIssueChatsCard {...baseProps} statusColLabel="Issue type" statusLabels={{ hasError: 'Has answer error' }} />);

    expect(screen.getAllByRole('columnheader')).toHaveLength(4);
    expect(screen.getAllByRole('cell')).toHaveLength(4);
    expect(screen.getByText('Has answer error')).toBeTruthy();
  });

  it('leaves out the status cell when no statusColLabel is passed', () => {
    render(<ContentIssueChatsCard {...baseProps} />);

    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.getAllByRole('cell')).toHaveLength(3);
  });

  // Rows of the same chat share link text; the question number tells them apart.
  it('numbers each link and shows a # column', () => {
    render(<ContentIssueChatsCard {...baseProps} />);

    expect(screen.getByText(', question 2').className).toBe('sr-only');
    expect(screen.getByRole('columnheader', { name: 'Question number' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '2' })).toBeTruthy();
  });
});
