/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../AuthService.js', () => ({
  default: { fetch: vi.fn() },
}));

import FeedbackService from '../FeedbackService.js';
import AuthService from '../AuthService.js';

function ok(body) {
  return { ok: true, json: () => Promise.resolve(body) };
}

describe('FeedbackService persist', () => {
  beforeEach(() => {
    AuthService.fetch.mockReset();
  });

  it('saves public feedback on the feedback endpoint', async () => {
    AuthService.fetch.mockResolvedValue(ok({ message: 'Public feedback logged successfully' }));

    const result = await FeedbackService.persistPublicFeedback({
      chatId: 'chat-1',
      interactionId: 'int-1',
      publicFeedback: { feedback: 'yes', publicFeedbackReason: 'clear', publicFeedbackScore: 1 },
    });

    expect(result).toEqual({ message: 'Public feedback logged successfully' });
    expect(AuthService.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = AuthService.fetch.mock.calls[0];
    expect(url).toBe('/api/feedback/feedback-persist-public');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toMatchObject({
      chatId: 'chat-1',
      interactionId: 'int-1',
      publicFeedback: { feedback: 'yes' },
    });
  });

  it('saves expert feedback on the feedback endpoint', async () => {
    AuthService.fetch.mockResolvedValue(ok({ message: 'Expert feedback logged successfully' }));

    const result = await FeedbackService.persistExpertFeedback({
      chatId: 'chat-1',
      interactionId: 'int-1',
      expertFeedback: { totalScore: 80, feedback: 'Accurate.' },
    });

    expect(result).toEqual({ message: 'Expert feedback logged successfully' });
    expect(AuthService.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = AuthService.fetch.mock.calls[0];
    expect(url).toBe('/api/feedback/feedback-persist-expert');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body).expertFeedback).toMatchObject({
      totalScore: 80,
      feedback: 'Accurate.',
    });
  });
});
