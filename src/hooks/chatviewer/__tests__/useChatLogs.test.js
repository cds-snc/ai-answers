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
});
