export const CHAT_TRANSPORTS = {
  SSE: 'sse',
  NDJSON: 'ndjson',
};

export const CHAT_TRANSPORT_VALUES = Object.values(CHAT_TRANSPORTS);

export const DEFAULT_CHAT_TRANSPORT = CHAT_TRANSPORTS.SSE;

export function normalizeChatTransport(value) {
  return CHAT_TRANSPORT_VALUES.includes(value) ? value : DEFAULT_CHAT_TRANSPORT;
}
