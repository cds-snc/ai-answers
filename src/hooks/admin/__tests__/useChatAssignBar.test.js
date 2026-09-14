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

  it('loads the assignable list only once, on the first toggle to on', async () => {
    mockGetAssignable.mockResolvedValue({ users: [{ id: 'u1', email: 'a@x.ca' }] });
    const { result } = renderHook(() => useChatAssignBar());

    act(() => { result.current.toggleAssignMode(); });
    await waitFor(() => expect(result.current.assignableUsers).toHaveLength(1));

    act(() => { result.current.toggleAssignMode(); }); // off
    act(() => { result.current.toggleAssignMode(); }); // on again
    expect(mockGetAssignable).toHaveBeenCalledTimes(1);
  });

  it('surfaces reason: no_institution from the list response', async () => {
    mockGetAssignable.mockResolvedValue({ users: [], reason: 'no_institution' });
    const { result } = renderHook(() => useChatAssignBar());

    act(() => { result.current.toggleAssignMode(); });
    await waitFor(() => expect(result.current.assignableReason).toBe('no_institution'));
  });

  it('resets checked chats and selected assignee when mode is toggled off', async () => {
    mockGetAssignable.mockResolvedValue({ users: [] });
    const { result } = renderHook(() => useChatAssignBar());

    act(() => { result.current.toggleAssignMode(); });
    act(() => { result.current.toggleChatChecked('chat-1', true); });
    expect(result.current.selectedCount).toBe(1);

    act(() => { result.current.toggleAssignMode(); }); // off
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

  it('reports a failure count and keeps the selection when some assigns fail', async () => {
    mockAssignChat
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => useChatAssignBar());

    act(() => {
      result.current.toggleChatChecked('chat-1', true);
      result.current.toggleChatChecked('chat-2', true);
      result.current.setSelectedAssigneeId('u1');
    });

    await act(async () => { await result.current.submitAssign(); });

    expect(result.current.assignStatus).toEqual({ count: 1, isError: true });
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
