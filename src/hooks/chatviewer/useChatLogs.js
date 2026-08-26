import { useCallback, useRef, useState } from 'react';
import DataStoreService from '../../services/DataStoreService.js';

export function useChatLogs(chatId) {
  const [logs, setLogs] = useState([]);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const activeChatIdRef = useRef(chatId);
  const isRefreshingRef = useRef(false);

  activeChatIdRef.current = chatId;

  // Returns { logs, error } rather than a bare array so callers can tell a
  // genuinely empty result apart from a failed fetch — both would otherwise
  // resolve to the same `[]`, which made a failed refresh indistinguishable
  // from a successful-but-empty one wherever the result was announced.
  //
  // Reads activeChatIdRef.current at call time rather than closing over the
  // `chatId` parameter directly (and has no dependency array, so this
  // closure never goes stale in the first place). ChatViewer.js's
  // useChatIdLookup can resolve a partial search to a specific chatId
  // (setChatId) *during* the same async call that's about to invoke this
  // function — a real network round trip triggers a React re-render before
  // that call resolves, which updates the ref, but the specific `refreshLogs`
  // reference the caller is holding was still captured at the render *before*
  // that resolution. Reading `chatId` from that closure would fetch logs for
  // the stale, pre-resolution id (e.g. the partial fragment the admin typed)
  // instead of the chat that was actually found - activeChatIdRef is the
  // same ref object across every render of this hook, so reading it here
  // always reflects the latest chatId regardless of which render's
  // `refreshLogs` closure is doing the reading.
  const refreshLogs = useCallback(async () => {
    const targetChatId = activeChatIdRef.current;
    if (!targetChatId || isRefreshingRef.current) {
      return { logs: [], error: null };
    }

    isRefreshingRef.current = true;
    setIsRefreshingLogs(true);
    try {
      const data = await DataStoreService.getLogs(targetChatId);
      const nextLogs = data.logs || [];

      if (activeChatIdRef.current === targetChatId) {
        setLogs(nextLogs);
      }

      return { logs: nextLogs, error: null };
    } catch (error) {
      console.error('Error refreshing logs:', error);
      if (activeChatIdRef.current === targetChatId) {
        setLogs([]);
      }
      return { logs: [], error };
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshingLogs(false);
    }
  }, []);

  return {
    isRefreshingLogs,
    logs,
    refreshLogs,
  };
}
