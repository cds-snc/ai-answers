// Admin chat Options choices (ChatOptions.js) saved in localStorage so they
// survive refresh/new chats within a session.
const CHAT_OPTION_KEYS = ['selectedAI', 'workflow', 'selectedSearch'];

export const chatOptionStorageKey = (key) => `aiAnswers.${key}`;

// Called on sign-in so every session starts on the Settings defaults - a
// session can end without logout() clearing storage (e.g. it expired while
// the browser was closed).
export function clearChatOptionChoices() {
  try {
    CHAT_OPTION_KEYS.forEach((key) => localStorage.removeItem(chatOptionStorageKey(key)));
  } catch (e) {
    // ignore storage errors
  }
}
