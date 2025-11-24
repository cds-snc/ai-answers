// Deprecated endpoint: session creation is now handled by middleware
// and the client should call `/api/chat/session-info` instead.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return res.status(410).json({ error: 'gone', message: 'chat-session endpoint removed; use /api/chat/session-info' });
}
