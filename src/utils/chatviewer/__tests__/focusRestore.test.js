/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { captureTableFocus, restoreTableFocus } from '../focusRestore.js';

// Builds a <table> with one row per entry in `keys`, each carrying the
// given data-log-key and an "Expand" button in its metadata cell — mirrors
// the shape useChatLogsTable produces via DataTables' createdRow/render.
function buildTable(keys) {
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  keys.forEach((key) => {
    const row = document.createElement('tr');
    row.dataset.logKey = key;
    const metadataCell = document.createElement('td');
    const expandButton = document.createElement('button');
    expandButton.className = 'expand-button';
    expandButton.textContent = 'Expand';
    metadataCell.appendChild(expandButton);
    row.appendChild(document.createElement('td')); // createdAt
    row.appendChild(document.createElement('td')); // level
    row.appendChild(document.createElement('td')); // message
    row.appendChild(metadataCell); // metadata (index 3)
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  document.body.appendChild(table);
  return table;
}

describe('captureTableFocus', () => {
  it('returns null when nothing inside the container is focused', () => {
    const table = buildTable(['a']);
    expect(captureTableFocus(table)).toBeNull();
  });

  it('returns null when the focused element is outside the container', () => {
    const table = buildTable(['a']);
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    expect(captureTableFocus(table)).toBeNull();
  });

  it("captures the row's log key and marks an expand button as such", () => {
    const table = buildTable(['row-a', 'row-b']);
    const expandButton = table.querySelectorAll('.expand-button')[1];
    expandButton.focus();

    expect(captureTableFocus(table)).toEqual({
      logKey: 'row-b',
      cellIndex: 3,
      isExpandButton: true,
    });
  });
});

describe('restoreTableFocus', () => {
  it('does nothing when focusRestore is null', () => {
    const table = buildTable(['a']);
    expect(() => restoreTableFocus(table, null)).not.toThrow();
    expect(document.activeElement).not.toBe(table.querySelector('.expand-button'));
  });

  it('finds the same log entry by key even after rows are reordered/rebuilt, ignoring stale position', () => {
    // Simulates the exact regression: the row the user had focused
    // (row-b) is captured at position 1, but by the time focus is
    // restored the table has been rebuilt with new entries sorted
    // newest-first, pushing row-b to position 2.
    let table = buildTable(['row-a', 'row-b']);
    const focusRestore = captureTableFocus(table); // nothing focused yet
    table.querySelectorAll('.expand-button')[1].focus();
    const captured = captureTableFocus(table);
    expect(captured.logKey).toBe('row-b');

    // Tear down and rebuild with row-b no longer at index 1.
    document.body.removeChild(table);
    table = buildTable(['row-c', 'row-a', 'row-b']);

    restoreTableFocus(table, captured);

    expect(document.activeElement).toBe(table.querySelectorAll('.expand-button')[2]);
    expect(focusRestore).toBeNull(); // sanity: first capture had nothing focused
  });

  it('falls back to the container when the captured row no longer exists (e.g. zero logs after refresh)', () => {
    let table = buildTable(['row-a', 'row-b']);
    table.querySelectorAll('.expand-button')[0].focus();
    const captured = captureTableFocus(table);

    document.body.removeChild(table);
    table = buildTable([]); // rebuilt empty, e.g. DataTables' emptyTable state
    table.setAttribute('tabindex', '-1');

    restoreTableFocus(table, captured);

    expect(document.activeElement).toBe(table);
  });

  it('falls back to the container when the row exists but has no expand button focused originally', () => {
    const table = buildTable(['row-a']);
    const focusRestore = { logKey: 'row-a', cellIndex: 0, isExpandButton: false };
    table.setAttribute('tabindex', '-1');

    restoreTableFocus(table, focusRestore);

    // cellIndex 0 (createdAt) has no tabbable content, so target falls
    // through to the table itself.
    expect(document.activeElement).toBe(table);
  });
});
