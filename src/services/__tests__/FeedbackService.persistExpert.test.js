import { describe, it, expect, vi } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../AuthService.js', () => ({ default: { fetch: mockFetch } }));
vi.mock('../ClientLoggingService.js', () => ({ default: { info: vi.fn() } }));

import FeedbackService from '../FeedbackService.js';

const save = () => FeedbackService.persistExpertFeedback({
  chatId: 'c-1', interactionId: 'i-1', expertFeedback: { sentence1Score: 80 },
});

describe('FeedbackService.persistExpertFeedback', () => {
  it('passes the server code on a refused save', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Already reviewed', code: 'EXPERT_FEEDBACK_ALREADY_EXISTS' }),
    });

    await expect(save()).rejects.toMatchObject({ code: 'EXPERT_FEEDBACK_ALREADY_EXISTS' });
  });

  it('returns the response on a saved review', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ message: 'OK' }) });

    await expect(save()).resolves.toEqual({ message: 'OK' });
  });
});
