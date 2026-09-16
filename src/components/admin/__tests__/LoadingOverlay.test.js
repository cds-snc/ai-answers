/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import LoadingOverlay from '../LoadingOverlay.js';

const announce = vi.fn();
vi.mock('../../../utils/liveAnnouncer.js', () => ({
  announce: (...args) => announce(...args),
}));

describe('LoadingOverlay', () => {
  beforeEach(() => announce.mockClear());
  afterEach(() => cleanup());

  it('announces its message politely and skippably, and signposts the region it went to', () => {
    const { container } = render(<LoadingOverlay message="Loading…" />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Loading…', expect.objectContaining({ assertive: false, skippable: true }));
    const text = container.querySelector('[data-announced-via]');
    expect(text.textContent).toBe('Loading…');
    expect(text.getAttribute('data-announced-via')).toBe('live-announcer-polite');
    // Not a live region itself.
    expect(container.querySelector('[role], [aria-live]')).toBeNull();
  });
});
