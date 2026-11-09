// Conversation history as the chat client really sends it: its whole messages
// array, a user message then an AI message per turn (ChatAppContainer.js).
export const userMsg = (text) => ({ sender: 'user', text });
export const aiMsg = (text) => ({ sender: 'ai', interaction: { answer: { content: text } } });

export const turnsOfHistory = (n) =>
  Array.from({ length: n }, (_v, i) => [userMsg(`q${i + 1}`), aiMsg(`a${i + 1}`)]).flat();
