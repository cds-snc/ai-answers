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

vi.mock('prismjs', () => ({
  default: { highlightElement: vi.fn() },
}));

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
});
