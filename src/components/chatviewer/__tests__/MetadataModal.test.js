/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import MetadataModal from '../MetadataModal.js';

vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: React.forwardRef(function GcdsButton({ children, onClick }, ref) {
    return (
      <button ref={ref} onClick={onClick}>{children}</button>
    );
  }),
}));

// Prism is deliberately NOT mocked: the highlighted markup the component
// renders is the markup a user actually gets, and the point of these tests is
// that React owns that markup outright rather than letting Prism rewrite it.

const t = (key) => key;
// Stable reference across renders so tests isolate the onClose-identity
// churn from the metadata-changed case, which legitimately re-runs effects.
const metadata = { foo: 'bar' };

describe('MetadataModal', () => {
  afterEach(() => cleanup());

  it('does not re-attach the document keydown listener when only onClose\'s identity changes', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const { rerender } = render(
      <MetadataModal metadata={metadata} onClose={() => {}} t={t} />
    );

    expect(addSpy.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    addSpy.mockClear();
    removeSpy.mockClear();

    // Simulate a parent re-render passing a brand-new onClose function
    // identity (as ChatViewer's inline arrow function does on every render)
    // while metadata itself is unchanged.
    rerender(<MetadataModal metadata={metadata} onClose={() => {}} t={t} />);

    expect(addSpy.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);
    expect(removeSpy.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('still invokes the latest onClose on Escape after an onClose identity change', () => {
    const firstOnClose = vi.fn();
    const secondOnClose = vi.fn();

    const { rerender } = render(
      <MetadataModal metadata={metadata} onClose={firstOnClose} t={t} />
    );

    rerender(<MetadataModal metadata={metadata} onClose={secondOnClose} t={t} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(secondOnClose).toHaveBeenCalledTimes(1);
    expect(firstOnClose).not.toHaveBeenCalled();
  });

  it('re-renders highlighted content when metadata changes, without a DOM conflict', () => {
    // The <code> body is written by Prism, not reconciled by React. Swapping
    // metadata while the modal stays open is what would break if React
    // reconciled children an external highlighter had already replaced.
    const { rerender, container } = render(
      <MetadataModal metadata={{ first: 'value' }} onClose={() => {}} t={t} />
    );

    const code = container.querySelector('code');
    expect(code.textContent).toContain('first');

    rerender(<MetadataModal metadata={{ second: 'other' }} onClose={() => {}} t={t} />);

    const updated = container.querySelector('code');
    expect(updated.textContent).toContain('second');
    expect(updated.textContent).not.toContain('first');
    // Prism ran: JSON keys are tokenized rather than left as bare text.
    expect(updated.querySelector('.token')).toBeTruthy();
  });

  it('escapes markup in metadata rather than injecting it as HTML', () => {
    const { container } = render(
      <MetadataModal
        metadata={{ note: '<img src=x onerror=alert(1)>' }}
        onClose={() => {}}
        t={t}
      />
    );

    const code = container.querySelector('code');
    expect(code.querySelector('img')).toBeNull();
    expect(code.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('keeps the dialog free of extra focusable elements for the Tab trap', () => {
    const { container } = render(
      <MetadataModal metadata={{ foo: 'bar' }} onClose={() => {}} t={t} />
    );

    const dialog = container.querySelector('[role="dialog"]');
    const focusable = dialog.querySelectorAll(
      'button, gcds-button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    // Only the close button — highlighted content must not add tab stops.
    expect(focusable).toHaveLength(1);
  });
});
