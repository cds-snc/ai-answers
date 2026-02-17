// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ChatAppContainer from '../ChatAppContainer';
import { usePageContext } from '../../../hooks/usePageParam';

// Mock hooks before importing components that use them
vi.mock('../../../hooks/usePageParam', () => ({
    usePageContext: vi.fn(),
    DEPARTMENT_MAPPINGS: {
        'revenue-agency': { code: 'CRA', en: 'revenue-agency', fr: 'agence-revenu' }
    }
}));

vi.mock('../../../hooks/useTranslations', () => ({
    useTranslations: vi.fn(() => ({
        t: (k) => {
            const mockT = (val) => val;
            mockT.text = (val) => val;
            return mockT(k);
        }
    }))
}));

// Mock services
vi.mock('../../../services/DataStoreService', () => ({ default: { getPublicSetting: vi.fn(() => Promise.resolve('azure')) } }));
vi.mock('../../../services/SessionService', () => ({ default: { getChatId: vi.fn(() => Promise.resolve('abc')) } }));
vi.mock('../../../services/AuthService', () => ({ default: { isAuthenticated: vi.fn(() => Promise.resolve(false)) } }));
vi.mock('../../../services/ChatWorkflowService', () => ({ ChatWorkflowService: { processResponse: vi.fn() }, RedactionError: class { }, ShortQueryValidation: class { } }));

vi.mock('../ChatInterface', () => ({
    default: ({ referringUrl, handleReferringUrlChange, turnCount, readOnly }) => (
        <div data-testid="chat-interface">
            <div data-testid="url-display">{referringUrl}</div>
            <button data-testid="change-btn" onClick={() => handleReferringUrlChange({ target: { value: 'manual-url' } })}>Change</button>
            <div data-testid="turn-count">{turnCount}</div>
            {turnCount === 0 && referringUrl && !readOnly && (
                <div data-testid="hint">Hint: {referringUrl}</div>
            )}
        </div>
    )
}));

describe('ChatAppContainer - Referring URL', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(usePageContext).mockReturnValue({ url: '', department: '' });
    });

    afterEach(() => {
        cleanup();
    });

    it('prefers initialReferringUrl (Review Mode)', async () => {
        render(<ChatAppContainer lang="en" initialReferringUrl="init-url" readOnly={true} />);
        await waitFor(() => expect(screen.getByTestId('url-display').textContent).toBe('init-url'));
    });

    it('prefers pageUrl over clientReferrer (Live Mode)', async () => {
        vi.mocked(usePageContext).mockReturnValue({ url: 'page-url', department: '' });

        // Pass clientReferrer prop directly as HomePage.js would
        render(<ChatAppContainer lang="en" clientReferrer="ref-url" />);
        await waitFor(() => expect(screen.getByTestId('url-display').textContent).toBe('page-url'));
    });

    it('falls back to clientReferrer prop if pageUrl is missing', async () => {
        vi.mocked(usePageContext).mockReturnValue({ url: '', department: '' });

        // Simulating HomePage.js behavior: <ChatAppContainer clientReferrer={document.referrer} />
        render(<ChatAppContainer lang="en" clientReferrer="ref-url" />);
        await waitFor(() => expect(screen.getByTestId('url-display').textContent).toBe('ref-url'));
    });

    it('handles manual update and shows hint', async () => {
        vi.mocked(usePageContext).mockReturnValue({ url: 'original-url', department: '' });
        render(<ChatAppContainer lang="en" />);

        // Initial hint from pageUrl
        const hint = await screen.findByTestId('hint');
        expect(hint.textContent).toContain('original-url');

        // Change it
        fireEvent.click(screen.getByTestId('change-btn'));

        await waitFor(() => expect(screen.getByTestId('url-display').textContent).toBe('manual-url'));
    });
});
