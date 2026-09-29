/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import ChatDashboardPage from '../ChatDashboardPage.js';
import DashboardService from '../../services/DashboardService.js';

// Mock dependencies
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key) => key
  })
}));

vi.mock('../../services/DashboardService.js', () => ({
  default: {
    getChatDashboard: vi.fn(() => Promise.resolve({
      recordsTotal: 0,
      recordsFiltered: 0,
      data: []
    })),
    assignQuestion: vi.fn(() => Promise.resolve({})),
    unassignQuestion: vi.fn(() => Promise.resolve({}))
  }
}));

const { mockGetAssignable, mockAuth } = vi.hoisted(() => ({
  mockGetAssignable: vi.fn(),
  mockAuth: { currentUser: { role: 'partner' } }
}));
vi.mock('../../services/UserService.js', () => ({ default: { getAssignable: mockGetAssignable } }));
vi.mock('../../contexts/AuthContext.js', () => ({ useAuth: () => ({ currentUser: mockAuth.currentUser }) }));

// A closer-to-real DataTables mock than a plain `() => null`: captures the
// `options` given to the most recently rendered instance (so a test can call
// its `ajax` directly, the way the real DataTables library would in response
// to a search/page/sort), and - once per actual mount, guarded by refs since
// ChatDashboardPage re-renders the same instance many times without
// remounting - invokes `initComplete` the way real DataTables does, bound to
// a fake settings object exposing `.api()`. Each mounted instance gets its
// own `ajaxReload` spy pushed to `mountedInstances`, so a test can assert
// that a *specific* (e.g. outgoing, pre-Clear) instance's ajax.reload was or
// wasn't called - the whole point of the regression test below.
let lastOptions = null;
let lastColumns = null;
let mountedInstances = [];
vi.mock('datatables.net-react', () => {
  const MockDataTable = (props) => {
    lastOptions = props.options;
    lastColumns = props.columns;
    const apiRef = React.useRef(null);
    const firedRef = React.useRef(false);
    if (!apiRef.current) {
      apiRef.current = {
        ajaxReload: vi.fn(),
        columnVisible: vi.fn(),
        headerCells: [{ setAttribute: vi.fn() }, { setAttribute: vi.fn() }],
        // A real <tbody>: the page wires the assign checkboxes/pills by
        // delegation on it, so tests append rows here and fire events.
        body: document.createElement('tbody'),
        handlers: {}
      };
      mountedInstances.push(apiRef.current);
    }
    if (!firedRef.current) {
      firedRef.current = true;
      const headerCells = apiRef.current.headerCells;
      const settings = {
        api: () => ({
          ajax: { reload: apiRef.current.ajaxReload },
          column: () => ({ visible: apiRef.current.columnVisible }),
          columns: () => ({ header: () => ({ each: (fn) => headerCells.forEach(fn) }) }),
          table: () => ({ container: () => ({ querySelector: () => null }), body: () => apiRef.current.body }),
          search: () => '',
          on: (evt, fn) => { apiRef.current.handlers[evt] = fn; }
        })
      };
      props.options?.initComplete?.call(settings);
    }
    return React.createElement('div', { 'data-testid': 'mock-data-table' });
  };
  MockDataTable.use = vi.fn();
  return {
    default: MockDataTable
  };
});

vi.mock('datatables.net-dt', () => ({
  default: () => null
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsIcon: () => <span aria-hidden="true" />,
  GcdsButton: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>
}));

