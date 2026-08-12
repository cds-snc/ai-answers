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
// The root is mounted on a wrapper <div> this function creates inside the
// cell, not on the cell itself. That's deliberate: if a caller (or some other
// code) clears the cell's contents directly (e.g. `cell.innerHTML = ''`)
// before the next redraw, that only detaches the wrapper from the cell — the
// wrapper keeps its own children, since clearing a node's innerHTML doesn't
// touch the parent/child relationships within the subtree it removes. So
// unmount() below, which operates relative to the wrapper, still finds the
// nodes it expects and succeeds instead of throwing "the node to be removed
// is not a child of this node". Mounting straight on the cell doesn't have
// that property — DataTables (or a caller) clearing the cell removes the
// exact nodes the root's fiber tree expects to still be there.
//
// Callers render into the returned root themselves, because which element a
// cell shows is usually decided by branching after the root exists.
const ROOT_KEY = '_dataTableCellRoot';

export function getCellRoot(cell) {
  if (!cell) {
    return null;
  }

  const prior = cell[ROOT_KEY];
  if (prior) {
    try {
      prior.unmount();
    } catch (e) {
      // A root can already be gone if DataTables discarded the cell; nothing
      // left to clean up in that case.
    }
    cell[ROOT_KEY] = null;
  }

  // Always rebuild the cell around a fresh wrapper. This is unconditional
  // (not just "when there was no prior root") because the prior root's
  // wrapper may already be detached from the cell by the time we get here —
  // unmount() above cleaned it up regardless, so nothing of the old content
  // is left behind either way.
  cell.innerHTML = '';
  const wrapper = document.createElement('div');
  cell.appendChild(wrapper);

  const root = createRoot(wrapper);
  cell[ROOT_KEY] = root;
  return root;
}
