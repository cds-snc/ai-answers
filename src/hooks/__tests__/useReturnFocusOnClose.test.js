/**
 * @vitest-environment jsdom
 */
import React, { useEffect, useRef } from 'react';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';
import { useReturnFocusOnClose } from '../useReturnFocusOnClose.js';

// Stands in for a GcdsButton drawn in the same commit as the close: focus()
// does nothing until it has rendered, a couple of frames later.
const LateButton = React.forwardRef((props, ref) => {
  const innerRef = useRef(null);
  useEffect(() => {
    const el = innerRef.current;
    const realFocus = el.focus.bind(el);
    let ready = false;
    el.focus = () => { if (ready) realFocus(); };
    requestAnimationFrame(() => requestAnimationFrame(() => { ready = true; }));
  }, []);
  return <button ref={(el) => { innerRef.current = el; if (ref) ref.current = el; }}>Edit</button>;
});

// Like ExpertFeedbackPanel: the button is re-created when the panel closes.
const Host = ({ open }) => {
  const buttonRef = useRef(null);
  useReturnFocusOnClose(open, buttonRef);
  return open ? <p>Form</p> : <LateButton ref={buttonRef} />;
};

describe('useReturnFocusOnClose', () => {
  afterEach(cleanup);

  it('does not move focus on first mount', () => {
    render(<Host open={false} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('focuses a target re-created by the close once it can take focus', async () => {
    const { rerender } = render(<Host open />);
    rerender(<Host open={false} />);

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit' })));
  });

  it('stops retrying once the user has moved focus elsewhere', async () => {
    const { rerender } = render(
      <>
        <Host open />
        <input aria-label="Other" />
      </>
    );
    rerender(
      <>
        <Host open={false} />
        <input aria-label="Other" />
      </>
    );
    const other = screen.getByRole('textbox', { name: 'Other' });
    other.focus();

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(document.activeElement).toBe(other);
  });
});