describe('ChatDashboardPage rendering', () => {
  afterEach(() => {
    mockAuth.currentUser = { role: 'partner' };
    cleanup();
    lastColumns = null;
    lastOptions = null;
    mountedInstances = [];
    mockGetAssignable.mockReset();
  });

  it('renders without crashing', async () => {
    const { getByText } = render(<ChatDashboardPage lang="en" />);

    await waitFor(() => {
      expect(getByText('admin.chatDashboard.title')).toBeTruthy();
    });
  });

  it('hides (but keeps mounted) the Assign chats toggle when there are no results', async () => {
    const { container, queryByText } = render(<ChatDashboardPage lang="en" />);

    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => { fireEvent.click(applyButton); });
    await waitFor(() => expect(lastOptions).not.toBeNull());
    // Default mock resolves recordsTotal: 0.
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });

    // Hidden rather than unmounted: a remount with open already true fires
    // a toggle event with no click (see the details' comment in the page).
    const details = queryByText('admin.chatDashboard.assign.toggleOn').closest('details');
    expect(details.hidden).toBe(true);
  });

  // Renders the page with the given assignable users, applies filters, feeds
  // the table one result and opens Assign chats - the steps before the
  // reviewer picker exists. Resolves once `waitForEmail` shows in the picker.
  const openReviewerPicker = async (users, waitForEmail) => {
    mockGetAssignable.mockResolvedValue({ users });
    DashboardService.getChatDashboard.mockResolvedValueOnce({ recordsTotal: 1, recordsFiltered: 1, data: [] });
    const { container, getByText, queryByText } = render(<ChatDashboardPage lang="en" />);
    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => { fireEvent.click(applyButton); });
    await waitFor(() => expect(lastOptions).not.toBeNull());
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await act(async () => { fireEvent.click(getByText('admin.chatDashboard.assign.toggleOn')); });
    await waitFor(() => expect(getByText(waitForEmail)).toBeTruthy());
    const groups = Array.from(container.querySelectorAll('#chat-assign-expert optgroup'));
    return { groups, queryByText };
  };

  it('groups the reviewer picker as self-assign, your group, your institution - native optgroups', async () => {
    const { groups } = await openReviewerPicker([
      { id: 'u1', email: 'me@x.ca', relation: 'self' },
      { id: 'u2', email: 'mate@x.ca', relation: 'group' },
      { id: 'u3', email: 'dept@x.ca', relation: 'institution' }
    ], 'mate@x.ca');
    expect(groups.map((g) => g.label)).toEqual([
      'admin.chatDashboard.assign.pickerSelf',
      'admin.chatDashboard.assign.pickerGroup',
      'admin.chatDashboard.assign.pickerInstitution'
    ]);
    expect(groups.map((g) => g.querySelector('option').textContent)).toEqual(['me@x.ca', 'mate@x.ca', 'dept@x.ca']);
  });

  it('puts the QA group after your institution, headed by the group name', async () => {
    const { groups } = await openReviewerPicker([
      { id: 'u1', email: 'me@x.ca', relation: 'self' },
      { id: 'u3', email: 'dept@x.ca', relation: 'institution' },
      { id: 'u5', email: 'qa@x.ca', relation: 'qa' }
    ], 'qa@x.ca');
    expect(groups.map((g) => g.label)).toEqual([
      'admin.chatDashboard.assign.pickerSelf',
      'admin.chatDashboard.assign.pickerInstitution',
      'AI Answers QA'
    ]);
    expect(groups[2].querySelector('option').textContent).toBe('qa@x.ca');
  });

  it('admin: a reviewer with a missing or unrecognised relation lands under Other accounts instead of vanishing', async () => {
    mockAuth.currentUser = { role: 'admin' };
    const { groups } = await openReviewerPicker([
      { id: 'u1', email: 'me@x.ca', relation: 'self' },
      { id: 'u2', email: 'untagged@x.ca' },
      { id: 'u3', email: 'newkind@x.ca', relation: 'reviewer' },
      { id: 'u4', email: 'other@x.ca', relation: 'other' }
    ], 'untagged@x.ca');

    expect(groups.map((g) => g.label)).toEqual([
      'admin.chatDashboard.assign.pickerSelf',
      'admin.chatDashboard.assign.pickerOthers'
    ]);
    expect(Array.from(groups[1].querySelectorAll('option')).map((o) => o.textContent))
      .toEqual(['untagged@x.ca', 'newkind@x.ca', 'other@x.ca']);
  });

  it('partner: a reviewer with an unrecognised relation is not shown - the list never widens past their scope', async () => {
    const { groups, queryByText } = await openReviewerPicker([
      { id: 'u1', email: 'me@x.ca', relation: 'self' },
      { id: 'u2', email: 'untagged@x.ca' }
    ], 'me@x.ca');

    expect(groups.map((g) => g.label)).toEqual(['admin.chatDashboard.assign.pickerSelf']);
    expect(queryByText('untagged@x.ca')).toBeNull();
  });

  it('assign mode shows the (always-present, hidden) checkbox column without rebuilding the table, and loads the assignable dropdown', async () => {
    mockGetAssignable.mockResolvedValue({ users: [{ id: 'u1', email: 'partner@x.ca', relation: 'self' }] });
    // The Assign chats toggle only appears once the table actually has
    // results - simulate the real DataTables ajax callback firing with one.
    DashboardService.getChatDashboard.mockResolvedValueOnce({ recordsTotal: 1, recordsFiltered: 1, data: [] });
    const { container, getByText } = render(<ChatDashboardPage lang="en" />);

    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => { fireEvent.click(applyButton); });
    await waitFor(() => expect(lastColumns).not.toBeNull());
    // The column is always defined, hidden until assign mode is on.
    expect(lastColumns.find((c) => c.className === 'chat-assign-checkbox-col').visible).toBe(false);
    const instancesBeforeToggle = mountedInstances.length;

    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });

    await act(async () => { fireEvent.click(getByText('admin.chatDashboard.assign.toggleOn')); });

    await waitFor(() => expect(mockGetAssignable).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByText('partner@x.ca')).toBeTruthy());
    // Shown in place through the API - no table remount, no refetch.
    expect(mountedInstances.length).toBe(instancesBeforeToggle);
    expect(mountedInstances[mountedInstances.length - 1].columnVisible).toHaveBeenCalledWith(true);

    // The GC DS checkbox's visible box/checkmark is drawn on the <label>'s
    // own ::before - putting sr-only on the label itself (rather than a
    // span inside it) clips that pseudo-element away too, making the
    // checkbox invisible. Regression coverage for that exact bug.
    const checkboxColumn = lastColumns.find((c) => c.className === 'chat-assign-checkbox-col');
    const html = checkboxColumn.render(null, 'display', { _id: 'q-123', chatId: 'chat-123', questionNumber: 1 });
    expect(html).toContain('class="gc-chckbxrdio sm"');
    expect(html).toMatch(/<label for="[^"]+"><span class="sr-only">/);
    expect(html).not.toMatch(/<label[^>]*class="sr-only"/);
  });

  it('shows an assignee pill with a remove button instead of a checkbox, for an already-assigned chat', async () => {
    mockGetAssignable.mockResolvedValue({ users: [] });
    DashboardService.getChatDashboard.mockResolvedValueOnce({ recordsTotal: 1, recordsFiltered: 1, data: [] });
    const { container, getByText } = render(<ChatDashboardPage lang="en" />);

    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => { fireEvent.click(applyButton); });
    await waitFor(() => expect(lastOptions).not.toBeNull());
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await act(async () => { fireEvent.click(getByText('admin.chatDashboard.assign.toggleOn')); });
    await waitFor(() => expect(lastColumns.some((c) => c.className === 'chat-assign-checkbox-col')).toBe(true));

    const checkboxColumn = lastColumns.find((c) => c.className === 'chat-assign-checkbox-col');
    const html = checkboxColumn.render(null, 'display', { _id: 'q-123', chatId: 'chat-123', questionNumber: 1, assignedTo: 'u1', assignedToEmail: 'partner@x.ca' });
    expect(html).toContain('class="filter-pill filter-pill--closable chat-assign-pill"');
    expect(html).toContain('data-question-id="q-123"');
    expect(html).toContain('partner@x.ca');
    expect(html).not.toContain('type="checkbox"');

    // Assignee account deleted: no email, but still assigned - keep the pill.
    const orphan = checkboxColumn.render(null, 'display', { _id: 'q-124', chatId: 'chat-124', questionNumber: 2, assignedTo: 'u2', assignedToEmail: '' });
    expect(orphan).toContain('chat-assign-pill');
    expect(orphan).toContain('admin.chatDashboard.assign.unknownAccount');
    expect(orphan).not.toContain('type="checkbox"');
  });

  it('shows a validation error instead of assigning, when Assign chats is clicked with nothing chosen', async () => {
    mockGetAssignable.mockResolvedValue({ users: [{ id: 'u1', email: 'partner@x.ca', relation: 'self' }] });
    DashboardService.getChatDashboard.mockResolvedValueOnce({ recordsTotal: 1, recordsFiltered: 1, data: [] });
    const { container, getByText } = render(<ChatDashboardPage lang="en" />);

    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => { fireEvent.click(applyButton); });
    await waitFor(() => expect(lastOptions).not.toBeNull());
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await act(async () => { fireEvent.click(getByText('admin.chatDashboard.assign.toggleOn')); });
    await waitFor(() => expect(mockGetAssignable).toHaveBeenCalledTimes(1));

    const assignButton = await waitFor(() => getByText(/admin\.chatDashboard\.assign\.assignChats/));
    await act(async () => { fireEvent.click(assignButton); });

    const error = await waitFor(() => getByText('admin.chatDashboard.assign.errorNoExpert'));
    expect(error).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(error));
    expect(DashboardService.assignQuestion).not.toHaveBeenCalled();
  });

  it('unassign pill: confirm -> calls unassignChat -> reloads the table -> moves focus to the outcome message', async () => {
    mockGetAssignable.mockResolvedValue({ users: [] });
    DashboardService.getChatDashboard.mockResolvedValueOnce({ recordsTotal: 1, recordsFiltered: 1, data: [] });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container, getByText } = render(<ChatDashboardPage lang="en" />);

    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => { fireEvent.click(applyButton); });
    await waitFor(() => expect(lastOptions).not.toBeNull());
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await act(async () => { fireEvent.click(getByText('admin.chatDashboard.assign.toggleOn')); });
    // Wait for assign mode to actually be on (jsdom fires the details'
    // toggle event on a later task): turning it on resets the outcome
    // message, so a pill click that races it loses its outcome.
    await waitFor(() => expect(mockGetAssignable).toHaveBeenCalledTimes(1));

    // Simulate DataTables building a row for an already-assigned question:
    // build the real cell HTML via the column's own render (the pill) and
    // put the row in the table body - the page's delegated click handler on
    // the body is what wires the pill.
    const checkboxColumn = lastColumns.find((c) => c.className === 'chat-assign-checkbox-col');
    const rowData = { _id: 'q-123', chatId: 'chat-123', questionNumber: 1, assignedTo: 'u1', assignedToEmail: 'partner@x.ca' };
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.innerHTML = checkboxColumn.render(null, 'display', rowData);
    row.appendChild(cell);
    const tbody = mountedInstances[mountedInstances.length - 1].body;
    document.body.appendChild(tbody);
    tbody.appendChild(row);

    const pill = row.querySelector('button.chat-assign-pill');
    expect(pill).toBeTruthy();
    await act(async () => { fireEvent.click(pill); });

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(DashboardService.unassignQuestion).toHaveBeenCalledWith({ interactionId: 'q-123' }));

    // The click's act() scope ends before the unassign promise settles (the
    // handler doesn't return it), so flush the promise chain inside act
    // before looking for the outcome - otherwise the render lands late in
    // a full-file run.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const outcome = await waitFor(() => getByText('admin.chatDashboard.assign.unassigned'));
    await waitFor(() => expect(document.activeElement).toBe(outcome));

    const lastInstance = mountedInstances[mountedInstances.length - 1];
    expect(lastInstance.ajaxReload).toHaveBeenCalled();

    document.body.removeChild(tbody);
    confirmSpy.mockRestore();
  });

  it('ticking a box counts it, and a redraw restores the tick from the selection', async () => {
    mockGetAssignable.mockResolvedValue({ users: [{ id: 'u1', email: 'partner@x.ca', relation: 'self' }] });
    DashboardService.getChatDashboard.mockResolvedValueOnce({ recordsTotal: 1, recordsFiltered: 1, data: [] });
    const { container, getByText } = render(<ChatDashboardPage lang="en" />);
    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => { fireEvent.click(applyButton); });
    await waitFor(() => expect(lastOptions).not.toBeNull());
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await act(async () => { fireEvent.click(getByText('admin.chatDashboard.assign.toggleOn')); });
    await waitFor(() => expect(mockGetAssignable).toHaveBeenCalledTimes(1));

    const checkboxColumn = lastColumns.find((c) => c.className === 'chat-assign-checkbox-col');
    const instance = mountedInstances[mountedInstances.length - 1];
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.innerHTML = checkboxColumn.render(null, 'display', { _id: 'q-9', chatId: 'chat-9', questionNumber: 1 });
    row.appendChild(cell);
    document.body.appendChild(instance.body);
    instance.body.appendChild(row);
    const box = row.querySelector('input.chat-assign-checkbox');
    await act(async () => { fireEvent.click(box); });
    expect(box.checked).toBe(true);
    expect(row.classList.contains('chat-row--selected')).toBe(true);

    // DataTables rebuilds rows on each fetch: a fresh, unticked row for the
    // same question gets its tick back from the draw sync.
    const row2 = document.createElement('tr');
    const cell2 = document.createElement('td');
    cell2.innerHTML = checkboxColumn.render(null, 'display', { _id: 'q-9', chatId: 'chat-9', questionNumber: 1 });
    row2.appendChild(cell2);
    instance.body.replaceChildren(row2);
    act(() => { instance.handlers.draw(); });
    expect(row2.querySelector('input.chat-assign-checkbox').checked).toBe(true);
    expect(row2.classList.contains('chat-row--selected')).toBe(true);
    document.body.removeChild(instance.body);
  });

  it('Clear all leaves assign mode, so the next Apply does not come back with the column hidden but the mode on', async () => {
    mockGetAssignable.mockResolvedValue({ users: [] });
    DashboardService.getChatDashboard.mockResolvedValueOnce({ recordsTotal: 1, recordsFiltered: 1, data: [] });
    const { container, getByText } = render(<ChatDashboardPage lang="en" />);
    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => { fireEvent.click(applyButton); });
    await waitFor(() => expect(lastOptions).not.toBeNull());
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await act(async () => { fireEvent.click(getByText('admin.chatDashboard.assign.toggleOn')); });
    await waitFor(() => expect(container.querySelector('details.chat-assign-panel').open).toBe(true));

    const clearButton = Array.from(container.querySelectorAll('button')).find((b) => /clear/i.test(b.textContent));
    await act(async () => { fireEvent.click(clearButton); });
    expect(container.querySelector('details.chat-assign-panel')).toBeNull();

    DashboardService.getChatDashboard.mockResolvedValueOnce({ recordsTotal: 1, recordsFiltered: 1, data: [] });
    await act(async () => { fireEvent.click(container.querySelector('#filter-apply-button')); });
    await waitFor(() => expect(lastOptions).not.toBeNull());
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 2 }, vi.fn());
    });
    expect(container.querySelector('details.chat-assign-panel').open).toBe(false);
  });

  it('moves focus into the note on Add a note, and back to Add a note on Clear note', async () => {
    mockGetAssignable.mockResolvedValue({ users: [{ id: 'u1', email: 'partner@x.ca', relation: 'self' }] });
    DashboardService.getChatDashboard.mockResolvedValueOnce({ recordsTotal: 1, recordsFiltered: 1, data: [] });
    const { container, getByText } = render(<ChatDashboardPage lang="en" />);
    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => { fireEvent.click(applyButton); });
    await waitFor(() => expect(lastOptions).not.toBeNull());
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await act(async () => { fireEvent.click(getByText('admin.chatDashboard.assign.toggleOn')); });
    await waitFor(() => expect(mockGetAssignable).toHaveBeenCalledTimes(1));

    await act(async () => { fireEvent.click(getByText('admin.chatDashboard.assign.addNote')); });
    await waitFor(() => expect(document.activeElement).toBe(container.querySelector('#chat-assign-note')));

    await act(async () => { fireEvent.click(getByText('admin.chatDashboard.assign.noteClear')); });
    await waitFor(() => expect(document.activeElement).toBe(getByText('admin.chatDashboard.assign.addNote')));
  });

  it('switches the Assign chats button label once a note is typed, with no separate save step', async () => {
    mockGetAssignable.mockResolvedValue({ users: [{ id: 'u1', email: 'partner@x.ca', relation: 'self' }] });
    DashboardService.getChatDashboard.mockResolvedValueOnce({ recordsTotal: 1, recordsFiltered: 1, data: [] });
    const { container, getByText, queryByText } = render(<ChatDashboardPage lang="en" />);

    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => { fireEvent.click(applyButton); });
    await waitFor(() => expect(lastOptions).not.toBeNull());
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await act(async () => { fireEvent.click(getByText('admin.chatDashboard.assign.toggleOn')); });
    await waitFor(() => expect(mockGetAssignable).toHaveBeenCalledTimes(1));

    expect(getByText(/admin\.chatDashboard\.assign\.assignChats(?!WithNote)/)).toBeTruthy();

    await act(async () => { fireEvent.click(getByText('admin.chatDashboard.assign.addNote')); });
    // No separate "Save note" button anymore.
    expect(queryByText('admin.chatDashboard.assign.noteSubmit')).toBeNull();

    const textarea = container.querySelector('#chat-assign-note');
    await act(async () => { fireEvent.change(textarea, { target: { value: 'please double-check this one' } }); });

    expect(getByText('admin.chatDashboard.assign.assignChatsWithNote')).toBeTruthy();
    expect(queryByText(/^admin\.chatDashboard\.assign\.assignChats$/)).toBeNull();
  });

  // The chatId column's review link routes to the reviewed chat's own
  // pageLanguage, not the admin's current UI language - the transcript
  // (answer bubbles, citation heading) must show what the end user actually
  // saw (docs/coding-agent-docs/official-languages.md Rule 2). The admin's
  // own language rides along separately as the `adminLang` query param, for
  // the review page's own chrome ("How was this answer?", etc.) to use.
  it('routes the chatId review link to the row\'s pageLanguage, carrying the admin\'s own lang as adminLang', async () => {
    const { container } = render(<ChatDashboardPage lang="fr" />);

    // Apply the default filters to mount the table (see the "Clear all" test
    // below for the same pattern).
    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => {
      fireEvent.click(applyButton);
    });
    await waitFor(() => expect(lastColumns).not.toBeNull());

    const chatIdColumn = lastColumns.find((c) => c.data === 'chatId');
    // Row's own pageLanguage is 'en' - the route must land on /en/..., not
    // the admin's own /fr (the page this dashboard itself is rendered in).
    const html = chatIdColumn.render('chat-123', 'display', { pageLanguage: 'en', interactionId: 'int-1' });

    expect(html).toContain('href="/en?chat=chat-123');
    expect(html).not.toContain('href="/fr?chat=chat-123');
    expect(html).toContain('adminLang=fr');
  });

  it('Clear all hides the results entirely rather than auto-fetching the reset defaults (restart, not re-apply)', async () => {
    const { container } = render(<ChatDashboardPage lang="en" />);

    // Apply the default filters to mount the table and get results showing.
    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => {
      fireEvent.click(applyButton);
    });
    await waitFor(() => expect(mountedInstances.length).toBe(1));
    const firstInstance = mountedInstances[0];

    // Simulate DataTables firing its own on-mount fetch with results.
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    expect(container.querySelector('[data-testid="mock-data-table"]')).not.toBeNull();

    // Click "Clear all" (the button inside filter-actions, not the pills-row
    // one - with only default filters applied, every pill is an "info" pill,
    // so the pills-row Clear button never renders).
    const clearButton = container.querySelector('.filter-button-secondary');
    await act(async () => {
      fireEvent.click(clearButton);
    });

    // Clear all is a restart, not "apply the reset defaults": it should hide
    // the whole results block (same as before the very first Apply), not
    // silently auto-fetch and keep showing a result set the user never
    // asked for. No new table mount, no loading overlay, no lingering rows.
    expect(container.querySelector('[data-testid="mock-data-table"]')).toBeNull();
    expect(container.querySelector('.loading-overlay')).toBeNull();
    expect(mountedInstances.length).toBe(1);

    // The outgoing instance's own ajax.reload() must never be called either
    // (there's nothing to reload - the table is gone).
    expect(firstInstance.ajaxReload).not.toHaveBeenCalled();
  });

  it('a later Apply after Clear all mounts a genuinely fresh table (stale tableApiRef does not fool it into a no-op reload)', async () => {
    const { container } = render(<ChatDashboardPage lang="en" />);

    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => {
      fireEvent.click(applyButton);
    });
    await waitFor(() => expect(mountedInstances.length).toBe(1));
    const firstInstance = mountedInstances[0];
    // Let the table's fetch settle: FilterPanel keeps Clear all inert while
    // the page reports filterLoading, as a real table's ajax would have run.
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });

    const clearButton = container.querySelector('.filter-button-secondary');
    await waitFor(() => expect(clearButton.getAttribute('aria-disabled')).toBeNull());
    await act(async () => {
      fireEvent.click(clearButton);
    });
    expect(container.querySelector('[data-testid="mock-data-table"]')).toBeNull();

    // Apply again - handleApplyFilters branches on `tableApiRef.current`: if
    // Clear left it pointing at the destroyed instance, this would silently
    // call .ajax.reload() on it instead of mounting a fresh table, and
    // nothing would ever render again.
    await act(async () => {
      fireEvent.click(applyButton);
    });

    expect(container.querySelector('[data-testid="mock-data-table"]')).not.toBeNull();
    await waitFor(() => expect(mountedInstances.length).toBe(2));
    expect(firstInstance.ajaxReload).not.toHaveBeenCalled();
  });

  it('auto-closes the filter panel on a second Apply after Clear all, not just the first (regression)', async () => {
    DashboardService.getChatDashboard
      .mockResolvedValueOnce({ recordsTotal: 5, recordsFiltered: 5, data: [] })
      .mockResolvedValueOnce({ recordsTotal: 5, recordsFiltered: 5, data: [] });

    const { container } = render(<ChatDashboardPage lang="en" />);
    const getPanel = () => container.querySelector('.filter-panel');

    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });

    // First Apply: results come back (5), so the panel should auto-close.
    await act(async () => {
      fireEvent.click(applyButton);
    });
    await waitFor(() => expect(mountedInstances.length).toBe(1));
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await waitFor(() => expect(getPanel().open).toBe(false));

    // Clear all: FilterPanel forces itself open and arms skipNextAutoClose,
    // expecting to consume it on the next hasAppliedFilters/loading-settled
    // transition. ChatDashboardPage's Clear resets hasAppliedFilters to
    // false instead of re-fetching, so that transition never happens here -
    // the skip must not linger and swallow the *next* Apply's auto-close
    // instead.
    const clearButton = container.querySelector('.filter-button-secondary');
    await act(async () => {
      fireEvent.click(clearButton);
    });
    expect(getPanel().open).toBe(true);

    // Second Apply: results come back again (5) - the panel must auto-close
    // again, the same as the first Apply did. Before the fix, the leftover
    // skip flag from Clear silently ate this close.
    await act(async () => {
      fireEvent.click(applyButton);
    });
    await waitFor(() => expect(mountedInstances.length).toBe(2));
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await waitFor(() => expect(getPanel().open).toBe(false));
  });
});
