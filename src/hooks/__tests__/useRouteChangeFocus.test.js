/**
 * @vitest-environment jsdom
 */
import React, { useEffect, useRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';
import { useRouteChangeFocus } from '../useRouteChangeFocus.js';

// A genuine child component, not just a second effect in the same component
// body - its mount/update effect must resolve before the parent's, matching
// how a real destination page (e.g. ChatInterface's textarea autofocus)
// sits below AppLayout in the tree.
const InnerAutofocus = ({ enabled }) => {
  const innerRef = useRef(null);
  useEffect(() => {
    if (enabled) innerRef.current?.focus();
  }, [enabled]);
  return <button ref={innerRef}>inner</button>;
};

const Host = ({ pathname, innerAutofocus }) => {
  const ref = useRouteChangeFocus(pathname);
  return (
    <div ref={ref} tabIndex={-1} data-testid="main">
      <InnerAutofocus enabled={innerAutofocus} />
    </div>
  );
};

describe('useRouteChangeFocus', () => {
  afterEach(cleanup);

  it('does not move focus on initial mount (a fresh page load is browser-handled)', () => {
    render(<Host pathname="/en" />);
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus to the target element when pathname changes after mount', () => {
    const { rerender, getByTestId } = render(<Host pathname="/en" />);
    rerender(<Host pathname="/en/other" />);
    expect(document.activeElement).toBe(getByTestId('main'));
  });

  it('does not move focus again on a re-render with the same pathname', () => {
    const { rerender, getByTestId } = render(<Host pathname="/en" />);
    rerender(<Host pathname="/en/other" />);
    getByTestId('main').blur();
    rerender(<Host pathname="/en/other" />);
    expect(document.activeElement).not.toBe(getByTestId('main'));
  });

  it('backs off when a child has already moved focus inside the target (e.g. a page-level autofocus)', () => {
    const { rerender, getByRole } = render(<Host pathname="/en" innerAutofocus={false} />);
    rerender(<Host pathname="/en/other" innerAutofocus />);
    expect(document.activeElement).toBe(getByRole('button'));
  });
});
