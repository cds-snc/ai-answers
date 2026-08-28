/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { buildChatGroupCallbacks, createChatGroupState } from '../chatGroupedTable.js';

const columns = [
  { data: 'chatId' },
  { data: 'questionNumber' },
  { data: 'department' },
  { data: 'question' },
];

// Builds a real <table> from row data the way DataTables would (one <td>
// per column, in column order) and a minimal fake of the DataTables API the
// callbacks read from.
function renderTable(rows, { headers = columns.map((c) => c.data) } = {}) {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const headerEls = headers.map((text) => {
    const th = document.createElement('th');
    th.classList.add('dt-orderable-asc');
    const title = document.createElement('span');
    title.className = 'dt-column-title';
    title.textContent = text;
    const order = document.createElement('span');
    order.className = 'dt-column-order';
    th.append(title, order);
    headerRow.appendChild(th);
    return th;
  });
  thead.appendChild(headerRow);
  const tbody = document.createElement('tbody');
  const rowEls = rows.map((row) => {
    const tr = document.createElement('tr');
    columns.forEach((c) => {
      const td = document.createElement('td');
      if (c.data === 'chatId') {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = row[c.data] || '';
        td.appendChild(a);
      } else {
        td.textContent = row[c.data] == null ? '' : String(row[c.data]);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
    return tr;
  });
  table.append(thead, tbody);
  const api = {
    rows: () => ({ nodes: () => rowEls, data: () => ({ toArray: () => rows }) }),
    column: (idx) => ({ nodes: () => ({ toArray: () => rowEls.map((tr) => tr.cells[idx]) }) }),
    columns: () => ({ header: () => ({ each: (fn) => headerEls.forEach((h, i) => fn(h, i)) }) }),
  };
  return { table, rowEls, headerEls, api };
}

function build(overrides = {}) {
  const stateRef = { current: createChatGroupState() };
  return {
    stateRef,
    ...buildChatGroupCallbacks({
      stateRef,
      columns,
      groupedColumns: [
        { data: 'department' },
        { data: 'chatId', boundByChatId: false, extraClass: 'chat-id-cell' },
      ],
      ...overrides,
    }),
  };
}

const rows = [
  { chatId: 'abc', questionNumber: 1, department: 'ESDC', question: 'q1' },
  { chatId: 'abc', questionNumber: 2, department: 'ESDC', question: 'q2' },
  { chatId: 'abc', questionNumber: 3, department: 'ESDC', question: 'q3' },
  { chatId: 'xyz', questionNumber: 1, department: 'ESDC', question: 'q4' },
];

function draw(callbacks, data) {
  const rendered = renderTable(data);
  callbacks.preDrawCallback();
  rendered.rowEls.forEach((tr, i) => callbacks.createdRow(tr, data[i]));
  callbacks.drawCallback.call({ api: () => rendered.api });
  return rendered;
}

describe('buildChatGroupCallbacks', () => {
  it('stripes rows by chat group, alternating only when the chatId changes', () => {
    const { rowEls } = draw(build(), rows);
    expect(rowEls.map((r) => r.className)).toEqual([
      'chat-group-a',
      'chat-group-a',
      'chat-group-a',
      'chat-group-start chat-group-b',
    ]);
  });

  it('keeps every cell in the DOM - no rowSpan, no removed cells', () => {
    const { rowEls } = draw(build(), rows);
    rowEls.forEach((tr) => {
      expect(tr.cells.length).toBe(columns.length);
      Array.from(tr.cells).forEach((td) => expect(td.rowSpan).toBe(1));
    });
  });

  it('shows a repeated value once visually and keeps it as sr-only text on every following row', () => {
    const { rowEls } = draw(build(), rows);
    const chatCells = rowEls.map((tr) => tr.cells[0]);
    // First row of the group keeps its real (link) content.
    expect(chatCells[0].querySelector('a')).not.toBeNull();
    expect(chatCells[0].classList.contains('group-cell--start')).toBe(true);
    // Rows 2 and 3: value present for AT, visually hidden, no link.
    [1, 2].forEach((i) => {
      expect(chatCells[i].querySelector('a')).toBeNull();
      const sr = chatCells[i].querySelector('.sr-only');
      expect(sr).not.toBeNull();
      expect(sr.textContent).toBe('abc');
      expect(chatCells[i].textContent).toBe('abc');
    });
    expect(chatCells[1].classList.contains('group-cell--mid')).toBe(true);
    expect(chatCells[2].classList.contains('group-cell--end')).toBe(true);
    // A single-row group is left as an ordinary cell.
    expect(chatCells[3].classList.contains('group-cell')).toBe(false);
    expect(chatCells[3].querySelector('a')).not.toBeNull();
  });

  it('adds extraClass to every cell of that column, grouped or not', () => {
    const { rowEls } = draw(build(), rows);
    rowEls.forEach((tr) => expect(tr.cells[0].classList.contains('chat-id-cell')).toBe(true));
    rowEls.forEach((tr) => expect(tr.cells[2].classList.contains('chat-id-cell')).toBe(false));
  });

  it('never merges a boundByChatId column across two different chats sharing the value', () => {
    const { rowEls } = draw(build(), rows);
    const deptCells = rowEls.map((tr) => tr.cells[2]);
    // abc's three rows merge...
    expect(deptCells[0].classList.contains('group-cell--start')).toBe(true);
    expect(deptCells[2].classList.contains('group-cell--end')).toBe(true);
    // ...but xyz (same department) starts fresh with its real text visible.
    expect(deptCells[3].classList.contains('group-cell')).toBe(false);
    expect(deptCells[3].querySelector('.sr-only')).toBeNull();
    expect(deptCells[3].textContent).toBe('ESDC');
  });

  it('does not merge on empty values', () => {
    const data = [
      { chatId: 'abc', questionNumber: 1, department: '', question: 'q1' },
      { chatId: 'abc', questionNumber: 2, department: '', question: 'q2' },
    ];
    const { rowEls } = draw(build(), data);
    rowEls.forEach((tr) => expect(tr.cells[2].classList.contains('group-cell')).toBe(false));
  });

  it('merges consecutive empty values within a chat when the column opts in via mergeEmpty', () => {
    const data = [
      { chatId: 'abc', questionNumber: 1, department: null, question: 'q1' },
      { chatId: 'abc', questionNumber: 2, department: undefined, question: 'q2' },
      { chatId: 'abc', questionNumber: 3, department: '', question: 'q3' },
      { chatId: 'xyz', questionNumber: 1, department: '', question: 'q4' },
    ];
    const rendered = renderTable(data);
    // Mimic a render function that shows a placeholder for empty.
    rendered.rowEls.forEach((tr) => { if (!tr.cells[2].textContent) tr.cells[2].textContent = 'None'; });
    const callbacks = build({ groupedColumns: [{ data: 'department', mergeEmpty: true }] });
    callbacks.preDrawCallback();
    rendered.rowEls.forEach((tr, i) => callbacks.createdRow(tr, data[i]));
    callbacks.drawCallback.call({ api: () => rendered.api });
    const cells = rendered.rowEls.map((tr) => tr.cells[2]);
    expect(cells[0].classList.contains('group-cell--start')).toBe(true);
    expect(cells[0].textContent).toBe('None');
    expect(cells[1].querySelector('.sr-only').textContent).toBe('None');
    expect(cells[2].classList.contains('group-cell--end')).toBe(true);
    // Still never crosses a chat boundary.
    expect(cells[3].classList.contains('group-cell')).toBe(false);
  });

});
