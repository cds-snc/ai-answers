// Chat IDs are generated as uuidv4() (middleware/chat-session.js) - this
// lets a lookup/delete-by-chat-ID field reject an obviously malformed
// value client-side, before spending a round trip on it. A syntactically
// valid-but-nonexistent ID still has to go to the server to find out -
// this only catches the "that's not even shaped like a chat ID" case.
const CHAT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidChatIdFormat = (value) => CHAT_ID_PATTERN.test((value || '').trim());
