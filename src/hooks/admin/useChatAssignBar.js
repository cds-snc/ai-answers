import { useCallback, useRef, useState } from 'react';
import UserService from '../../services/UserService.js';
import DashboardService from '../../services/DashboardService.js';

// Bulk question-assign toolbar state for ChatDashboardPage.js: toggle, checkbox
// selection (ref-backed so it survives page/redraw without re-render), the
// assignable-experts dropdown, note text, and the assign call itself.
//
// checkedQuestionIds (Interaction _ids - assignment is per question, not
// per chat) is a ref (not state) because DataTables owns each row's
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
  // Double-submit guard, alongside the Assign button's visual `disabled`
  // while a request runs (same as SettingsPage's Save).
  const assigningRef = useRef(false);
  const [assignStatus, setAssignStatus] = useState(null); // { text, isError }
  const [selectedCount, setSelectedCount] = useState(0);
  // Validation, not a disabled button (see ChatDashboardPage.js) - code is
  // 'no_expert' | 'no_chat', errorCount drives FeedbackInlineError's re-
  // announce-on-repeat same as every other inline form error in this app.
  const [validationErrorCode, setValidationErrorCode] = useState(null);
  const [validationErrorCount, setValidationErrorCount] = useState(0);
  const checkedQuestionIds = useRef(new Set());

  const resetSelection = useCallback(() => {
    checkedQuestionIds.current.clear();
    setSelectedCount(0);
  }, []);

  // Takes the target state rather than flipping: the caller is a native
  // <details> onToggle, and browsers fire toggle when the open attribute is
  // added on mount too, so a flip would run without a click.
  // Note: the resets and the fetch run inside the updater. Fine without
  // StrictMode (this app has none); restructure if that ever changes.
  const setAssignModeTo = useCallback((next) => {
    setAssignMode((prev) => {
      if (next === prev) return prev;
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

  const toggleQuestionChecked = useCallback((questionId, checked) => {
    if (checked) checkedQuestionIds.current.add(questionId);
    else checkedQuestionIds.current.delete(questionId);
    setSelectedCount(checkedQuestionIds.current.size);
    if (checked) setValidationErrorCode((prev) => (prev === 'no_chat' ? null : prev));
    // A new pick/uncheck makes the last assign/unassign outcome stale -
    // same "fresh action supersedes it" rule as everything else here.
    setAssignStatus(null);
  }, []);

  const isQuestionChecked = useCallback((questionId) => checkedQuestionIds.current.has(questionId), []);

  // Drops a chat from the selection without touching the outcome message -
  // for a row that a reload shows as already assigned (e.g. after a 409),
  // which can no longer be ticked and must not keep counting.
  const forgetQuestion = useCallback((questionId) => {
    if (!checkedQuestionIds.current.delete(questionId)) return;
    setSelectedCount(checkedQuestionIds.current.size);
  }, []);

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
    const questionIds = Array.from(checkedQuestionIds.current);
    if (!selectedAssigneeId) {
      setValidationErrorCode('no_expert');
      setValidationErrorCount((n) => n + 1);
      return;
    }
    if (questionIds.length === 0) {
      setValidationErrorCode('no_chat');
      setValidationErrorCount((n) => n + 1);
      return;
    }
    if (assigningRef.current) return;
    assigningRef.current = true;
    setValidationErrorCode(null);
    setAssigning(true);
    setAssignStatus(null);
    const BATCH_SIZE = 5;
    let failures = 0;
    const failureCodes = new Set();
    for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
      const batch = questionIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((questionId) => DashboardService.assignQuestion({ interactionId: questionId, assignedTo: selectedAssigneeId, notes: noteText }))
      );
      results.forEach((r, idx) => {
        if (r.status === 'rejected') { failures += 1; failureCodes.add(r.reason?.code || (r.reason?.status === 403 ? 'not_allowed' : null)); }
        // Untick the ones that went through, so a retry after a partial
        // failure only re-sends the failures (a re-send would 409).
        else checkedQuestionIds.current.delete(batch[idx]);
      });
    }
    assigningRef.current = false;
    setAssigning(false);
    setSelectedCount(checkedQuestionIds.current.size);
    if (failures === 0) {
      // Note text stays visible on success (not cleared) - it's what was
      // just sent with the assignment, not a stale draft.
      setAssignStatus({ count: questionIds.length, isError: false, hadNote: Boolean(noteText.trim()) });
    } else {
      // One shared reason (all 409, all 403...) gets its own message;
      // mixed reasons fall back to the generic count.
      const codes = [...failureCodes].filter(Boolean);
      const code = codes.length === 1 && failureCodes.size === 1 ? codes[0] : null;
      setAssignStatus({ count: failures, isError: true, code });
    }
    setOutcomeFocusCount((n) => n + 1);
    // Reload even on partial failure so the rows that did assign show
    // their pill instead of a stale checkbox.
    if (failures < questionIds.length && onDone) onDone();
  }, [selectedAssigneeId, noteText]);

  // Removes an existing assignment (the × pill on an already-assigned row).
  // Caller (ChatDashboardPage.js) is responsible for the window.confirm()
  // gate before calling this, same as every other destructive admin action.
  //
  // outcomeFocusCount exists purely for focus management. Two cases lose
  // focus: an unassign, whose pill lives inside the table row that onDone's
  // ajax.reload() destroys; and an assign, whose button is disabled while
  // the request runs (a focused button that becomes disabled drops focus to
  // <body>). ChatDashboardPage.js moves focus onto the assignStatus
  // StatusMessage when this counter changes, same counter-driven
  // useFocusOnChange pattern as UsersPage.js's Save. Not bumped for a failed
  // unassign (the pill is still there) or a failed list load (nothing was
  // disabled).
  const [outcomeFocusCount, setOutcomeFocusCount] = useState(0);
  const unassignQuestion = useCallback(async (questionId, onDone) => {
    setAssignStatus(null);
    try {
      await DashboardService.unassignQuestion({ interactionId: questionId });
      checkedQuestionIds.current.delete(questionId);
      setSelectedCount(checkedQuestionIds.current.size);
      setAssignStatus({ isError: false, unassigned: true });
      setOutcomeFocusCount((n) => n + 1);
      if (onDone) onDone();
    } catch (error) {
      setAssignStatus({ isError: true, unassignFailed: true });
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
    setAssignMode: setAssignModeTo,
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
    toggleQuestionChecked,
    isQuestionChecked,
    forgetQuestion,
    resetSelection,
    submitAssign,
    outcomeFocusCount,
    unassignQuestion,
  };
}
