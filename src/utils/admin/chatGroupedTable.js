// Chat grouping for the dashboard DataTables (Chat, Eval, AutoEval). Rows
// are question/answer pairs; a multi-turn chat spans consecutive rows with
// the same chatId (the backends' sort tiebreaker keeps them adjacent under
// any column sort). The callbacks make those rows read as one group:
//
//   createdRow   - stripe by chat group (chat-group-a/b, chat-group-start)
//   drawCallback - keep-chat-together cells for `groupedColumns`: the value
//                  shows once on the group's first row; the cells below keep
//                  it as sr-only text, with inter-row borders removed (CSS)
//
// Kept cells + sr-only rather than rowSpan: both are valid, but a rowSpan
// removes the duplicate <td>s and relies on each screen reader/reading
// mode to carry the value to rows 2+; a cell per row is reliable
// everywhere. Cost: the value sits on the first row, not vertically centred.
// Groups are recomputed from scratch every draw (serverSide rebuilds rows).

const GROUP_CELL = 'group-cell';
const GROUP_CELL_START = 'group-cell--start';
const GROUP_CELL_MID = 'group-cell--mid';
const GROUP_CELL_END = 'group-cell--end';

/**
 * Fresh striping state - hold one in a ref and pass it as `stateRef`.
 * @returns {{ lastChatId: undefined|string, parity: 0|1 }}
 */
export function createChatGroupState() {
  return { lastChatId: undefined, parity: 0 };
}

/**
 * Builds the DataTables `preDrawCallback` / `createdRow` / `drawCallback`
 * trio for a chat-grouped table. Spread the result into the table's
 * options object.
 *
 * @param {object} config
 * @param {{ current: object }} config.stateRef - ref holding createChatGroupState()
 * @param {Array<{ data: string }>} config.columns - the table's column definitions, in order
 * @param {Array<{ data: string, boundByChatId?: boolean, mergeEmpty?: boolean, extraClass?: string }>} config.groupedColumns
 *   Columns whose repeated values collapse across a chat's consecutive rows.
 *   `boundByChatId` (default true) additionally requires the rows to share a
 *   chatId, so two unrelated chats that happen to share a department never
 *   merge - only the chatId column itself should set it false. `mergeEmpty`
 *   (default false) also merges consecutive EMPTY values: normally several
 *   blank cells in a row aren't worth boxing together, but a column whose
 *   render shows a placeholder for empty (Referring URL's "None") repeats
 *   that placeholder down every row of the chat otherwise. `extraClass`
 *   is added to every cell of that column, grouped or not (the Chat ID
 *   column uses it so CSS can target that column without relying on
 *   position).
 * @returns {{ preDrawCallback: function, createdRow: function, drawCallback: function }}
 */
export function buildChatGroupCallbacks({ stateRef, columns, groupedColumns }) {
  const preDrawCallback = function () {
    stateRef.current = createChatGroupState();
  };

  const createdRow = function (row, data) {
    const state = stateRef.current;
    const chatId = data && data.chatId;
    const isFirstRowOfPage = state.lastChatId === undefined;
    if (chatId !== state.lastChatId) {
      if (!isFirstRowOfPage) {
        state.parity = state.parity === 0 ? 1 : 0;
        row.classList.add('chat-group-start');
      }
      state.lastChatId = chatId;
    }
    row.classList.add(state.parity === 0 ? 'chat-group-a' : 'chat-group-b');
  };

  const collapseColumn = (api, rowData, { data, boundByChatId = true, mergeEmpty = false, extraClass }) => {
    const colIndex = columns.findIndex((c) => c.data === data);
    if (colIndex === -1) return;
    // Cells via the API, not rowNode.cells[colIndex]: DataTables detaches
    // the <td>s of hidden (visible: false) columns, which would shift a
    // DOM-index lookup onto the wrong column.
    const cellNodes = api.column(colIndex, { page: 'current', order: 'current' }).nodes().toArray();
    const valueOf = (r) => {
      const v = r && r[data];
      return mergeEmpty && (v === undefined || v === null) ? '' : v;
    };
    const canMerge = (r) => mergeEmpty || Boolean(valueOf(r));
    if (extraClass) cellNodes.forEach((cell) => cell && cell.classList.add(extraClass));
    let i = 0;
    while (i < rowData.length) {
      let span = 1;
      while (
        i + span < rowData.length &&
        // Merging on an empty value (several consecutive blank cells)
        // doesn't convey anything - just a divider-bordered box around
        // nothing - unless the column opts in via mergeEmpty.
        canMerge(rowData[i]) &&
        valueOf(rowData[i + span]) === valueOf(rowData[i]) &&
        (!boundByChatId || rowData[i + span].chatId === rowData[i].chatId)
      ) {
        span += 1;
      }
      const firstCell = cellNodes[i];
      if (firstCell && span > 1) {
        firstCell.classList.add(GROUP_CELL, GROUP_CELL_START);
        // Repeated cells keep the rendered text for screen readers only.
        for (let j = i + 1; j < i + span; j += 1) {
          const cell = cellNodes[j];
          if (!cell) continue;
          const srText = document.createElement('span');
          srText.className = 'sr-only';
          srText.textContent = (cell.textContent || '').trim();
          cell.replaceChildren(srText);
          cell.classList.add(GROUP_CELL, j === i + span - 1 ? GROUP_CELL_END : GROUP_CELL_MID);
        }
      }
      i += span;
    }
  };

  const drawCallback = function () {
    try {
      const api = this.api();
      const rowData = api.rows({ page: 'current', order: 'current' }).data().toArray();

      groupedColumns.forEach((groupedColumn) => collapseColumn(api, rowData, groupedColumn));
    } catch (e) { /* grouping must never break the table itself */ }
  };

  return { preDrawCallback, createdRow, drawCallback };
}
