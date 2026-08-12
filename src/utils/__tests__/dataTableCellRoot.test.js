/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { act } from '@testing-library/react';
import { getCellRoot } from '../dataTableCellRoot.js';

const flush = (fn) => act(() => { fn(); });

describe('getCellRoot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses one root per cell across repeated mounts', () => {
    const cell = document.createElement('td');
    document.body.appendChild(cell);

    // React warns when createRoot is called twice on the same container, so a
    // clean console is the assertion that the previous root was unmounted.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    flush(() => getCellRoot(cell).render(<button>first</button>));
    expect(cell.textContent).toBe('first');

    flush(() => getCellRoot(cell).render(<button>second</button>));
    expect(cell.textContent).toBe('second');

    flush(() => getCellRoot(cell).render(<button>third</button>));
    expect(cell.textContent).toBe('third');

    const containerWarnings = errorSpy.mock.calls.filter(([msg]) =>
      typeof msg === 'string' && msg.includes('already been passed to createRoot')
    );
    expect(containerWarnings).toHaveLength(0);
  });

  it('returns null for a missing cell instead of throwing', () => {
    expect(getCellRoot(null)).toBeNull();
    expect(getCellRoot(undefined)).toBeNull();
  });

  it('clears pre-existing non-React content (e.g. a DataTables placeholder) before the first mount', () => {
    const cell = document.createElement('td');
    cell.innerHTML = '<span>placeholder</span>';
    document.body.appendChild(cell);

    flush(() => getCellRoot(cell).render(<button>rendered</button>));

    expect(cell.textContent).toBe('rendered');
    expect(cell.querySelector('span')).toBeNull();
  });

  it('survives a caller clearing the cell before a later redraw finds an existing root', () => {
    const cell = document.createElement('td');
    document.body.appendChild(cell);

    // React's commit-phase failures aren't synchronously catchable — a
    // failed unmount is reported as an uncaught error via a window 'error'
    // event, not thrown back through the call stack. try/catch around the
    // call site can't detect this; only listening for the event can.
    const onError = vi.fn();
    window.addEventListener('error', onError);

    flush(() => getCellRoot(cell).render(<button>first</button>));

    // Regression scenario for the bug this test guards against: something
    // (DataTables re-parenting, or a caller) clears the cell directly before
    // the next redraw calls getCellRoot() again, instead of going through
    // this module's own unmount path.
    cell.innerHTML = '';

    flush(() => getCellRoot(cell).render(<button>second</button>));

    expect(cell.textContent).toBe('second');
    expect(onError).not.toHaveBeenCalled();

    window.removeEventListener('error', onError);
  });

  it('survives a cell whose root was already unmounted elsewhere', () => {
    const cell = document.createElement('td');
    document.body.appendChild(cell);

    const root = getCellRoot(cell);
    flush(() => root.render(<button>first</button>));
    flush(() => root.unmount());

    // Should not throw on the double unmount inside getCellRoot.
    flush(() => getCellRoot(cell).render(<button>second</button>));
    expect(cell.textContent).toBe('second');
  });
});
