/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatLogs } from '../useChatLogs.js';

const getLogs = vi.fn();

vi.mock('../../../services/DataStoreService.js', () => ({
  default: {
    getLogs: (...args) => getLogs(...args),
  },
}));

describe('useChatLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves { logs, error: null } and updates state on a successful fetch', async () => {
    getLogs.mockResolvedValue({ logs: [{ message: 'a' }, { message: 'b' }] });
    const { result } = renderHook(() => useChatLogs('chat-1'));

    let outcome;
    await act(async () => {
      outcome = await result.current.refreshLogs();
    });

    expect(outcome.error).toBeNull();
    expect(outcome.logs).toHaveLength(2);
    expect(result.current.logs).toHaveLength(2);
  });

  it('resolves { logs: [], error } on a failed fetch, distinct from a real empty success', async () => {
    const fetchError = new Error('network down');
    getLogs.mockRejectedValue(fetchError);
    const { result } = renderHook(() => useChatLogs('chat-1'));

    let outcome;
    await act(async () => {
      outcome = await result.current.refreshLogs();
    });

    expect(outcome.error).toBe(fetchError);
    expect(outcome.logs).toEqual([]);
    expect(result.current.logs).toEqual([]);
  });

  it('resolves { logs: [], error: null } on a genuinely empty success', async () => {
    getLogs.mockResolvedValue({ logs: [] });
    const { result } = renderHook(() => useChatLogs('chat-1'));

    let outcome;
    await act(async () => {
      outcome = await result.current.refreshLogs();
    });

    expect(outcome.error).toBeNull();
    expect(outcome.logs).toEqual([]);
  });

  // Regression: ChatViewer.js's useChatIdLookup can resolve a partial search
  // to a specific chatId *while* a caller is already holding an earlier
  // render's `refreshLogs` reference (a real network round trip inside that
  // search re-renders this hook before the caller's own await resolves).
  // refreshLogs must fetch for the *current* chatId at call time, not
  // whatever chatId its own closure was created with.
  it('fetches for the current chatId even when called via a refreshLogs reference from an earlier render', async () => {
    getLogs.mockImplementation((chatId) => Promise.resolve({ logs: [{ message: `log for ${chatId}` }] }));
    const { result, rerender } = renderHook(({ chatId }) => useChatLogs(chatId), {
      initialProps: { chatId: 'chat-old' },
    });

    const staleRefreshLogs = result.current.refreshLogs;
    rerender({ chatId: 'chat-new' });

    let outcome;
    await act(async () => {
      outcome = await staleRefreshLogs();
    });

    expect(getLogs).toHaveBeenCalledWith('chat-new');
    expect(getLogs).not.toHaveBeenCalledWith('chat-old');
    expect(outcome.logs).toEqual([{ message: 'log for chat-new' }]);
    expect(result.current.logs).toEqual([{ message: 'log for chat-new' }]);
  });
});
