/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import ServerDataTable from '../ServerDataTable.js';

// Mimics real DataTables closely enough to exercise ServerDataTable's own
// wiring: captures the `options` it's given and, like the real
// datatables.net-react component, invokes `options.initComplete` (bound to
// an object exposing `.api()`) once "initialized" — this is what lets
// ServerDataTable's initComplete callback capture a live table API instance.
// `fireInitComplete` is controlled per-test so the pre-init window (ref
// exists, but the underlying table API doesn't yet) can be exercised too.
let lastOptions = null;
let fireInitComplete = true;
const mockAjaxReload = vi.fn();

vi.mock('datatables.net-react', () => {
  const MockDataTable = (props) => {
    lastOptions = props.options;
    if (fireInitComplete) {
      // Real DataTables calls initComplete with `this` bound to its
      // internal settings object, which exposes the actual API via a
      // `.api()` method — not the API object itself.
      const settings = { api: () => ({ ajax: { reload: mockAjaxReload } }) };
      props.options?.initComplete?.call(settings);
    }
    return React.createElement('div', { 'data-testid': 'mock-data-table' });
  };
  MockDataTable.use = vi.fn();
  return { default: MockDataTable };
});

vi.mock('datatables.net-dt', () => ({ default: () => null }));

describe('ServerDataTable', () => {
  afterEach(() => {
    cleanup();
    lastOptions = null;
    fireInitComplete = true;
    mockAjaxReload.mockClear();
  });

  it('reload() calls the underlying DataTables API without resetting paging', () => {
    const ref = React.createRef();
    render(
      React.createElement(ServerDataTable, {
        ref,
        columns: [{ data: 'name' }],
        fetchData: vi.fn(),
        tableKey: 'test-table',
      })
    );

    expect(ref.current.reload).toBeTypeOf('function');
    ref.current.reload();

    // `false` (second arg) preserves the current page instead of resetting
    // to page 1 — this is the whole point of reload() over a tableKey bump.
    expect(mockAjaxReload).toHaveBeenCalledWith(null, false);
  });

  it('reload() is a safe no-op before the table has finished initializing', () => {
    // A caller can hold a ref before the DataTables API instance exists yet
    // (e.g. a save that resolves before the table's own async init fires) —
    // useImperativeHandle exposes reload() immediately, but the underlying
    // tableApiRef is only populated once initComplete has actually run.
    fireInitComplete = false;
    const ref = React.createRef();
    render(
      React.createElement(ServerDataTable, {
        ref,
        columns: [{ data: 'name' }],
        fetchData: vi.fn(),
        tableKey: 'test-table',
      })
    );

    expect(() => ref.current.reload()).not.toThrow();
    expect(mockAjaxReload).not.toHaveBeenCalled();
  });

  it('renders an sr-only search label and a placeholder when asked', () => {
    render(
      <ServerDataTable
        tableKey="t"
        columns={[{ title: 'A', data: 'a' }]}
        fetchData={vi.fn().mockResolvedValue({ data: [] })}
        searchLabelSrOnly="Filter <things>"
        searchPlaceholder="Filter"
      />
    );
    expect(lastOptions.language.search).toBe('<span class="sr-only">Filter &lt;things&gt;</span>');
    expect(lastOptions.language.searchPlaceholder).toBe('Filter');
  });

  it('passes ordering/pageLength/lengthChange/layout through to DataTables options', () => {
    render(
      React.createElement(ServerDataTable, {
        columns: [{ data: 'name' }],
        fetchData: vi.fn(),
        tableKey: 'test-table',
        ordering: false,
        pageLength: 10,
        lengthChange: false,
        layout: { topStart: 'search', topEnd: null },
      })
    );

    expect(lastOptions.ordering).toBe(false);
    expect(lastOptions.pageLength).toBe(10);
    expect(lastOptions.lengthChange).toBe(false);
    // The component always turns off the first/last paging buttons (GC DS
    // pagination has none); a caller's own slots merge on top.
    expect(lastOptions.layout).toEqual({ bottomEnd: { paging: { firstLast: false } }, topStart: 'search', topEnd: null });
  });
});
