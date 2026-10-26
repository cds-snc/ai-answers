/**
 * DataTables has no in-place update path for the chat logs table — every
 * refresh tears the whole table down and rebuilds it, which silently drops
 * focus to <body> if the user had something inside it focused (e.g. a row's
 * metadata "Show N more values" <summary> toggle). These two functions
 * capture where focus was beforehand and restore it to the equivalent spot
 * afterwards.
 *
 * Rows are located by a stable `data-log-key` attribute rather than DOM
 * position: sorting (newest-first) and paging reorder rows on every
 * rebuild, so an index captured before a rebuild doesn't reliably point at
 * the same log entry after it.
 */

/**
 * Captures enough information about the currently focused element within
 * `container` (if any) to relocate an equivalent element after the
 * container's rows are torn down and rebuilt. Returns null when nothing
 * inside `container` is focused.
 */
export function captureTableFocus(container) {
  const activeEl = document.activeElement;
  if (!container || !activeEl || !container.contains(activeEl)) {
    return null;
  }

  const row = activeEl.closest('tr');
  const cell = activeEl.closest('td');

  return {
    logKey: row?.dataset.logKey ?? null,
    cellIndex: cell ? Array.from(cell.parentNode.children).indexOf(cell) : -1,
    // A <summary> is natively focusable with no tabindex attribute of its
    // own, unlike the [tabindex="0"] fallback below - needs its own check.
    isMetadataSummary: activeEl.matches('.metadata-more > summary'),
  };
}

/**
 * Restores focus captured by `captureTableFocus`. Falls back to `container`
 * itself when the original row/cell can no longer be found (e.g. the row no
 * longer exists, or there are no rows at all) — callers should make
 * `container` focusable (tabindex="-1") so this fallback is always a valid
 * landing spot rather than silently losing focus to <body>. Does nothing if
 * `focusRestore` is null (nothing was focused to begin with).
 */
export function restoreTableFocus(container, focusRestore) {
  if (!container || !focusRestore) {
    return;
  }

  const targetRow = focusRestore.logKey
    ? Array.from(container.querySelectorAll('tbody tr')).find(
        (row) => row.dataset.logKey === focusRestore.logKey
      )
    : null;
  const targetCell = targetRow?.children?.[focusRestore.cellIndex];
  const target =
    (focusRestore.isMetadataSummary && targetCell?.querySelector('.metadata-more > summary')) ||
    targetCell?.querySelector('[tabindex="0"]') ||
    container;

  target.focus();
}
