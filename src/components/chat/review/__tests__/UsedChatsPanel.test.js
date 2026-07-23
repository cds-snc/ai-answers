// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UsedChatsPanel from '../UsedChatsPanel.js';

const translations = {
    'reviewPanels.usedQaChatsTitle': 'Past Q&A used',
    'reviewPanels.chatId': 'Chat ID',
    'reviewPanels.interactionId': 'Interaction ID',
    'reviewPanels.question': 'Question',
    'reviewPanels.answer': 'Answer',
    'reviewPanels.similarity': 'Similarity',
    'homepage.expertRating.answerNumberLabel': 'Answer {number}',
    'homepage.expertRating.labelWithAnswer': '{label}: {answer}',
};
const t = (key) => translations[key];

describe('UsedChatsPanel', () => {
    it('renders the persisted Q&A matches', () => {
        render(<UsedChatsPanel
            t={t}
            answerNumber={1}
            message={{ interaction: { context: { qaMatches: [{
                chatId: 'chat-1', interactionId: 'interaction-1', similarity: 0.91,
                questionText: 'Past question', answerText: 'Past answer',
            }] } } }}
        />);

        expect(screen.getByText('Past Q&A used: Answer 1')).not.toBeNull();
        expect(screen.getByText('chat-1')).not.toBeNull();
        expect(screen.getByText('interaction-1')).not.toBeNull();
        expect(screen.getByText('Past question')).not.toBeNull();
        expect(screen.getByText('Past answer')).not.toBeNull();
        expect(screen.getByText('0.91')).not.toBeNull();
    });

    it('renders nothing when no Q&A matches were persisted', () => {
        const { container } = render(<UsedChatsPanel t={t} message={{ interaction: { context: {} } }} />);
        expect(container.childElementCount).toBe(0);
    });
});
