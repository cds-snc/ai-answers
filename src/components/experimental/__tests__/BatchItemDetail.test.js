// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BatchItemDetail from '../BatchItemDetail.js';

describe('BatchItemDetail', () => {
    it('displays complete reference and current answers', () => {
        const referenceAnswer = `Reference answer ${'with more detail '.repeat(20)}`;
        const currentAnswer = `Current answer ${'with more detail '.repeat(20)}`;

        render(
            <BatchItemDetail
                item={{
                    _id: 'item-1',
                    chatId: 'chat-1',
                    status: 'completed',
                    referenceAnswer,
                    answer: currentAnswer
                }}
                onBack={() => {}}
                onPrev={() => {}}
                onNext={() => {}}
            />
        );

        const cells = screen.getAllByRole('cell');
        expect(cells[2].textContent).toContain(referenceAnswer);
        expect(cells[3].textContent).toContain(currentAnswer);
    });
});
