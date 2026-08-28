/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import StatusMessage, { useRepeatableStatus } from '../StatusMessage.js';

vi.mock('@gcds-core/components-react', () => ({
  GcdsIcon: (props) => React.createElement('span', { ...props, 'data-gcds-icon': true, 'aria-hidden': 'true' }),
}));

const announce = vi.fn();
vi.mock('../../../utils/liveAnnouncer.js', () => ({
  announce: (...args) => announce(...args),
}));

describe('StatusMessage', () => {
  beforeEach(() => announce.mockClear());
  afterEach(() => cleanup());

  it('renders nothing when there is no message', () => {
    const { container } = render(React.createElement(StatusMessage, { message: null }));

    expect(container.innerHTML).toBe('');
    expect(announce).not.toHaveBeenCalled();
  });

  it('is not a live region itself — it announces through the shared announcer', () => {
    // A live region inserted into the DOM with its text already in it is
    // dropped by screen readers, and this component is almost always
    // conditionally rendered. So the element stays plain markup and the
    // text goes to the always-mounted site-wide region instead.
    const { container } = render(React.createElement(StatusMessage, { message: 'Saved' }));

    expect(container.querySelector('[role], [aria-live]')).toBeNull();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Saved', { assertive: false, skippable: false });
  });

  it('announces assertively for isError and the error variant, politely otherwise', () => {
    render(React.createElement(StatusMessage, { message: 'Failed', isError: true }));
    render(React.createElement(StatusMessage, { message: 'Broken', variant: 'error' }));
    render(React.createElement(StatusMessage, { message: 'Careful', variant: 'warning' }));

    expect(announce.mock.calls).toEqual([
      ['Failed', { assertive: true, skippable: false }],
      ['Broken', { assertive: true, skippable: false }],
      ['Careful', { assertive: false, skippable: false }],
    ]);
  });

  it('announces rendered children text, including a <code lang="en"> detail', () => {
    render(
      React.createElement(StatusMessage, { variant: 'error' },
        'Export failed: ', React.createElement('code', { lang: 'en' }, 'disk full'), '.')
    );

    expect(announce).toHaveBeenCalledWith('Export failed: disk full.', { assertive: true, skippable: false });
  });

  it('announces once per outcome, not on every parent re-render', () => {
    const { rerender } = render(React.createElement(StatusMessage, { message: 'Saved' }));
    rerender(React.createElement(StatusMessage, { message: 'Saved' }));
    rerender(React.createElement(StatusMessage, { message: 'Saved' }));

    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('re-announces the identical message when nonce changes', () => {
    const { rerender } = render(React.createElement(StatusMessage, { message: 'Saved', nonce: 1 }));
    rerender(React.createElement(StatusMessage, { message: 'Saved', nonce: 2 }));

    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('re-announces the identical message after it was cleared in between', () => {
    const { rerender } = render(React.createElement(StatusMessage, { message: 'Saved' }));
    rerender(React.createElement(StatusMessage, { message: null }));
    rerender(React.createElement(StatusMessage, { message: 'Saved' }));

    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('announce={false} renders the box silently, for callers that move focus onto it', () => {
    const { container } = render(
      React.createElement(StatusMessage, { message: 'Invalid link', variant: 'error', announce: false })
    );

    expect(container.querySelector('.status-message--error-box')).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();
  });

  it('forwards a ref so callers can move focus to the message', () => {
    const ref = React.createRef();
    render(React.createElement(StatusMessage, { message: 'Showing 1 of 1', ref, tabIndex: -1 }));

    expect(ref.current).toBeTruthy();
    ref.current.focus();
    expect(document.activeElement).toBe(ref.current);
  });

  it('builds the box className and icon from a variant', () => {
    const { container } = render(
      React.createElement(StatusMessage, { message: 'Changes to General settings saved.', variant: 'success' })
    );

    const box = container.firstChild;
    expect(box.tagName).toBe('DIV');
    expect(box.className).toContain('status-message--success-box');
    // success uses a raw FA checkmark span, not GcdsIcon — GC DS's icon font
    // has no checkmark glyph.
    expect(box.querySelector('.fa-check-circle')).toBeTruthy();
    expect(box.textContent).toBe('Changes to General settings saved.');
  });

  it('uses the error box styling and warning icon for the error variant', () => {
    const { container } = render(
      React.createElement(StatusMessage, { message: 'Failed to save setting.', variant: 'error' })
    );

    const box = container.firstChild;
    expect(box.className).toContain('status-message--error-box');
    expect(box.querySelector('[data-gcds-icon]').getAttribute('name')).toBe('warning-triangle');
  });

  it('merges caller className with the variant box className', () => {
    const { container } = render(
      React.createElement(StatusMessage, {
        message: 'Failed to save setting.',
        variant: 'error',
        className: 'mt-200',
      })
    );

    expect(container.firstChild.className).toBe('mt-200 status-message--error-box');
  });
});

describe('useRepeatableStatus', () => {
  it('starts with no message and nonce 0', () => {
    const { result } = renderHook(() => useRepeatableStatus());

    expect(result.current.message).toBeNull();
    expect(result.current.nonce).toBe(0);
  });

  it('announce() sets the message and bumps the nonce', () => {
    const { result } = renderHook(() => useRepeatableStatus());

    act(() => result.current.announce('Referring URL applied'));

    expect(result.current.message).toBe('Referring URL applied');
    expect(result.current.nonce).toBe(1);
  });

  it('bumps the nonce again even when the same text fires twice in a row', () => {
    // The whole reason nonce exists: StatusMessage only re-announces on a
    // text *change*, so an identical repeat outcome would otherwise go
    // silently un-announced to screen reader users.
    const { result } = renderHook(() => useRepeatableStatus());

    act(() => result.current.announce('Referring URL removed'));
    act(() => result.current.announce('Referring URL removed'));

    expect(result.current.message).toBe('Referring URL removed');
    expect(result.current.nonce).toBe(2);
  });

  it('returns stable announce/clear callbacks across renders', () => {
    // So they can safely sit in a useEffect/useCallback dependency array
    // without an exhaustive-deps warning or a re-run loop.
    const { result, rerender } = renderHook(() => useRepeatableStatus());
    const firstAnnounce = result.current.announce;
    const firstClear = result.current.clear;
    rerender();
    expect(result.current.announce).toBe(firstAnnounce);
    expect(result.current.clear).toBe(firstClear);
  });

  it('clear() resets the message without bumping the nonce', () => {
    // Clearing a stale value isn't itself an outcome worth announcing, so
    // it shouldn't force a re-announcement the way announce() does.
    const { result } = renderHook(() => useRepeatableStatus());

    act(() => result.current.announce('Something happened'));
    expect(result.current.nonce).toBe(1);

    act(() => result.current.clear());
    expect(result.current.message).toBeNull();
    expect(result.current.nonce).toBe(1);
  });
});
