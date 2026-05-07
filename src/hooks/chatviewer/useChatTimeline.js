import { useMemo } from 'react';
import { buildStepTimeline } from '../../utils/chatviewer/chatViewer.js';

export function useChatTimeline(logs) {
  return useMemo(() => buildStepTimeline(logs), [logs]);
}
