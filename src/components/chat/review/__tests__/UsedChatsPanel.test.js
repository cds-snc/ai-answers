// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UsedChatsPanel from '../UsedChatsPanel.js';

const translations = {
    'reviewPanels.usedQaChatsTitle': 'Past evals used',
    'reviewPanels.chatId': 'Chat ID',
    'reviewPanels.totalScore': 'Total score',
    'homepage.expertRating.answerNumberLabel': 'Answer {number}',
    'homepage.expertRating.labelWithAnswer': '{label}: {answer}',
};
const t = (key) => translations[key];

describe('UsedChatsPanel', () => {
    it('renders the persisted Q&A matches', () => {
        render(<UsedChatsPanel
            t={t}
            answerNumber={1}
            lang="fr"
            message={{ interaction: { context: { qaMatches: [{
                chatId: 'chat-1', interactionId: 'interaction-1', similarity: 0.91, totalScore: 80,
                questionText: 'Past question', answerText: 'Past answer',
            }] } } }}
        />);

        expect(screen.getByText('Past evals used: Answer 1')).not.toBeNull();
        const chatLink = screen.getByText('chat-1');
        expect(chatLink).not.toBeNull();
        expect(chatLink.closest('a').getAttribute('href')).toBe('/fr?chat=chat-1&review=1');
        expect(screen.getByText('80')).not.toBeNull();
    });

    it('renders nothing when no Q&A matches were persisted', () => {
        const { container } = render(<UsedChatsPanel t={t} message={{ interaction: { context: {} } }} />);
        expect(container.childElementCount).toBe(0);
    });
});
