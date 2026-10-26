/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { useRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { useAnnounceOnChange } from '../useAnnounceOnChange.js';

const announce = vi.fn();
vi.mock('../../utils/liveAnnouncer.js', () => ({
  announce: (...args) => announce(...args),
}));

const Box = ({ text, enabled, assertive, nonce }) => {
  const ref = useRef(null);
  useAnnounceOnChange(ref, { enabled, assertive, nonce });
  return text ? React.createElement('div', { ref }, text) : null;
};

describe('useAnnounceOnChange', () => {
  beforeEach(() => announce.mockClear());
  afterEach(() => cleanup());

  it('announces the rendered text when it appears, once', () => {
    const { rerender } = render(React.createElement(Box, { text: 'Saved' }));
    rerender(React.createElement(Box, { text: 'Saved' }));
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Saved', { assertive: false, skippable: false });
  });

  it('announces again when the text changes', () => {
    const { rerender } = render(React.createElement(Box, { text: 'Saving' }));
    rerender(React.createElement(Box, { text: 'Saved' }));
    expect(announce.mock.calls.map((c) => c[0])).toEqual(['Saving', 'Saved']);
  });

  it('re-announces identical text after it was cleared in between', () => {
    const { rerender } = render(React.createElement(Box, { text: 'Saved' }));
    rerender(React.createElement(Box, { text: null }));
    rerender(React.createElement(Box, { text: 'Saved' }));
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('re-announces identical text when nonce bumps', () => {
    const { rerender } = render(React.createElement(Box, { text: 'Saved', nonce: 1 }));
    rerender(React.createElement(Box, { text: 'Saved', nonce: 2 }));
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('passes assertive through', () => {
    render(React.createElement(Box, { text: 'Failed', assertive: true }));
    expect(announce).toHaveBeenCalledWith('Failed', { assertive: true, skippable: false });
  });

  it('is silent when disabled', () => {
    render(React.createElement(Box, { text: 'Saved', enabled: false }));
    expect(announce).not.toHaveBeenCalled();
  });
});
