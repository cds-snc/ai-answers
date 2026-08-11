import { useCallback, useRef, useState } from 'react';
import DataStoreService from '../../services/DataStoreService.js';

export function useChatLogs(chatId) {
  const [logs, setLogs] = useState([]);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const activeChatIdRef = useRef(chatId);
  const isRefreshingRef = useRef(false);

  activeChatIdRef.current = chatId;

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Returns { logs, error } rather than a bare array so callers can tell a
  // genuinely empty result apart from a failed fetch — both would otherwise
  // resolve to the same `[]`, which made a failed refresh indistinguishable
  // from a successful-but-empty one wherever the result was announced.
  const refreshLogs = useCallback(async () => {
    if (!chatId || isRefreshingRef.current) {
      return { logs: [], error: null };
    }

    isRefreshingRef.current = true;
    setIsRefreshingLogs(true);
    try {
      const data = await DataStoreService.getLogs(chatId);
      const nextLogs = data.logs || [];

      if (activeChatIdRef.current === chatId) {
        setLogs(nextLogs);
      }

      return { logs: nextLogs, error: null };
    } catch (error) {
      console.error('Error refreshing logs:', error);
      if (activeChatIdRef.current === chatId) {
        setLogs([]);
      }
      return { logs: [], error };
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshingLogs(false);
    }
  }, [chatId]);

  return {
    clearLogs,
    isRefreshingLogs,
    logs,
    refreshLogs,
  };
}
