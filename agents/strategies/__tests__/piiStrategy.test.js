import { describe, it, expect } from 'vitest';
import piiStrategy from '../piiStrategy.js';

describe('piiStrategy.parse', () => {
  it('returns null when no pii tags are present', () => {
    const normalized = { content: 'No tags here', model: 'm' };
    const result = piiStrategy.parse(normalized, { question: 'No tags here' });
    expect(result.pii).toBeNull();
    expect(result.blocked).toBe(false);
  });

  it('returns null when pii payload is null', () => {
    const normalized = { content: '<pii>null</pii>', model: 'm' };
    const result = piiStrategy.parse(normalized, { question: 'hello' });
    expect(result.pii).toBeNull();
    expect(result.blocked).toBe(false);
  });

  it('returns null when model echoes text with no XXX marker', () => {
    const question = 'If you are an opting employee...';
    const normalized = { content: `<pii>${question}</pii>`, model: 'm' };
    const result = piiStrategy.parse(normalized, { question });
    expect(result.pii).toBeNull();
    expect(result.blocked).toBe(false);
  });

  it('keeps pii payload when XXX marker is present', () => {
    const normalized = {
      content: '<pii>My account number is XXX and call me at XXX.</pii>',
      model: 'm',
    };
    const result = piiStrategy.parse(normalized, { question: 'My account number is A123' });
    expect(result.pii).toBe('My account number is XXX and call me at XXX.');
    expect(result.blocked).toBe(false);
  });
});
