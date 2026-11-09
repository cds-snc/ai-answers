import { describe, it, expect } from 'vitest';
import { countCompletedTurns } from '../conversation-turns.js';
import { userMsg, aiMsg, turnsOfHistory } from '../../../test/conversationHistory.js';

describe('countCompletedTurns', () => {
  it('counts no turns in an empty or missing history', () => {
    expect(countCompletedTurns([])).toBe(0);
    expect(countCompletedTurns(undefined)).toBe(0);
  });

  it('counts one turn per user and AI message pair, not one per message', () => {
    expect(countCompletedTurns(turnsOfHistory(2))).toBe(2);
  });

  it('does not count error messages, even one carrying an interaction', () => {
    const history = [...turnsOfHistory(1), userMsg('q2'), { ...aiMsg('oops'), error: true }];

    expect(countCompletedTurns(history)).toBe(1);
  });

  it('does not count a user message that carries an interaction', () => {
    const history = [{ ...userMsg('q1'), interaction: { answer: {} } }, aiMsg('a1')];

    expect(countCompletedTurns(history)).toBe(1);
  });

  it('counts experimental batch history, which has AI entries only', () => {
    // ExperimentalBatchService.buildConversationHistoryEntry
    expect(countCompletedTurns([aiMsg('a1'), aiMsg('a2')])).toBe(2);
  });
});
