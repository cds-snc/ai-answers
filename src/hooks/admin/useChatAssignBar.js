import { useCallback, useRef, useState } from 'react';
import UserService from '../../services/UserService.js';
import DashboardService from '../../services/DashboardService.js';

// Bulk chat-assign toolbar state for ChatDashboardPage.js: toggle, checkbox
// selection (ref-backed so it survives page/redraw without re-render), the
// assignable-experts dropdown, note text, and the assign call itself.
//
// checkedChatIds is a ref (not state) because DataTables owns each row's
// checkbox DOM lifecycle (createdRow) independently of React's render
// cycle - a ref stays valid across redraws without needing the DataTable
// to re-read fresh props. selectedCount is state, purely to drive the UI
// (button label/disabled), bumped manually whenever the ref changes.
export function useChatAssignBar() {
  const [assignMode, setAssignMode] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [assignableReason, setAssignableReason] = useState(null);
  const [assignableLoading, setAssignableLoading] = useState(false);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignStatus, setAssignStatus] = useState(null); // { text, isError }
  const [selectedCount, setSelectedCount] = useState(0);
  // Validation, not a disabled button (see ChatDashboardPage.js) - code is
  // 'no_expert' | 'no_chat', errorCount drives FeedbackInlineError's re-
  // announce-on-repeat same as every other inline form error in this app.
  const [validationErrorCode, setValidationErrorCode] = useState(null);
  const [validationErrorCount, setValidationErrorCount] = useState(0);
  const checkedChatIds = useRef(new Set());

  const resetSelection = useCallback(() => {
    checkedChatIds.current.clear();
    setSelectedCount(0);
  }, []);

  const toggleAssignMode = useCallback(() => {
    setAssignMode((prev) => {
      const next = !prev;
      resetSelection();
      setSelectedAssigneeId('');
      setNoteOpen(false);
      setNoteText('');
      setAssignStatus(null);
      setValidationErrorCode(null);
      if (next && assignableUsers.length === 0 && !assignableLoading) {
        setAssignableLoading(true);
        UserService.getAssignable()
          .then((data) => {
            setAssignableUsers(data.users || []);
            setAssignableReason(data.reason || null);
          })
          .catch(() => setAssignStatus({ loadFailed: true, isError: true }))
          .finally(() => setAssignableLoading(false));
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignableUsers.length, assignableLoading, resetSelection]);

  const toggleChatChecked = useCallback((chatId, checked) => {
    if (checked) checkedChatIds.current.add(chatId);
    else checkedChatIds.current.delete(chatId);
    setSelectedCount(checkedChatIds.current.size);
    if (checked) setValidationErrorCode((prev) => (prev === 'no_chat' ? null : prev));
    // A new pick/uncheck makes the last assign/unassign outcome stale -
    // same "fresh action supersedes it" rule as everything else here.
    setAssignStatus(null);
  }, []);

  const isChatChecked = useCallback((chatId) => checkedChatIds.current.has(chatId), []);

  // Clears the note text and collapses the editor - "Clear", not "Close",
  // so unlike toggling assign mode off this genuinely discards the draft.
  // "Add a note" reappears since it's hidden while noteOpen.
  const clearNote = useCallback(() => {
    setNoteOpen(false);
    setNoteText('');
  }, []);

  // Fires one request per selected chat (bounded batch, not unbounded
  // parallel - see AGENTS.md's DocumentDB round-trip guidance) rather than a
  // dedicated bulk endpoint; kept simple for v1, revisit if selection sizes
  // grow past a page's worth.
  const submitAssign = useCallback(async (onDone) => {
    const chatIds = Array.from(checkedChatIds.current);
    if (!selectedAssigneeId) {
      setValidationErrorCode('no_expert');
      setValidationErrorCount((n) => n + 1);
      return;
    }
    if (chatIds.length === 0) {
      setValidationErrorCode('no_chat');
      setValidationErrorCount((n) => n + 1);
      return;
    }
    setValidationErrorCode(null);
    setAssigning(true);
    setAssignStatus(null);
    const BATCH_SIZE = 5;
    let failures = 0;
    for (let i = 0; i < chatIds.length; i += BATCH_SIZE) {
      const batch = chatIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((chatId) => DashboardService.assignChat({ chatId, assignedTo: selectedAssigneeId, notes: noteText }))
      );
      failures += results.filter((r) => r.status === 'rejected').length;
    }
    setAssigning(false);
    if (failures === 0) {
      // Note text stays visible on success (not cleared) - it's what was
      // just sent with the assignment, not a stale draft.
      setAssignStatus({ count: chatIds.length, isError: false, hadNote: Boolean(noteText.trim()) });
      resetSelection();
      if (onDone) onDone();
    } else {
      setAssignStatus({ count: failures, isError: true });
    }
  }, [selectedAssigneeId, noteText, resetSelection]);

  // Removes an existing assignment (the × pill on an already-assigned row).
  // Caller (ChatDashboardPage.js) is responsible for the window.confirm()
  // gate before calling this, same as every other destructive admin action.
  const [unassigning, setUnassigning] = useState(false);
  const unassignChat = useCallback(async (chatId, onDone) => {
    setUnassigning(true);
    setAssignStatus(null);
    try {
      await DashboardService.unassignChat({ chatId });
      checkedChatIds.current.delete(chatId);
      setSelectedCount(checkedChatIds.current.size);
      setAssignStatus({ isError: false, unassigned: true });
      if (onDone) onDone();
    } catch (error) {
      setAssignStatus({ isError: true, unassignFailed: true });
    } finally {
      setUnassigning(false);
    }
  }, []);

  // A fresh pick clears the "you must choose an expert" error it caused,
  // and the last assign/unassign outcome message - same "edit supersedes
  // the stale outcome" rule as SettingsPage.js.
  const selectAssignee = useCallback((id) => {
    setSelectedAssigneeId(id);
    setValidationErrorCode((prev) => (prev === 'no_expert' ? null : prev));
    setAssignStatus(null);
  }, []);

  const handleNoteTextChange = useCallback((text) => {
    setNoteText(text);
    setAssignStatus(null);
  }, []);

  return {
    assignMode,
    toggleAssignMode,
    assignableUsers,
    assignableReason,
    assignableLoading,
    selectedAssigneeId,
    setSelectedAssigneeId: selectAssignee,
    noteOpen,
    setNoteOpen,
    noteText,
    setNoteText: handleNoteTextChange,
    clearNote,
    validationErrorCode,
    validationErrorCount,
    assigning,
    assignStatus,
    selectedCount,
    toggleChatChecked,
    isChatChecked,
    submitAssign,
    unassigning,
    unassignChat,
  };
}
