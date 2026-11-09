// How many question-and-answer turns a conversation history already holds.
//
// The chat client sends its whole messages array (ChatAppContainer.js): a user
// message and an AI message per turn, plus any error messages. Count AI
// answers, not array entries, or every turn counts twice.
//
// "Is this an AI turn" follows the same rule as the ai-turn-check-sync copies
// in ConversationIntegrityService.js, ContextAgentService.js and
// AnswerGenerationService.js: an AI-sender message carrying `interaction`.
// Keep it in sync with them.
export function countCompletedTurns(history) {
  if (!Array.isArray(history)) return 0;
  return history.filter((m) => {
    if (!m || m.error || !m.interaction) return false;
    const isUser = m.sender === 'user' || m.role === 'user';
    return !isUser;
  }).length;
}
