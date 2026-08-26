/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import StatusMessage, { useSrAnnouncer } from '../StatusMessage.js';

vi.mock('@gcds-core/components-react', () => ({
  GcdsIcon: (props) => React.createElement('span', { ...props, 'data-gcds-icon': true, 'aria-hidden': 'true' }),
}));

describe('StatusMessage', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when there is no message', () => {
    const { container } = render(React.createElement(StatusMessage, { message: null }));

    expect(container.innerHTML).toBe('');
  });

  it('announces politely by default and assertively for errors', () => {
    const { container: status } = render(React.createElement(StatusMessage, { message: 'Saved' }));
    expect(status.querySelector('[role="status"]').getAttribute('aria-live')).toBe('polite');

    const { container: alert } = render(
      React.createElement(StatusMessage, { message: 'Failed', isError: true })
    );
    expect(alert.querySelector('[role="alert"]').getAttribute('aria-live')).toBe('assertive');
  });

  it('keeps a persistent region mounted while empty', () => {
    // A live region inserted with its text already in it is usually not
    // announced — it has to be present before the text changes.
    const { container } = render(React.createElement(StatusMessage, { message: null, persistent: true }));

    const region = container.querySelector('[role="status"]');
    expect(region).toBeTruthy();
    expect(region.textContent).toBe('');
  });

  it('does not let an empty persistent region carry caller styling', () => {
    const { container } = render(React.createElement(StatusMessage, {
      message: null,
      persistent: true,
      className: 'mb-200',
    }));

    // Caller spacing on an invisible node would reserve layout space for
    // nothing, so it's replaced with the fixed `status-message--empty` class
    // instead — global.css scopes its margin/padding reset to that class
    // rather than every `[aria-live]` region in the app.
    expect(container.querySelector('[role="status"]').className).toBe('status-message--empty');
  });

  it('forwards a ref so callers can move focus to the message', () => {
    const ref = React.createRef();
    render(React.createElement(StatusMessage, { message: 'Showing 1 of 1', ref, tabIndex: -1 }));

    expect(ref.current).toBeTruthy();
    ref.current.focus();
    expect(document.activeElement).toBe(ref.current);
  });

  it('builds the box className, role, and icon from a variant', () => {
    const { container } = render(
      React.createElement(StatusMessage, { message: 'Changes to General settings saved.', variant: 'success' })
    );

    const region = container.querySelector('[role="status"]');
    expect(region.className).toContain('status-message--success-box');
    expect(region.getAttribute('aria-live')).toBe('polite');
    // success uses a raw FA checkmark span, not GcdsIcon — GC DS's icon font
    // has no checkmark glyph.
    expect(region.querySelector('.fa-check-circle')).toBeTruthy();
    expect(region.textContent).toBe('Changes to General settings saved.');
  });

  it('marks the error variant assertive and uses the error box styling', () => {
    const { container } = render(
      React.createElement(StatusMessage, { message: 'Failed to save setting.', variant: 'error' })
    );

    const region = container.querySelector('[role="alert"]');
    expect(region).toBeTruthy();
    expect(region.getAttribute('aria-live')).toBe('assertive');
    expect(region.className).toContain('status-message--error-box');
    expect(region.querySelector('[data-gcds-icon]').getAttribute('name')).toBe('warning-triangle');
  });

  it('merges caller className with the variant box className', () => {
    const { container } = render(
      React.createElement(StatusMessage, {
        message: 'Failed to save setting.',
        variant: 'error',
        className: 'mt-200',
      })
    );

    const region = container.querySelector('[role="alert"]');
    expect(region.className).toBe('mt-200 status-message--error-box');
  });

  describe('nonce (repeat-identical-announcement)', () => {
    // `nonce` used to be folded into the rendered element's `key`, forcing a
    // full destroy-and-recreate of the DOM node on every bump — which
    // reproduces the exact "text already there on insertion" problem
    // `persistent` exists to prevent (a freshly-created node isn't the same
    // node AT was already watching). These pin the node identity, not just
    // the final text, since that's the part a snapshot of the rendered
    // output wouldn't catch.
    it('keeps the same DOM node across a nonce bump with a different message', () => {
      const { container, rerender } = render(
        React.createElement(StatusMessage, { persistent: true, variant: 'info', message: 'First', nonce: 0 })
      );
      const node = container.querySelector('[role="status"]');

      rerender(React.createElement(StatusMessage, { persistent: true, variant: 'info', message: 'Second', nonce: 1 }));

      expect(container.querySelector('[role="status"]')).toBe(node);
      expect(node.textContent).toBe('Second');
    });

    it('keeps the same DOM node and still updates when the same message repeats', () => {
      const { container, rerender } = render(
        React.createElement(StatusMessage, { persistent: true, variant: 'success', message: 'Referring URL applied', nonce: 0 })
      );
      const node = container.querySelector('[role="status"]');

      rerender(React.createElement(StatusMessage, { persistent: true, variant: 'success', message: 'Referring URL applied', nonce: 1 }));

      // Same node identity (no remount)...
      expect(container.querySelector('[role="status"]')).toBe(node);
      // ...settled back to the real text, not stuck on the intermediate
      // blank state the fix uses internally to force a real mutation.
      expect(node.textContent).toBe('Referring URL applied');
      expect(node.className).toContain('status-message--success-box');
    });

    it('does not react to nonce when the caller never uses it', () => {
      // No `nonce` prop at all (most `persistent` callers) — confirms the
      // fix is inert for them, same as before.
      const { container, rerender } = render(
        React.createElement(StatusMessage, { persistent: true, variant: 'info', message: null })
      );
      const node = container.querySelector('[role="status"]');

      rerender(React.createElement(StatusMessage, { persistent: true, variant: 'info', message: 'Not found' }));

      expect(container.querySelector('[role="status"]')).toBe(node);
      expect(node.textContent).toBe('Not found');
    });
  });
});

