// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BatchItemDetail from '../BatchItemDetail.js';

vi.mock('@cdssnc/gcds-components-react', () => ({
    GcdsHeading: ({ children, tag: Tag = 'h2', id }) => <Tag id={id}>{children}</Tag>,
    GcdsButton: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
    GcdsDetails: ({ children, detailsTitle }) => <details><summary>{detailsTitle}</summary>{children}</details>
}));

const renderDetail = (props) => render(
    <BatchItemDetail
        onBack={() => {}}
        onPrev={() => {}}
        onNext={() => {}}
        {...props}
    />
);

// The <dt> label paired with a value in the interaction list.
const labelFor = (value) => screen.getByText(value).closest('div').querySelector('dt').textContent;

describe('BatchItemDetail', () => {
    it('compares the complete reference and generated answers side by side in a table', () => {
        const referenceAnswer = `Reference answer ${'with more detail '.repeat(20)}`;
        const currentAnswer = `Current answer ${'with more detail '.repeat(20)}`;

        renderDetail({
            item: { _id: 'item-1', chatId: 'chat-1', status: 'completed', question: 'Am I eligible?', referenceAnswer, answer: currentAnswer }
        });

        expect(labelFor('Am I eligible?')).toBe('Question');
        const table = screen.getByRole('table', { name: 'Interaction 1' });
        expect(within(table).getAllByRole('columnheader').map(th => th.textContent)).toEqual(['Reference answer', 'Generated answer']);
        const cells = within(table).getAllByRole('cell');
        expect(cells[0].textContent).toBe(referenceAnswer);
        expect(cells[1].textContent).toBe(currentAnswer);
    });

    it('gives each interaction its own heading', () => {
        renderDetail({
            item: { _id: 'item-1', chatId: 'chat-1', status: 'completed' },
            chatItems: [
                { _id: 'item-1', chatId: 'chat-1', status: 'completed', question: 'First question' },
                { _id: 'item-2', chatId: 'chat-1', status: 'completed', question: 'Second question' }
            ]
        });

        const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
        expect(headings).toEqual(['Interaction 1', 'Interaction 2']);
    });

    it('shows analyzer summaries in the list and each analyzer in its own collapsible section', () => {
        renderDetail({
            item: {
                _id: 'item-1',
                chatId: 'chat-1',
                status: 'completed',
                analysisResults: { 'expert-scorer': { verdict: 'pass', explanation: 'Matches the reference.', score: 90 } }
            }
        });

        expect(screen.queryByRole('button', { name: 'Simple view' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Detailed view' })).toBeNull();
        expect(labelFor('pass: Matches the reference.')).toBe('Expert scorer');

        const details = document.querySelector('details');
        expect(details.querySelector('summary').textContent).toBe('View: Expert scorer');
        expect(within(details).getByText('90').closest('div').querySelector('dt').textContent).toBe('Score');
    });

    it('names each analyzer section in French with the translated analyzer name', () => {
        renderDetail({
            lang: 'fr',
            item: { _id: 'item-1', chatId: 'chat-1', status: 'completed', analysisResults: { 'expert-scorer': { verdict: 'pass' } } }
        });

        expect(document.querySelector('summary').textContent).toBe('Voir : Évaluateur expert');
    });

    it('ends each interaction with its chat log button', () => {
        renderDetail({
            item: { _id: 'item-1', chatId: 'chat-1', status: 'completed', question: 'Am I eligible?' }
        });

        const interaction = screen.getByRole('heading', { name: 'Interaction 1' }).closest('section');
        const buttons = within(interaction).getAllByRole('button');
        expect(buttons.at(-1).textContent).toBe('View chat logs');
    });
});
