import { createRoot } from 'react-dom/client';

// DataTables builds its own <td> elements, so React content inside a cell has
// to be mounted as a separate React root. DataTables re-runs createdRow for a
// row on every draw (sort, page, filter, data refresh), which means the same
// cell gets mounted repeatedly — and calling createRoot on a container that
// already has a root leaks the previous one and makes React warn ("You are
// calling createRoot() on a container that has already been passed to
// createRoot()"). Going through here keeps one live root per cell: the
// previous one is unmounted before a new one replaces it.
//
// Callers render into the returned root themselves, because which element a
// cell shows is usually decided by branching after the root exists.
const ROOT_KEY = '_dataTableCellRoot';

export function getCellRoot(cell) {
  if (!cell) {
    return null;
  }

  if (cell[ROOT_KEY]) {
    try {
      cell[ROOT_KEY].unmount();
    } catch (e) {
      // A root can already be gone if DataTables discarded the cell; nothing
      // left to clean up in that case.
    }
    cell[ROOT_KEY] = null;
  }

  const root = createRoot(cell);
  cell[ROOT_KEY] = root;
  return root;
}
