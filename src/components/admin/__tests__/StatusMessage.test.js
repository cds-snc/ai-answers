/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import StatusMessage from '../StatusMessage.js';

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
});
