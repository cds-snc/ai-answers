// The client sends its whole messages array: a user and an AI message per
// turn, plus error messages. A turn is one AI answer, not one array entry.
//
// isAiTurn is also hand-copied (ai-turn-check-sync) in
// ConversationIntegrityService.js, ContextAgentService.js and
// AnswerGenerationService.js. Keep them in sync.
export function isAiTurn(m) {
  return Boolean(m?.interaction) && !m.error && m.sender !== 'user' && m.role !== 'user';
}

export function countCompletedTurns(history) {
  return Array.isArray(history) ? history.filter(isAiTurn).length : 0;
}
