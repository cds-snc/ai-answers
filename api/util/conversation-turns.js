// The single definition of "a completed turn" in a conversation history.
//
// The chat client sends its whole messages array (ChatAppContainer.js): a user
// message and an AI message per turn, plus any error messages. Only an
// AI-sender message carrying `interaction` is a completed question-and-answer
// turn. User messages, error messages and questions that never got an answer
// are not turns.
//
// ConversationIntegrityService signs and verifies exactly what
// extractCompletedTurns returns, and a chat request only ever hands the
// pipeline buildVerifiedHistory's output - so a field a client sent that is not
// read here cannot reach a prompt. (Experimental batches call the graphs
// directly with a history the server built from its own database; that history
// is not client-held and does not pass through here.) ContextAgentService.js and AnswerGenerationService.js still carry
// their own "is this an AI turn" guard (search "ai-turn-check-sync") as
// defense-in-depth; it must agree with isCompletedTurn below.
function isCompletedTurn(m) {
  if (!m || typeof m !== 'object' || m.error || !m.interaction) return false;
  const isUser = m.sender === 'user' || m.role === 'user';
  return !isUser;
}

const asText = (value) => (typeof value === 'string' ? value : '');

// How many question-and-answer turns a conversation history already holds.
// Counts AI answers, not array entries, or every turn would count twice.
export function countCompletedTurns(history) {
  if (!Array.isArray(history)) return 0;
  return history.filter(isCompletedTurn).length;
}

// The completed turns as plain { question, answer } strings: the only parts of
// a client-held turn the server reads back. Anything that is not a string
// becomes '' so an object can never stand in for text.
export function extractCompletedTurns(history) {
  if (!Array.isArray(history)) return [];
  return history.filter(isCompletedTurn).map((m) => ({
    question: asText(m.interaction.question),
    answer: asText(m.interaction.answer?.content),
  }));
}

// Rebuild a history from completed turns, in the shape the pipeline reads: a
// user message then an AI message per turn. Nothing else the client sent
// (context, citations, extra fields, extra messages) survives.
export function buildVerifiedHistory(turns) {
  return turns.flatMap(({ question, answer }) => [
    { sender: 'user', text: question },
    { sender: 'ai', interaction: { question, answer: { content: answer } } },
  ]);
}
