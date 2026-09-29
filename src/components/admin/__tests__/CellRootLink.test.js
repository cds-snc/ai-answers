// @vitest-environment jsdom

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CellRootLink from '../CellRootLink.js';

describe('CellRootLink', () => {
    it('renders a real link and navigates in-app on a plain click', () => {
        const navigate = vi.fn();
        render(<CellRootLink href="/en/somewhere" navigate={navigate}>Go</CellRootLink>);

        const link = screen.getByRole('link', { name: 'Go' });
        expect(link.getAttribute('href')).toBe('/en/somewhere');
        expect(fireEvent.click(link)).toBe(false); // default prevented: no page load
        expect(navigate).toHaveBeenCalledWith('/en/somewhere');
    });

    it('leaves modified clicks to the browser (new tab / window)', () => {
        const navigate = vi.fn();
        render(<CellRootLink href="/en/somewhere" navigate={navigate}>Go</CellRootLink>);

        // Stop the browser default at window (after React's handler) so jsdom
        // doesn't attempt a real page load.
        const blockPageLoad = (e) => e.preventDefault();
        window.addEventListener('click', blockPageLoad);

        const link = screen.getByRole('link', { name: 'Go' });
        fireEvent.click(link, { metaKey: true });
        fireEvent.click(link, { ctrlKey: true });
        fireEvent.click(link, { shiftKey: true });
        expect(navigate).not.toHaveBeenCalled();

        window.removeEventListener('click', blockPageLoad);
    });
});
