/**
 * @vitest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatAssignBar } from '../useChatAssignBar.js';

const { mockGetAssignable } = vi.hoisted(() => ({ mockGetAssignable: vi.fn() }));
vi.mock('../../../services/UserService.js', () => ({ default: { getAssignable: mockGetAssignable } }));

const { mockAssignChat } = vi.hoisted(() => ({ mockAssignChat: vi.fn() }));
vi.mock('../../../services/DashboardService.js', () => ({ default: { assignChat: mockAssignChat } }));

describe('useChatAssignBar', () => {
  beforeEach(() => {
    mockGetAssignable.mockReset();
    mockAssignChat.mockReset();
  });

  it('setting the same mode again is a no-op (details fires toggle on mount with open=true)', async () => {
    mockGetAssignable.mockResolvedValue({ users: [] });
    const { result } = renderHook(() => useChatAssignBar());
    act(() => { result.current.setAssignMode(true); });
    act(() => { result.current.toggleChatChecked('chat-1', true); });
    act(() => { result.current.setAssignMode(true); });
    expect(result.current.assignMode).toBe(true);
    expect(result.current.selectedCount).toBe(1); // selection not reset
  });

  it('ignores a second submitAssign while one is in flight', async () => {
    let resolveFirst;
    mockAssignChat.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));
    const { result } = renderHook(() => useChatAssignBar());
    act(() => {
      result.current.toggleChatChecked('chat-1', true);
      result.current.setSelectedAssigneeId('u1');
    });
    let first;
    act(() => { first = result.current.submitAssign(); });
    await act(async () => { await result.current.submitAssign(); });
    expect(mockAssignChat).toHaveBeenCalledTimes(1);
    await act(async () => { resolveFirst({}); await first; });
    expect(result.current.assignStatus).toEqual({ count: 1, isError: false, hadNote: false });
  });

  it('loads the assignable list only once, on the first toggle to on', async () => {
    mockGetAssignable.mockResolvedValue({ users: [{ id: 'u1', email: 'a@x.ca' }] });
    const { result } = renderHook(() => useChatAssignBar());

    act(() => { result.current.setAssignMode(true); });
    await waitFor(() => expect(result.current.assignableUsers).toHaveLength(1));

    act(() => { result.current.setAssignMode(false); }); // off
    act(() => { result.current.setAssignMode(true); }); // on again
    expect(mockGetAssignable).toHaveBeenCalledTimes(1);
  });

  it('surfaces reason: no_institution from the list response', async () => {
    mockGetAssignable.mockResolvedValue({ users: [], reason: 'no_institution' });
    const { result } = renderHook(() => useChatAssignBar());

    act(() => { result.current.setAssignMode(true); });
    await waitFor(() => expect(result.current.assignableReason).toBe('no_institution'));
  });

  it('resets checked chats and selected assignee when mode is toggled off', async () => {
    mockGetAssignable.mockResolvedValue({ users: [] });
    const { result } = renderHook(() => useChatAssignBar());

    act(() => { result.current.setAssignMode(true); });
    act(() => { result.current.toggleChatChecked('chat-1', true); });
    expect(result.current.selectedCount).toBe(1);

    act(() => { result.current.setAssignMode(false); }); // off
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.isChatChecked('chat-1')).toBe(false);
  });

  it('submitAssign calls assignChat once per checked chat, with the selected assignee and note', async () => {
    mockAssignChat.mockResolvedValue({});
    const { result } = renderHook(() => useChatAssignBar());

    act(() => {
      result.current.toggleChatChecked('chat-1', true);
      result.current.toggleChatChecked('chat-2', true);
      result.current.setSelectedAssigneeId('u1');
      result.current.setNoteText('please review');
    });

    const onDone = vi.fn();
    await act(async () => { await result.current.submitAssign(onDone); });

    expect(mockAssignChat).toHaveBeenCalledTimes(2);
    expect(mockAssignChat).toHaveBeenCalledWith({ chatId: 'chat-1', assignedTo: 'u1', notes: 'please review' });
    expect(mockAssignChat).toHaveBeenCalledWith({ chatId: 'chat-2', assignedTo: 'u1', notes: 'please review' });
    expect(result.current.selectedCount).toBe(0); // checkboxes cleared on success
    expect(result.current.noteText).toBe('please review'); // note stays visible, not cleared
    expect(result.current.assignStatus).toEqual({ count: 2, isError: false, hadNote: true });
    expect(onDone).toHaveBeenCalled();
    expect(result.current.outcomeFocusCount).toBe(1); // page moves focus onto the outcome
  });

  it('marks hadNote false in assignStatus when no note was sent', async () => {
    mockAssignChat.mockResolvedValue({});
    const { result } = renderHook(() => useChatAssignBar());
    act(() => {
      result.current.toggleChatChecked('chat-1', true);
      result.current.setSelectedAssigneeId('u1');
    });

    await act(async () => { await result.current.submitAssign(); });

    expect(result.current.assignStatus).toEqual({ count: 1, isError: false, hadNote: false });
  });

  it('surfaces a no_expert validation error instead of calling assignChat, when no assignee is picked', async () => {
    const { result } = renderHook(() => useChatAssignBar());
    act(() => { result.current.toggleChatChecked('chat-1', true); });

    await act(async () => { await result.current.submitAssign(); });

    expect(mockAssignChat).not.toHaveBeenCalled();
    expect(result.current.validationErrorCode).toBe('no_expert');
    expect(result.current.validationErrorCount).toBe(1);
  });

  it('surfaces a no_chat validation error instead of calling assignChat, when nothing is checked', async () => {
    const { result } = renderHook(() => useChatAssignBar());
    act(() => { result.current.setSelectedAssigneeId('u1'); });

    await act(async () => { await result.current.submitAssign(); });

    expect(mockAssignChat).not.toHaveBeenCalled();
    expect(result.current.validationErrorCode).toBe('no_chat');
  });

  it('clears the no_expert error as soon as an assignee is picked', async () => {
    const { result } = renderHook(() => useChatAssignBar());
    await act(async () => { await result.current.submitAssign(); });
    expect(result.current.validationErrorCode).toBe('no_expert');

    act(() => { result.current.setSelectedAssigneeId('u1'); });
    expect(result.current.validationErrorCode).toBeNull();
  });

  it('clears the no_chat error as soon as a chat is checked', async () => {
    const { result } = renderHook(() => useChatAssignBar());
    act(() => { result.current.setSelectedAssigneeId('u1'); });
    await act(async () => { await result.current.submitAssign(); });
    expect(result.current.validationErrorCode).toBe('no_chat');

    act(() => { result.current.toggleChatChecked('chat-1', true); });
    expect(result.current.validationErrorCode).toBeNull();
  });

  it('clearNote hides the editor and discards the note text', () => {
    const { result } = renderHook(() => useChatAssignBar());
    act(() => {
      result.current.setNoteOpen(true);
      result.current.setNoteText('unsaved draft');
    });

    act(() => { result.current.clearNote(); });

    expect(result.current.noteOpen).toBe(false);
    expect(result.current.noteText).toBe('');
  });

  it('on a partial failure, reports the failure count, unticks the ones that worked, and reloads', async () => {
    mockAssignChat
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => useChatAssignBar());

    act(() => {
      result.current.toggleChatChecked('chat-1', true);
      result.current.toggleChatChecked('chat-2', true);
      result.current.setSelectedAssigneeId('u1');
    });

    const onDone = vi.fn();
    await act(async () => { await result.current.submitAssign(onDone); });

    expect(result.current.assignStatus).toEqual({ count: 1, isError: true, code: null });
    expect(result.current.isChatChecked('chat-1')).toBe(false); // succeeded
    expect(result.current.isChatChecked('chat-2')).toBe(true); // failed, stays for retry
    expect(result.current.selectedCount).toBe(1);
    expect(onDone).toHaveBeenCalled();
  });

  it('forgetChat drops a chat from the selection without clearing the outcome message', async () => {
    mockAssignChat.mockResolvedValue({});
    const { result } = renderHook(() => useChatAssignBar());
    act(() => { result.current.toggleChatChecked('chat-1', true); result.current.toggleChatChecked('chat-2', true); result.current.setSelectedAssigneeId('u1'); });
    await act(async () => { await result.current.submitAssign(); });
    act(() => { result.current.toggleChatChecked('chat-3', true); });
    act(() => { result.current.forgetChat('chat-3'); });
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.isChatChecked('chat-3')).toBe(false);
  });

  it('reports one shared failure reason as its code (409 already assigned), mixed reasons as none', async () => {
    const conflict = Object.assign(new Error('nope'), { code: 'already_assigned', status: 409 });
    mockAssignChat.mockRejectedValue(conflict);
    const { result } = renderHook(() => useChatAssignBar());
    act(() => { result.current.toggleChatChecked('chat-1', true); result.current.toggleChatChecked('chat-2', true); result.current.setSelectedAssigneeId('u1'); });
    await act(async () => { await result.current.submitAssign(); });
    expect(result.current.assignStatus).toEqual({ count: 2, isError: true, code: 'already_assigned' });

    mockAssignChat.mockReset();
    mockAssignChat.mockRejectedValueOnce(conflict).mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 403 }));
    act(() => { result.current.toggleChatChecked('chat-3', true); result.current.toggleChatChecked('chat-4', true); });
    await act(async () => { await result.current.submitAssign(); });
    expect(result.current.assignStatus).toEqual({ count: 2, isError: true, code: null });
  });

  it('does not reload when every assign failed', async () => {
    mockAssignChat.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useChatAssignBar());
    act(() => {
      result.current.toggleChatChecked('chat-1', true);
      result.current.setSelectedAssigneeId('u1');
    });
    const onDone = vi.fn();
    await act(async () => { await result.current.submitAssign(onDone); });
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.selectedCount).toBe(1);
  });

  it('clears a stale assignStatus when the assignee dropdown, a checkbox, or the note text changes', async () => {
    mockAssignChat.mockResolvedValue({});
    const { result } = renderHook(() => useChatAssignBar());
    act(() => {
      result.current.toggleChatChecked('chat-1', true);
      result.current.setSelectedAssigneeId('u1');
    });
    await act(async () => { await result.current.submitAssign(); });
    expect(result.current.assignStatus).not.toBeNull();

    act(() => { result.current.setSelectedAssigneeId('u2'); });
    expect(result.current.assignStatus).toBeNull();

    act(() => { result.current.toggleChatChecked('chat-1', true); result.current.setSelectedAssigneeId('u1'); });
    await act(async () => { await result.current.submitAssign(); });
    expect(result.current.assignStatus).not.toBeNull();
    act(() => { result.current.toggleChatChecked('chat-2', true); });
    expect(result.current.assignStatus).toBeNull();

    act(() => { result.current.toggleChatChecked('chat-1', true); result.current.setSelectedAssigneeId('u1'); });
    await act(async () => { await result.current.submitAssign(); });
    expect(result.current.assignStatus).not.toBeNull();
    act(() => { result.current.setNoteText('a note'); });
    expect(result.current.assignStatus).toBeNull();
  });
});
