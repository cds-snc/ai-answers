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

  const refreshLogs = useCallback(async () => {
    if (!chatId || isRefreshingRef.current) {
      return [];
    }

    isRefreshingRef.current = true;
    setIsRefreshingLogs(true);
    try {
      const data = await DataStoreService.getLogs(chatId);
      const nextLogs = data.logs || [];

      if (activeChatIdRef.current === chatId) {
        setLogs(nextLogs);
      }

      return nextLogs;
    } catch (error) {
      console.error('Error refreshing logs:', error);
      if (activeChatIdRef.current === chatId) {
        setLogs([]);
      }
      return [];
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
