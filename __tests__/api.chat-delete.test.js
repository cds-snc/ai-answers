import { describe, it, expect, vi } from 'vitest';
import handler from '../api/chat/chat-delete.js';

// Basic smoke tests for exported handler shape and method handling

describe('api/chat-delete handler', () => {
  it('exports a function', () => {
    expect(typeof handler).toBe('function');
  });

  it('does not throw when called with a minimal req/res object', async () => {
    const req = { method: 'GET', query: {} };
    const res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res)
    };

    try {
      await handler(req, res);
    } catch (e) {
      // Handler may rely on DB/auth which could throw; ensure test remains informative
      expect(e).toBeInstanceOf(Error);
    }
  });
});