describe('useSrAnnouncer', () => {
  it('starts with no message and nonce 0', () => {
    const { result } = renderHook(() => useSrAnnouncer());

    expect(result.current.message).toBeNull();
    expect(result.current.nonce).toBe(0);
  });

  it('announce() sets the message and bumps the nonce', () => {
    const { result } = renderHook(() => useSrAnnouncer());

    act(() => result.current.announce('Referring URL applied'));

    expect(result.current.message).toBe('Referring URL applied');
    expect(result.current.nonce).toBe(1);
  });

  it('bumps the nonce again even when the same text fires twice in a row', () => {
    // The whole reason nonce exists: a plain message string only re-renders
    // consumers on a *value* change, so an identical repeat announcement
    // would otherwise go silently un-announced to screen reader users.
    const { result } = renderHook(() => useSrAnnouncer());

    act(() => result.current.announce('Referring URL removed'));
    act(() => result.current.announce('Referring URL removed'));

    expect(result.current.message).toBe('Referring URL removed');
    expect(result.current.nonce).toBe(2);
  });

  it('keeps announce referentially stable across re-renders', () => {
    // useCallback with no deps — so a caller can safely put it in an effect
    // dependency array without an exhaustive-deps warning or a re-run loop.
    const { result, rerender } = renderHook(() => useSrAnnouncer());
    const firstAnnounce = result.current.announce;

    rerender();

    expect(result.current.announce).toBe(firstAnnounce);
  });

  it('clear() resets the message without bumping the nonce', () => {
    // Clearing a stale value isn't itself an outcome worth announcing, so
    // it shouldn't force a re-render/re-announcement the way announce() does.
    const { result } = renderHook(() => useSrAnnouncer());

    act(() => result.current.announce('Something happened'));
    expect(result.current.nonce).toBe(1);

    act(() => result.current.clear());

    expect(result.current.message).toBeNull();
    expect(result.current.nonce).toBe(1);
  });
});
