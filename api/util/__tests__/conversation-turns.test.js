import { describe, it, expect } from 'vitest';
import { countCompletedTurns } from '../conversation-turns.js';

// Shapes match what the client really sends: ChatAppContainer.js passes its
// whole `messages` array, a user message then an AI message per turn.
const userMsg = (text) => ({ id: text, sender: 'user', text });
const aiMsg = (text) => ({ id: `${text}-ai`, sender: 'ai', interaction: { answer: { content: text } } });

describe('countCompletedTurns', () => {
  it('counts no turns in an empty or missing history', () => {
    expect(countCompletedTurns([])).toBe(0);
    expect(countCompletedTurns(undefined)).toBe(0);
  });

  it('counts one turn per user and AI message pair, not one per message', () => {
    const history = [userMsg('q1'), aiMsg('a1'), userMsg('q2'), aiMsg('a2')];

    expect(countCompletedTurns(history)).toBe(2);
  });

  it('does not count error messages', () => {
    const history = [userMsg('q1'), aiMsg('a1'), userMsg('q2'), { sender: 'system', error: true, text: 'oops' }];

    expect(countCompletedTurns(history)).toBe(1);
  });

  it('does not count a user message that carries an interaction', () => {
    const history = [{ ...userMsg('q1'), interaction: { answer: {} } }, aiMsg('a1')];

    expect(countCompletedTurns(history)).toBe(1);
  });

  it('counts experimental batch history, which has AI entries only', () => {
    // ExperimentalBatchService.buildConversationHistoryEntry
    const history = [aiMsg('a1'), aiMsg('a2')];

    expect(countCompletedTurns(history)).toBe(2);
  });
});
