import { describe, it, expect } from 'vitest';
import { countCompletedTurns, extractCompletedTurns, buildVerifiedHistory } from '../conversation-turns.js';

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

describe('extractCompletedTurns', () => {
  it('returns the question and answer text of each completed turn, in order', () => {
    const history = [
      userMsg('q1'),
      { sender: 'ai', interaction: { question: 'q1', answer: { content: 'a1' }, context: { department: 'X' } } },
      userMsg('q2 that failed'),
      { sender: 'system', error: true, text: 'oops' },
      userMsg('q3'),
      { sender: 'ai', interaction: { question: 'q3', answer: { content: 'a3' } } },
    ];

    expect(extractCompletedTurns(history)).toEqual([
      { question: 'q1', answer: 'a1' },
      { question: 'q3', answer: 'a3' },
    ]);
  });

  it('turns anything that is not text into an empty string', () => {
    const history = [{ sender: 'ai', interaction: { question: { text: 'q' }, answer: { content: ['a'] } } }];

    expect(extractCompletedTurns(history)).toEqual([{ question: '', answer: '' }]);
  });

  it('skips entries that are not messages', () => {
    expect(extractCompletedTurns([null, 'text', 42, {}])).toEqual([]);
    expect(extractCompletedTurns('not an array')).toEqual([]);
  });
});

describe('buildVerifiedHistory', () => {
  it('builds a user and an AI message per turn that counts and extracts the same way', () => {
    const turns = [{ question: 'q1', answer: 'a1' }, { question: 'q2', answer: 'a2' }];

    const history = buildVerifiedHistory(turns);

    expect(history).toEqual([
      { sender: 'user', text: 'q1' },
      { sender: 'ai', interaction: { question: 'q1', answer: { content: 'a1' } } },
      { sender: 'user', text: 'q2' },
      { sender: 'ai', interaction: { question: 'q2', answer: { content: 'a2' } } },
    ]);
    expect(countCompletedTurns(history)).toBe(2);
    expect(extractCompletedTurns(history)).toEqual(turns);
  });
});
